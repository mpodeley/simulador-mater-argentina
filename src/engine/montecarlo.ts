// Monte Carlo risk engine. Samples the uncertain scenario inputs (hydrology, gas
// price, demand) around the user's base case, runs the dispatch + bid evaluation
// for each draw, and turns the NPV distribution into decision metrics — including
// risk-vs-offer-price curves (expected NPV and probability of loss as a function
// of K), which are the real point of the tool.
//
// Pure and deterministic (seeded PRNG) so runs are reproducible and shareable.

import { simulateYear } from './dispatch'
import { evaluateBid, type Contract } from './bid'
import { clamp, type Scenario } from './scenarios'
import type { MarketData } from './types'

export interface MCOptions {
  n: number
  hydroSigma: number // lognormal σ on the hydrology factor
  gasSigma: number // lognormal σ on the gas price
  demandSigma: number // normal σ on demand growth
  curtailSigma: number // lognormal σ on the node curtailment % (AR key risk)
  seed: number
}

export const DEFAULT_MC: MCOptions = {
  n: 800,
  hydroSigma: 0.16,
  gasSigma: 0.16,
  demandSigma: 0.03,
  curtailSigma: 0.3,
  seed: 12345,
}

export interface MCResult {
  n: number
  atK: number
  npvMean: number
  npvP50: number
  npvP10: number
  npvP90: number
  var95: number // 5th percentile NPV (95% VaR)
  cvar95: number // mean of the worst 5%
  pLossPct: number
  npvSamples: number[] // NPV per draw at the current K (for the histogram)
  avgCmgP10: number
  avgCmgP50: number
  avgCmgP90: number
  // Risk vs offered price:
  kGrid: number[]
  expNpvByK: number[]
  pLossByK: number[]
  p10ByK: number[]
  p90ByK: number[]
  robustK: number | null // lowest K with P(loss) ≤ 10%
}

// --- seeded PRNG (mulberry32) + Box-Muller ---
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng())
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = clamp(p, 0, 1) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function sampleScenario(base: Scenario, opts: MCOptions, rng: () => number): Scenario {
  return {
    ...base,
    hydrologyFactor: clamp(base.hydrologyFactor * Math.exp(opts.hydroSigma * gaussian(rng)), 0.45, 1.6),
    gasPriceUSDMMBtu: clamp(base.gasPriceUSDMMBtu * Math.exp(opts.gasSigma * gaussian(rng)), 0.8, 12),
    demandGrowth: clamp(base.demandGrowth * (1 + opts.demandSigma * gaussian(rng)), 0.6, 1.8),
  }
}

// Curtailment is uncertain and skewed upward (congestion worsens); sample it
// lognormally around the node's base %, floored at 0 and capped at 40%.
function sampleContract(base: Contract, opts: MCOptions, rng: () => number): Contract {
  if (base.curtailmentPct <= 0) return base
  return {
    ...base,
    curtailmentPct: clamp(base.curtailmentPct * Math.exp(opts.curtailSigma * gaussian(rng)), 0, 40),
  }
}

export function runMonteCarlo(
  data: MarketData,
  base: Scenario,
  contract: Contract,
  opts: MCOptions = DEFAULT_MC,
  onProgress?: (fraction: number) => void,
): MCResult {
  const rng = mulberry32(opts.seed)
  // Each draw's NPV is linear in K: npv = intercept + slope·K. Store both so we
  // can re-evaluate the whole distribution across a price grid cheaply.
  const intercepts: number[] = new Array(opts.n)
  const slopes: number[] = new Array(opts.n)
  const avgCmgs: number[] = new Array(opts.n)

  const step = Math.max(1, Math.floor(opts.n / 20))
  for (let i = 0; i < opts.n; i++) {
    const sc = sampleScenario(base, opts, rng)
    const c = sampleContract(contract, opts, rng)
    const year = simulateYear(data, sc)
    const bid = evaluateBid(data, sc, year, c)
    intercepts[i] = bid.npvIntercept
    slopes[i] = bid.npvSlope
    avgCmgs[i] = year.avgCmg
    if (onProgress && i % step === 0) onProgress(i / opts.n)
  }
  if (onProgress) onProgress(1)

  const K = contract.priceK
  const npvSamples = intercepts.map((a, i) => a + slopes[i] * K)
  const sorted = [...npvSamples].sort((a, b) => a - b)
  const tail = sorted.slice(0, Math.max(1, Math.round(0.05 * sorted.length)))
  const cmgSorted = [...avgCmgs].sort((a, b) => a - b)

  // Risk vs offered price.
  const kGrid: number[] = []
  const expNpvByK: number[] = []
  const pLossByK: number[] = []
  const p10ByK: number[] = []
  const p90ByK: number[] = []
  let robustK: number | null = null
  for (let k = 10; k <= 120; k += 2.5) {
    const npvs = intercepts.map((a, i) => a + slopes[i] * k)
    const s = [...npvs].sort((a, b) => a - b)
    const pLoss = (100 * npvs.filter((v) => v < 0).length) / npvs.length
    kGrid.push(k)
    expNpvByK.push(mean(npvs))
    pLossByK.push(pLoss)
    p10ByK.push(percentile(s, 0.1))
    p90ByK.push(percentile(s, 0.9))
    if (robustK === null && pLoss <= 10) robustK = k
  }

  return {
    n: opts.n,
    atK: K,
    npvMean: mean(npvSamples),
    npvP50: percentile(sorted, 0.5),
    npvP10: percentile(sorted, 0.1),
    npvP90: percentile(sorted, 0.9),
    var95: percentile(sorted, 0.05),
    cvar95: mean(tail),
    pLossPct: (100 * npvSamples.filter((v) => v < 0).length) / npvSamples.length,
    npvSamples,
    avgCmgP10: percentile(cmgSorted, 0.1),
    avgCmgP50: percentile(cmgSorted, 0.5),
    avgCmgP90: percentile(cmgSorted, 0.9),
    kGrid,
    expNpvByK,
    pLossByK,
    p10ByK,
    p90ByK,
    robustK,
  }
}

/** Bin NPV samples (M USD) into a histogram for display. */
export function histogram(samples: number[], bins = 24): { x: number; count: number }[] {
  if (samples.length === 0) return []
  const lo = Math.min(...samples)
  const hi = Math.max(...samples)
  const width = (hi - lo) / bins || 1
  const out = Array.from({ length: bins }, (_, i) => ({ x: (lo + width * (i + 0.5)) / 1e6, count: 0 }))
  for (const s of samples) {
    const idx = clamp(Math.floor((s - lo) / width), 0, bins - 1)
    out[idx].count++
  }
  return out
}
