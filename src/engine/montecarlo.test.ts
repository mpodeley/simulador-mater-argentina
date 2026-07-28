import { describe, expect, it } from 'vitest'
import { runMonteCarlo, DEFAULT_MC, histogram } from './montecarlo'
import { DEFAULT_SCENARIO } from './scenarios'
import { DEFAULT_CONTRACT, type Contract } from './bid'
import { loadMarketData } from './fixtures'

const data = loadMarketData()

describe('runMonteCarlo', () => {
  const opts = { ...DEFAULT_MC, n: 300 }

  it('is deterministic for a fixed seed', () => {
    const a = runMonteCarlo(data, DEFAULT_SCENARIO, DEFAULT_CONTRACT, opts)
    const b = runMonteCarlo(data, DEFAULT_SCENARIO, DEFAULT_CONTRACT, opts)
    expect(a.npvMean).toBe(b.npvMean)
    expect(a.pLossPct).toBe(b.pLossPct)
  })

  it('percentiles are ordered and P(loss) is a valid probability', () => {
    const r = runMonteCarlo(data, DEFAULT_SCENARIO, DEFAULT_CONTRACT, opts)
    expect(r.npvP10).toBeLessThanOrEqual(r.npvP50)
    expect(r.npvP50).toBeLessThanOrEqual(r.npvP90)
    expect(r.var95).toBeLessThanOrEqual(r.npvP10)
    expect(r.cvar95).toBeLessThanOrEqual(r.var95)
    expect(r.pLossPct).toBeGreaterThanOrEqual(0)
    expect(r.pLossPct).toBeLessThanOrEqual(100)
  })

  it('P(loss) falls monotonically as the offered price rises', () => {
    const r = runMonteCarlo(data, DEFAULT_SCENARIO, DEFAULT_CONTRACT, opts)
    for (let i = 1; i < r.pLossByK.length; i++) {
      expect(r.pLossByK[i]).toBeLessThanOrEqual(r.pLossByK[i - 1] + 1e-9)
    }
    // Expected NPV rises with K for a seller with a contract.
    expect(r.expNpvByK[r.expNpvByK.length - 1]).toBeGreaterThan(r.expNpvByK[0])
  })

  it('the robust price gives ≤10% loss probability', () => {
    const r = runMonteCarlo(data, DEFAULT_SCENARIO, DEFAULT_CONTRACT, opts)
    if (r.robustK != null) {
      const atRobust = runMonteCarlo(data, DEFAULT_SCENARIO, { ...DEFAULT_CONTRACT, priceK: r.robustK }, opts)
      expect(atRobust.pLossPct).toBeLessThanOrEqual(10.5)
    }
  })

  it('a dry-skewed base case has higher expected CMg than a wet one', () => {
    const dry: Contract = DEFAULT_CONTRACT
    const rDry = runMonteCarlo(data, { ...DEFAULT_SCENARIO, hydrologyFactor: 0.8 }, dry, opts)
    const rWet = runMonteCarlo(data, { ...DEFAULT_SCENARIO, hydrologyFactor: 1.25 }, dry, opts)
    expect(rDry.avgCmgP50).toBeGreaterThan(rWet.avgCmgP50)
  })

  it('higher node curtailment lowers expected NPV and raises loss probability', () => {
    const low = runMonteCarlo(data, DEFAULT_SCENARIO, { ...DEFAULT_CONTRACT, curtailmentPct: 4 }, opts)
    const high = runMonteCarlo(data, DEFAULT_SCENARIO, { ...DEFAULT_CONTRACT, curtailmentPct: 16 }, opts)
    expect(high.npvMean).toBeLessThan(low.npvMean)
    expect(high.pLossPct).toBeGreaterThanOrEqual(low.pLossPct)
  })

  it('histogram bins cover all samples', () => {
    const r = runMonteCarlo(data, DEFAULT_SCENARIO, DEFAULT_CONTRACT, opts)
    const bins = histogram(r.npvSamples, 20)
    const total = bins.reduce((a, b) => a + b.count, 0)
    expect(total).toBe(r.npvSamples.length)
  })
})
