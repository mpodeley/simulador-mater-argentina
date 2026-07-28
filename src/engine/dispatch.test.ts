import { describe, expect, it } from 'vitest'
import { buildStack, dispatchHour, simulateYear } from './dispatch'
import { DEFAULT_SCENARIO, type Scenario } from './scenarios'
import { loadMarketData } from './fixtures'
import type { Tech } from '../types'

const data = loadMarketData()

describe('dispatchHour (merit order)', () => {
  const stack = [
    { mw: 100, cost: 0, tech: 'solar' as Tech },
    { mw: 200, cost: 20, tech: 'gas_ccgt' as Tech },
    { mw: 150, cost: 50, tech: 'gas_ocgt' as Tech },
  ]

  it('the marginal block sets the price', () => {
    expect(dispatchHour(stack, 250, 250).smp).toBe(20) // 100 solar + 150 of gas_ccgt
    expect(dispatchHour(stack, 350, 250).smp).toBe(50) // into gas_ocgt
  })

  it('zero-cost supply above demand → price 0 + curtailment', () => {
    const r = dispatchHour(stack, 80, 250)
    expect(r.smp).toBe(0)
    expect(r.curtailedMW).toBeGreaterThan(0)
  })

  it('demand above total supply → scarcity price cap', () => {
    expect(dispatchHour(stack, 900, 250).smp).toBe(250)
  })
})

describe('simulateYear calibration (curated data)', () => {
  it('median scenario lands in a realistic marginal-energy band', () => {
    const y = simulateYear(data, DEFAULT_SCENARIO)
    // AR marginal-energy cost (gas-set) ~30-40 USD/MWh (below the all-in monómico).
    expect(y.avgCmg).toBeGreaterThan(20)
    expect(y.avgCmg).toBeLessThan(50)
  })

  it('gas is the largest slice of the generation mix', () => {
    const y = simulateYear(data, DEFAULT_SCENARIO)
    const mix = y.genMixGWh
    const gas = mix.gas_ccgt + mix.gas_ocgt
    expect(gas).toBeGreaterThan(mix.hydro)
    expect(gas).toBeGreaterThan(mix.nuclear)
    expect(mix.hydro).toBeGreaterThan(mix.solar) // hydro still a major slice
  })

  it('a dry year with pricier gas raises the average CMg', () => {
    const wet: Scenario = { ...DEFAULT_SCENARIO, hydrologyFactor: 1.15, gasPriceUSDMMBtu: 2.5 }
    const dry: Scenario = { ...DEFAULT_SCENARIO, hydrologyFactor: 0.8, gasPriceUSDMMBtu: 5 }
    expect(simulateYear(data, wet).avgCmg).toBeLessThan(simulateYear(data, dry).avgCmg)
  })

  it('higher demand raises the average CMg', () => {
    const base = simulateYear(data, DEFAULT_SCENARIO).avgCmg
    const high = simulateYear(data, { ...DEFAULT_SCENARIO, demandGrowth: 1.2 }).avgCmg
    expect(high).toBeGreaterThan(base)
  })
})

describe('buildStack', () => {
  it('is sorted ascending by cost and drops empty blocks', () => {
    const stack = buildStack(data, DEFAULT_SCENARIO, 5, 20) // June, evening
    for (let i = 1; i < stack.length; i++) {
      expect(stack[i].cost).toBeGreaterThanOrEqual(stack[i - 1].cost)
    }
    expect(stack.every((b) => b.mw > 0)).toBe(true)
  })
})
