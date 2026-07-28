// Shared types: the pipeline envelope + the payload shape of every curated
// dataset under public/data/. UI text is Spanish; identifiers are English.

export interface Envelope<T> {
  generated_at: string | null
  source: string | null
  source_date: string | null
  data: T
  reliability?: string
  note?: string
}

export interface Meta {
  generated_at: string | null
  source: string | null
  source_date: string | null
}

export interface FetchState<T> {
  data: T | null
  loading: boolean
  error: Error | null
  meta: Meta
}

export type Tech =
  | 'hydro'
  | 'nuclear'
  | 'gas_ccgt'
  | 'gas_ocgt'
  | 'coal'
  | 'diesel'
  | 'solar'
  | 'wind'
  | 'biomass'

/** A generation block in the merit-order stack (aggregated per representative unit). */
export interface FleetUnit {
  id: string
  name: string
  tech: Tech
  capacityMW: number
  /** Short-run marginal / variable cost, USD/MWh. Renewables ~0. */
  varCostUSDMWh: number
  /** Fraction of capacity that must run (0..1), e.g. run-of-river hydro. */
  mustRunFraction?: number
  /** For gas units: heat rate (MMBtu/MWh) so var cost tracks the gas-price slider. */
  heatRateMMBtuMWh?: number
}

/** 12 months × 24 hours matrix (rows = month 0..11, cols = hour 0..23). */
export type MonthHourMatrix = number[][]

export interface DemandProfile {
  peakMW: number
  annualGWh: number
  /** Fraction of peak (0..1) for each month/hour. */
  shape: MonthHourMatrix
}

export interface ResourceProfile {
  /** Capacity factor (0..1) for each month/hour. */
  shape: MonthHourMatrix
}

export interface HydrologyScenarios {
  /** Annual capacity factor of hydro (energy limit): avail = cap × CF × monthly × factor. */
  hydroBaseCF: number
  /** Named annual scaling of hydro energy availability. */
  scenarios: { name: string; label: string; factor: number }[]
  /** Monthly seasonal shape (avg ~1.0) per named scenario. */
  monthly: Record<string, number[]>
}

export interface CmgHistoryRow {
  month: string // YYYY-MM
  cmg_usd_mwh: number
}

/** Monthly generation by technology, GWh. Real from CAMMESA `demanda-svc`. */
export interface GenerationMixRow {
  month: string // YYYY-MM
  hydro: number
  nuclear: number
  gas: number
  wind: number
  solar: number
  biomass: number
  other: number
}

/** MATER dispatch-priority allocation round. */
export interface MaterResultRow {
  round: string // e.g. "2025-Q3"
  year: number
  tech: string
  awardedMW: number | null
  priority: string
  priceUSDMWh: number | null
  reliability: 'verified' | 'approx' | 'unreliable'
  note?: string
}

/** RenovAr awarded prices (dormant program; reference). */
export interface RenovarRow {
  name: string
  year: number
  awardedMW: number | null
  periodo: string
  priceUSDMWh: number | null
  reliability: 'verified' | 'approx' | 'unreliable'
  note?: string
}

/** Curtailment preset per region/node (the dominant AR price driver). */
export interface CurtailmentNode {
  id: string
  region: string
  tech: string
  curtailmentPct: number
  note?: string
}

export interface FxRates {
  oficial: number
  mayorista: number
  blue: number
  mep: number
  ccl: number
  as_of: string
}

/** Live SADI snapshot from CAMMESA demanda-svc. */
export interface SadiSnapshot {
  as_of: string
  demand_mw: number
  temp_c: number | null
  total_mw: number
  mix_mw: { hidraulico: number; termico: number; nuclear: number; renovable: number; importacion: number }
}

export interface SourceRow {
  id: string
  name: string
  url: string
  note: string
  reliability: 'verified' | 'approx' | 'unreliable'
  cors: 'live' | 'preprocess'
}
