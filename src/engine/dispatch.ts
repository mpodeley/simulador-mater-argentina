// Merit-order economic dispatch — the fundamental spot-price engine.
//
// For each representative (month, hour) cell we build the supply stack (renewables
// and must-run hydro at ~0 cost, then hydro water value, then thermals sorted by
// variable cost), meet demand cheapest-first, and the marginal block sets the
// system marginal price (SMP). Copperplate: no network, no unit commitment.

import { effectiveVarCost } from './fleet'
import type { Scenario } from './scenarios'
import type { Tech } from '../types'
import {
  ALL_TECHS,
  CELLS,
  DAYS_IN_MONTH,
  emptyTechRecord,
  HOURS,
  MONTHS,
  cellIndex,
  type MarketData,
} from './types'

interface Block {
  mw: number
  cost: number
  tech: Tech
}

export interface HourResult {
  smp: number
  demandMW: number
  genByTech: Record<Tech, number>
  curtailedMW: number
}

export interface YearResult {
  cells: HourResult[] // length 288, index = cellIndex(m, h)
  /** MWh represented by 1 MW in each cell (= days_in_month[m]). */
  weightMWh: number[]
  avgCmg: number // energy-weighted USD/MWh
  cmgByMonth: number[] // 12
  cmgByHour: number[] // 24
  genMixGWh: Record<Tech, number>
  demandGWh: number
  nearZeroSharePct: number // % of demand energy served at SMP < 3
  scarcityHoursPct: number // % of cells hitting the price cap
}

/** Build the ascending-cost supply stack for one (month, hour) cell. */
export function buildStack(
  data: MarketData,
  scenario: Scenario,
  m: number,
  h: number,
): Block[] {
  const blocks: Block[] = []
  const cf = (p: { shape: number[][] }) => p.shape[m]?.[h] ?? 0

  // Renewables — price takers at ~0 cost, availability-limited.
  const solarUnit = data.fleet.find((u) => u.tech === 'solar')
  const windUnit = data.fleet.find((u) => u.tech === 'wind')
  const solarCap = (solarUnit?.capacityMW ?? 0) + scenario.extraSolarMW
  const windCap = (windUnit?.capacityMW ?? 0) + scenario.extraWindMW
  blocks.push({ mw: solarCap * cf(data.solar), cost: 0, tech: 'solar' })
  blocks.push({ mw: windCap * cf(data.wind), cost: 0, tech: 'wind' })

  // Hydro — energy-limited (base CF) with seasonal shape and the hydrology knob.
  const hydroUnit = data.fleet.find((u) => u.tech === 'hydro')
  if (hydroUnit) {
    const seasonal = data.hydrology.monthly.median?.[m] ?? 1
    const avail =
      hydroUnit.capacityMW *
      data.hydrology.hydroBaseCF *
      seasonal *
      scenario.hydrologyFactor
    const mustRun = avail * (hydroUnit.mustRunFraction ?? 0)
    // Water value (opportunity cost of stored water) is not static: it collapses
    // toward zero when water is abundant (reservoirs spill) and climbs in drought.
    // Inverse-square in the hydrology factor reproduces both the near-zero
    // oversupply hours and the dry-year price firming.
    const waterValue = Math.min(
      30,
      Math.max(0.5, hydroUnit.varCostUSDMWh / (scenario.hydrologyFactor * scenario.hydrologyFactor)),
    )
    blocks.push({ mw: mustRun, cost: 0, tech: 'hydro' }) // run-of-river spills otherwise
    blocks.push({ mw: avail - mustRun, cost: waterValue, tech: 'hydro' })
  }

  // Thermals + biomass — full capacity available at their (gas-indexed) cost.
  for (const u of data.fleet) {
    if (['solar', 'wind', 'hydro'].includes(u.tech)) continue
    blocks.push({
      mw: u.capacityMW,
      cost: effectiveVarCost(u, scenario.gasPriceUSDMMBtu),
      tech: u.tech,
    })
  }

  // Scenario "new capacity" (generic dispatchable thermal).
  if (scenario.extraThermalMW > 0) {
    blocks.push({
      mw: scenario.extraThermalMW,
      cost: scenario.extraThermalVarCost,
      tech: 'gas_ocgt',
    })
  }

  return blocks.filter((b) => b.mw > 0.001).sort((a, b) => a.cost - b.cost)
}

