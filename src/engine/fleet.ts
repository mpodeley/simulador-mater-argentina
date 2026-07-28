import type { FleetUnit } from '../types'

export type { Tech, FleetUnit } from '../types'

/**
 * Effective short-run marginal cost of a unit, USD/MWh. Gas units carry a heat
 * rate, so their cost tracks the gas-price slider; everything else is static:
 *   varCost = gasPrice[USD/MMBtu] × heatRate[MMBtu/MWh] + VOM
 */
export function effectiveVarCost(unit: FleetUnit, gasPriceUSDMMBtu: number): number {
  if (unit.heatRateMMBtuMWh) {
    return gasPriceUSDMMBtu * unit.heatRateMMBtuMWh + unit.varCostUSDMWh
  }
  return unit.varCostUSDMWh
}

export function findUnit(fleet: FleetUnit[], tech: string): FleetUnit | undefined {
  return fleet.find((u) => u.tech === tech)
}
