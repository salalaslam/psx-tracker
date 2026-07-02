import { describe, expect, it } from 'vitest'
import { calcSplitAdjustment } from './corporateEvents'

describe('calcSplitAdjustment', () => {
  it('doubles shares and halves cost for a 1:2 split', () => {
    const result = calcSplitAdjustment(100, 1000, 1, 2)
    expect(result.sharesBefore).toBe(100)
    expect(result.sharesAfter).toBe(200)
    expect(result.costAvgBefore).toBe(1000)
    expect(result.costAvgAfter).toBe(500)
    expect(result.totalInvested).toBe(100_000)
  })

  it('handles a fractional cost basis', () => {
    const result = calcSplitAdjustment(60, 850.5, 1, 2)
    expect(result.sharesAfter).toBe(120)
    expect(result.costAvgAfter).toBeCloseTo(425.25)
    expect(result.totalInvested).toBeCloseTo(51_030)
  })

  it('supports reverse splits', () => {
    const result = calcSplitAdjustment(200, 50, 2, 1)
    expect(result.sharesAfter).toBe(100)
    expect(result.costAvgAfter).toBe(100)
    expect(result.totalInvested).toBe(10_000)
  })
})
