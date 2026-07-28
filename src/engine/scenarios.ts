// Deterministic scenario: the set of assumptions the user turns into a spot-price
// path. One Scenario -> one representative year of hourly marginal cost.

export interface Scenario {
  /** Hydro energy availability multiplier. ~0.75 dry, 1.0 median, 1.2 wet. */
  hydrologyFactor: number
  /** Demand scaling vs. the base profile (growth or contraction). */
  demandGrowth: number
  /** Camisea gas price, USD/MMBtu — shifts every gas unit's variable cost. */
  gasPriceUSDMMBtu: number
  /** Extra installed renewable capacity (MW) added on top of the base fleet. */
  extraSolarMW: number
  extraWindMW: number
  /** Extra dispatchable thermal capacity (MW) and its variable cost. */
  extraThermalMW: number
  extraThermalVarCost: number
  /** Scarcity price when supply cannot meet demand, USD/MWh. */
  priceCapUSDMWh: number
}

export const DEFAULT_SCENARIO: Scenario = {
  hydrologyFactor: 1.0,
  demandGrowth: 1.0,
  gasPriceUSDMMBtu: 3.5,
  extraSolarMW: 0,
  extraWindMW: 0,
  extraThermalMW: 0,
  extraThermalVarCost: 80,
  priceCapUSDMWh: 250,
}

/** Clamp helper for slider-driven values. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
