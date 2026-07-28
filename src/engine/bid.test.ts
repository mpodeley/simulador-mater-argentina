import { describe, expect, it } from 'vitest'
import { simulateYear } from './dispatch'
import { DEFAULT_SCENARIO } from './scenarios'
import { DEFAULT_CONTRACT, evaluateBid, MATER_CAP_USDMWH, type Contract } from './bid'
import { loadMarketData } from './fixtures'

const data = loadMarketData()
const year = simulateYear(data, DEFAULT_SCENARIO)

describe('evaluateBid', () => {
  it('NPV is linear in K and crosses zero at the break-even price', () => {
    const c: Contract = { ...DEFAULT_CONTRACT, settlement: 'mater_ppa', capexUSD: 0, reliabilityUSDMWMonth: 0 }
    const r = evaluateBid(data, DEFAULT_SCENARIO, year, c)
    expect(r.breakEvenK).not.toBeNull()
    const atBreakeven = evaluateBid(data, DEFAULT_SCENARIO, year, { ...c, priceK: r.breakEvenK! })
    expect(Math.abs(atBreakeven.npv)).toBeLessThan(1) // dollars
  })

  it('a higher offered price never lowers NPV for a seller', () => {
    const lo = evaluateBid(data, DEFAULT_SCENARIO, year, { ...DEFAULT_CONTRACT, priceK: 40 })
    const hi = evaluateBid(data, DEFAULT_SCENARIO, year, { ...DEFAULT_CONTRACT, priceK: 80 })
    expect(hi.npv).toBeGreaterThan(lo.npv)
  })

  it('curtailment reduces generation and raises the break-even price', () => {
    const low: Contract = { ...DEFAULT_CONTRACT, curtailmentPct: 4, capexUSD: 200_000_000 }
    const high: Contract = { ...low, curtailmentPct: 16 }
    const rLow = evaluateBid(data, DEFAULT_SCENARIO, year, low)
    const rHigh = evaluateBid(data, DEFAULT_SCENARIO, year, high)
    expect(rHigh.ownGenGWh).toBeLessThan(rLow.ownGenGWh)
    expect(rHigh.breakEvenK!).toBeGreaterThan(rLow.breakEvenK!)
  })

  it('renovar_ppa removes spot risk: annual P&L ≈ gen·(K − varCost)', () => {
    const c: Contract = {
      ...DEFAULT_CONTRACT,
      settlement: 'renovar_ppa',
      genTech: 'solar',
      genCapacityMW: 200,
      genVarCostUSDMWh: 0,
      curtailmentPct: 0,
      reliabilityUSDMWMonth: 0,
      priceK: 55,
      capexUSD: 0,
    }
    const r = evaluateBid(data, DEFAULT_SCENARIO, year, c)
    const expected = r.ownGenGWh * 1000 * c.priceK // K · energy (varCost 0)
    expect(Math.abs(r.annualPnL - expected) / expected).toBeLessThan(0.02)
  })

  it('spot_marginalista adds a fixed reliability payment', () => {
    const c: Contract = { ...DEFAULT_CONTRACT, settlement: 'spot_marginalista', reliabilityUSDMWMonth: 1000, genCapacityMW: 150 }
    const r = evaluateBid(data, DEFAULT_SCENARIO, year, c)
    expect(r.reliabilityRevenue).toBeCloseTo(1000 * 150 * 12, 0)
    expect(r.breakEvenK).toBeNull() // no contract term (vol = 0)
  })

  it('merchant has no contract term, so NPV is flat in K', () => {
    const base: Contract = { ...DEFAULT_CONTRACT, settlement: 'merchant', reliabilityUSDMWMonth: 0 }
    const a = evaluateBid(data, DEFAULT_SCENARIO, year, { ...base, priceK: 20 })
    const b = evaluateBid(data, DEFAULT_SCENARIO, year, { ...base, priceK: 90 })
    expect(a.npv).toBeCloseTo(b.npv, 6)
    expect(a.breakEvenK).toBeNull()
  })

  it('renewable capture price falls as penetration rises (cannibalization)', () => {
    const c: Contract = { ...DEFAULT_CONTRACT, settlement: 'merchant', genTech: 'solar', genCapacityMW: 300, curtailmentPct: 0 }
    const lowPen = simulateYear(data, DEFAULT_SCENARIO)
    const highScen = { ...DEFAULT_SCENARIO, extraSolarMW: 8000 }
    const highPen = simulateYear(data, highScen)
    const capLow = evaluateBid(data, DEFAULT_SCENARIO, lowPen, c).captureUSDMWh
    const capHigh = evaluateBid(data, highScen, highPen, c).captureUSDMWh
    expect(capHigh).toBeLessThan(capLow)
  })

  it('MATER price cap constant is 113 USD/MWh', () => {
    expect(MATER_CAP_USDMWH).toBe(113)
  })
})
