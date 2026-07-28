// Bid evaluation — Argentine MATER PPA ("modelo genérico vendedor").
//
// The seller commits to deliver energy at a fixed price K and is exposed to the
// spot (marginalista, restored by Res. SE 400/2025). Unified per-hour P&L:
//     pnl_h = gen_h·(SMP_h − varCost) + vol_h·(K − SMP_h)
//             └─ merchant margin on own generation ─┘  └─ contract-for-difference ─┘
// where gen_h is CURTAILED (× 1 − curtailmentPct/100) for renewables — in
// Argentina curtailment/congestion is the dominant realized-price driver.
// A fixed reliability payment (USD/MW-month, Res. 400/2025) is added on top.
//
// Settlement presets choose how gen_h / vol_h are assigned:
//   merchant           → vol = 0 (pure spot, no reliability)
//   spot_marginalista  → vol = 0 (sell all at spot) + reliability payment
//   mater_ppa / cfd    → vol = contracted block; gen = own (curtailed); residual at spot
//   renovar_ppa        → vol = gen (all generation at K, sovereign PPA, priority, no spot risk)
//
// P&L is linear in K, so NPV(K) and the break-even K* are closed-form.

import type { Tech } from '../types'
import type { Scenario } from './scenarios'
import type { YearResult } from './dispatch'
import { DAYS_IN_MONTH, HOURS, MONTHS, cellIndex, type MarketData } from './types'

export type Settlement = 'merchant' | 'cfd' | 'mater_ppa' | 'spot_marginalista' | 'renovar_ppa'
export type VolumeShape = 'flat' | 'solar' | 'wind'
export type GenTech = Tech | 'none'
export type Indexation = 'none' | 'gas' | 'cpi'

/** MATER regulatory price ceiling, USD/MWh (Res. 281/2017 + updates). */
export const MATER_CAP_USDMWH = 113

const RENEWABLE: GenTech[] = ['solar', 'wind', 'hydro']

export interface Contract {
  priceK: number // offered price, USD/MWh
  settlement: Settlement
  contractedMW: number
  volumeShape: VolumeShape
  horizonYears: number
  indexation: Indexation
  indexRatePct: number // annual %, applied to K when indexation != 'none'
  priorityDispatch: boolean
  genTech: GenTech
  genCapacityMW: number
  genVarCostUSDMWh: number
  /** Node/transmission curtailment applied to renewable output, % (AR key risk). */
  curtailmentPct: number
  /** Reliability payment (Reserva de Confiabilidad), USD/MW-month. */
  reliabilityUSDMWMonth: number
  waccPct: number
  capexUSD: number
}

export const DEFAULT_CONTRACT: Contract = {
  priceK: 65, // typical MATER PPA
  settlement: 'mater_ppa',
  contractedMW: 100,
  volumeShape: 'wind',
  horizonYears: 15,
  indexation: 'none', // MATER PPAs are USD-denominated, often flat
  indexRatePct: 0,
  priorityDispatch: true,
  genTech: 'wind',
  genCapacityMW: 150,
  genVarCostUSDMWh: 0,
  curtailmentPct: 8, // Referencial A allows up to ~8%
  reliabilityUSDMWMonth: 1000, // base reliability, all generators
  waccPct: 10,
  capexUSD: 230_000_000, // ~150 MW wind at ~1530 USD/kW
}

export interface BidResult {
  npv: number
  annualPnL: number
  breakEvenK: number | null
  ownGenGWh: number
  contractedGWh: number
  captureUSDMWh: number
  avgCmg: number
  // Year-1 cashflow breakdown (USD):
  contractRevenue: number
  spotSettlement: number
  genSpotRevenue: number
  genCost: number
  reliabilityRevenue: number
  npvIntercept: number
  npvSlope: number
}

function volShapeFactor(shape: VolumeShape, data: MarketData, m: number, h: number): number {
  if (shape === 'solar') return data.solar.shape[m]?.[h] ?? 0
  if (shape === 'wind') return data.wind.shape[m]?.[h] ?? 0
  return 1 // flat block
}

