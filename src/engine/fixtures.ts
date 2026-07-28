// Test-only helper: load the curated JSON from public/data and unwrap the
// {generated_at, data} envelope into a MarketData bundle.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { MarketData } from './types'

function load<T>(name: string): T {
  const raw = JSON.parse(readFileSync(resolve('public/data', name), 'utf-8'))
  return (raw && typeof raw === 'object' && 'data' in raw ? raw.data : raw) as T
}

export function loadMarketData(): MarketData {
  return {
    fleet: load('fleet.json'),
    demand: load('demand_profile.json'),
    solar: load('solar_profile.json'),
    wind: load('wind_profile.json'),
    hydrology: load('hydrology_scenarios.json'),
  }
}
