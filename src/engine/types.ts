// Engine input bundle. The React app loads the curated JSON via hooks and hands
// these to the pure functions in dispatch.ts / bid.ts (no React, no fetch here).

import type {
  DemandProfile,
  FleetUnit,
  HydrologyScenarios,
  ResourceProfile,
  Tech,
} from '../types'

export interface MarketData {
  fleet: FleetUnit[]
  demand: DemandProfile
  solar: ResourceProfile
  wind: ResourceProfile
  hydrology: HydrologyScenarios
}

export const MONTHS = 12
export const HOURS = 24
export const CELLS = MONTHS * HOURS
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Cell index for (month, hour). */
export const cellIndex = (m: number, h: number) => m * HOURS + h

export const ALL_TECHS: Tech[] = [
  'hydro',
  'nuclear',
  'gas_ccgt',
  'gas_ocgt',
  'coal',
  'diesel',
  'solar',
  'wind',
  'biomass',
]

export function emptyTechRecord(): Record<Tech, number> {
  return {
    hydro: 0,
    nuclear: 0,
    gas_ccgt: 0,
    gas_ocgt: 0,
    coal: 0,
    diesel: 0,
    solar: 0,
    wind: 0,
    biomass: 0,
  }
}