function ownGenMW(c: Contract, data: MarketData, scenario: Scenario, year: YearResult, m: number, h: number): number {
  if (c.genTech === 'none' || c.genCapacityMW <= 0) return 0
  // Curtailment only bites variable renewables (transmission congestion).
  const curt = RENEWABLE.includes(c.genTech) ? 1 - c.curtailmentPct / 100 : 1
  if (c.genTech === 'solar') return c.genCapacityMW * (data.solar.shape[m]?.[h] ?? 0) * curt
  if (c.genTech === 'wind') return c.genCapacityMW * (data.wind.shape[m]?.[h] ?? 0) * curt
  if (c.genTech === 'hydro') {
    const seasonal = data.hydrology.monthly.median?.[m] ?? 1
    return c.genCapacityMW * data.hydrology.hydroBaseCF * seasonal * scenario.hydrologyFactor * curt
  }
  // Thermal/nuclear: dispatched when in-merit (SMP ≥ var cost) unless priority.
  const smp = year.cells[cellIndex(m, h)].smp
  const priority = c.priorityDispatch || c.settlement === 'renovar_ppa'
  return priority || smp >= c.genVarCostUSDMWh ? c.genCapacityMW : 0
}

export function evaluateBid(data: MarketData, scenario: Scenario, year: YearResult, c: Contract): BidResult {
  const g = c.indexation === 'none' ? 0 : c.indexRatePct / 100
  const wacc = c.waccPct / 100
  const noContract = c.settlement === 'merchant' || c.settlement === 'spot_marginalista'
  const allGenAtK = c.settlement === 'renovar_ppa'

  // Year-1 constants. constAnnual is K-independent; bCoef is the coefficient of K.
  let aPrime = 0 // Σ [gen·(SMP−varCost) − vol·SMP] · w
  let bCoef = 0 // Σ vol · w
  let ownGenMWh = 0
  let contractedMWh = 0
  let genSpotRev = 0
  let genCost = 0
  let spotOnContract = 0
  let captureNum = 0

  for (let m = 0; m < MONTHS; m++) {
    for (let h = 0; h < HOURS; h++) {
      const i = cellIndex(m, h)
      const w = DAYS_IN_MONTH[m]
      const smp = year.cells[i].smp
      const gen = ownGenMW(c, data, scenario, year, m, h)

      let vol: number
      if (noContract) vol = 0
      else if (allGenAtK) vol = gen // whole generation settled at K
      else vol = c.contractedMW * volShapeFactor(c.volumeShape, data, m, h)

      const genMargin = gen * (smp - c.genVarCostUSDMWh)
      aPrime += (genMargin - vol * smp) * w
      bCoef += vol * w

      ownGenMWh += gen * w
      contractedMWh += vol * w
      genSpotRev += gen * smp * w
      genCost += gen * c.genVarCostUSDMWh * w
      spotOnContract += vol * smp * w
      captureNum += gen * smp * w
    }
  }

  // Fixed reliability payment (K-independent, not indexed).
  const reliabilityAnnual = c.reliabilityUSDMWMonth * c.genCapacityMW * 12
  const constAnnual = aPrime + reliabilityAnnual

  // Discount sums over the horizon.
  let s1 = 0 // Σ df_y
  let s2 = 0 // Σ (1+g)^y · df_y
  for (let y = 0; y < c.horizonYears; y++) {
    const df = 1 / Math.pow(1 + wacc, y)
    s1 += df
    s2 += Math.pow(1 + g, y) * df
  }

  const npvIntercept = constAnnual * s1 - c.capexUSD
  const npvSlope = bCoef * s2
  const npv = npvIntercept + c.priceK * npvSlope
  const annualPnL = constAnnual + c.priceK * bCoef
  const breakEvenK = Math.abs(npvSlope) > 1e-6 ? -npvIntercept / npvSlope : null

  return {
    npv,
    annualPnL,
    breakEvenK,
    ownGenGWh: ownGenMWh / 1000,
    contractedGWh: contractedMWh / 1000,
    captureUSDMWh: ownGenMWh ? captureNum / ownGenMWh : 0,
    avgCmg: year.avgCmg,
    contractRevenue: c.priceK * bCoef,
    spotSettlement: -spotOnContract,
    genSpotRevenue: genSpotRev,
    genCost,
    reliabilityRevenue: reliabilityAnnual,
    npvIntercept,
    npvSlope,
  }
}