/** Dispatch a stack to meet demand; returns SMP + generation split by tech. */
export function dispatchHour(
  stack: Block[],
  demandMW: number,
  priceCap: number,
): HourResult {
  const genByTech = emptyTechRecord()
  let remaining = demandMW
  let smp = 0
  let totalMW = 0
  for (const b of stack) {
    totalMW += b.mw
    if (remaining <= 0) break
    const take = Math.min(b.mw, remaining)
    genByTech[b.tech] += take
    remaining -= take
    smp = b.cost
  }
  // Curtailment: zero-cost supply above demand that never got dispatched.
  const dispatched = demandMW - Math.max(0, remaining)
  const curtailedMW = Math.max(0, totalMW - dispatched)
  if (remaining > 0.001) {
    // Supply cannot meet demand → scarcity price.
    smp = priceCap
  }
  return { smp, demandMW, genByTech, curtailedMW }
}

/** Simulate the full representative year (288 cells) for a scenario. */
export function simulateYear(data: MarketData, scenario: Scenario): YearResult {
  const cells: HourResult[] = new Array(CELLS)
  const weightMWh: number[] = new Array(CELLS)
  const cmgByMonth = new Array(MONTHS).fill(0)
  const monthEnergy = new Array(MONTHS).fill(0)
  const cmgByHour = new Array(HOURS).fill(0)
  const hourEnergy = new Array(HOURS).fill(0)
  const genMixGWh = emptyTechRecord()

  let energyWeightedCmg = 0
  let totalDemandMWh = 0
  let nearZeroMWh = 0
  let scarcityCells = 0

  for (let m = 0; m < MONTHS; m++) {
    for (let h = 0; h < HOURS; h++) {
      const i = cellIndex(m, h)
      const w = DAYS_IN_MONTH[m] // MWh represented by 1 MW·h in this cell
      weightMWh[i] = w
      const demandMW = data.demand.peakMW * (data.demand.shape[m]?.[h] ?? 0) * scenario.demandGrowth
      const stack = buildStack(data, scenario, m, h)
      const res = dispatchHour(stack, demandMW, scenario.priceCapUSDMWh)
      cells[i] = res

      const energy = demandMW * w // MWh served in this cell over the year
      totalDemandMWh += energy
      energyWeightedCmg += res.smp * energy
      cmgByMonth[m] += res.smp * energy
      monthEnergy[m] += energy
      cmgByHour[h] += res.smp * energy
      hourEnergy[h] += energy
      if (res.smp < 3) nearZeroMWh += energy
      if (res.smp >= scenario.priceCapUSDMWh) scarcityCells++
      for (const t of ALL_TECHS) genMixGWh[t] += (res.genByTech[t] * w) / 1000
    }
  }

  for (let m = 0; m < MONTHS; m++) cmgByMonth[m] = monthEnergy[m] ? cmgByMonth[m] / monthEnergy[m] : 0
  for (let h = 0; h < HOURS; h++) cmgByHour[h] = hourEnergy[h] ? cmgByHour[h] / hourEnergy[h] : 0

  return {
    cells,
    weightMWh,
    avgCmg: totalDemandMWh ? energyWeightedCmg / totalDemandMWh : 0,
    cmgByMonth,
    cmgByHour,
    genMixGWh,
    demandGWh: totalDemandMWh / 1000,
    nearZeroSharePct: totalDemandMWh ? (100 * nearZeroMWh) / totalDemandMWh : 0,
    scarcityHoursPct: (100 * scarcityCells) / CELLS,
  }
}
