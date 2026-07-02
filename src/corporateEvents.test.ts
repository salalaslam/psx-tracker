import { describe, expect, it } from 'vitest'
import { calcSplitAdjustment } from './corporateEvents'

describe('calcSplitAdjustment', () => {
  it('doubles shares and halves cost for a 1:2 split', () => {
    const result = calcSplitAdjustment(104, 1000, 1, 2)
    expect(result.sharesBefore).toBe(104)
    expect(result.sharesAfter).toBe(208)
    expect(result.costAvgBefore).toBe(1000)
    expect(result.costAvgAfter).toBe(500)
    expect(result.totalInvested).toBe(104_000)
  })

  it('handles jane MTL holding (98 shares)', () => {
    const result = calcSplitAdjustment(98, 850.5, 1, 2)
    expect(result.sharesAfter).toBe(196)
    expect(result.costAvgAfter).toBeCloseTo(425.25)
    expect(result.totalInvested).toBeCloseTo(83_349)
  })

  it('supports reverse splits', () => {
    const result = calcSplitAdjustment(200, 50, 2, 1)
    expect(result.sharesAfter).toBe(100)
    expect(result.costAvgAfter).toBe(100)
    expect(result.totalInvested).toBe(10_000)
  })
})
