import { describe, expect, it } from 'vitest'
import { buyPriceStatusRank, calcGoodBuyPrice } from './goodBuyPrice'

describe('calcGoodBuyPrice', () => {
  it('returns null when avg cost or price is missing', () => {
    expect(calcGoodBuyPrice(0, 100)).toBeNull()
    expect(calcGoodBuyPrice(100, null)).toBeNull()
  })

  it('marks green at or below average cost', () => {
    expect(calcGoodBuyPrice(100, 100)?.status).toBe('green')
    expect(calcGoodBuyPrice(100, 85)?.status).toBe('green')
    expect(calcGoodBuyPrice(100, 70)?.status).toBe('green')
  })

  it('marks yellow slightly above average cost', () => {
    expect(calcGoodBuyPrice(100, 105)?.status).toBe('yellow')
    expect(calcGoodBuyPrice(100, 110)?.status).toBe('yellow')
  })

  it('marks red well above average cost', () => {
    expect(calcGoodBuyPrice(100, 111)?.status).toBe('red')
  })

  it('computes range from average cost', () => {
    expect(calcGoodBuyPrice(100, 90)).toEqual({
      lower: 85,
      upper: 100,
      status: 'green',
    })
  })
})

describe('buyPriceStatusRank', () => {
  it('orders green before yellow before red', () => {
    expect(buyPriceStatusRank('green')).toBeLessThan(buyPriceStatusRank('yellow'))
    expect(buyPriceStatusRank('yellow')).toBeLessThan(buyPriceStatusRank('red'))
  })
})
