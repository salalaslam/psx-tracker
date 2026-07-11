import { roundMoney } from './fees'

/** Lower bound of the good-buy zone as a fraction of average cost. */
export const GOOD_BUY_LOWER_PCT = 0.85
/** Upper bound of the good-buy zone (at average cost). */
export const GOOD_BUY_UPPER_PCT = 1.0
/** Yellow zone extends up to this multiplier on the upper bound. */
export const GOOD_BUY_WARN_PCT = 1.1

export type BuyPriceStatus = 'green' | 'yellow' | 'red'

export interface GoodBuyPriceInfo {
  lower: number
  upper: number
  status: BuyPriceStatus
}

export function calcGoodBuyPrice(
  avgCost: number,
  currentPrice: number | null,
): GoodBuyPriceInfo | null {
  if (avgCost <= 0 || currentPrice === null) return null

  const lower = roundMoney(avgCost * GOOD_BUY_LOWER_PCT)
  const upper = roundMoney(avgCost * GOOD_BUY_UPPER_PCT)
  const warnThreshold = roundMoney(upper * GOOD_BUY_WARN_PCT)

  let status: BuyPriceStatus
  if (currentPrice <= upper) status = 'green'
  else if (currentPrice <= warnThreshold) status = 'yellow'
  else status = 'red'

  return { lower, upper, status }
}

export function buyPriceStatusRank(status: BuyPriceStatus | null): number {
  if (status === 'green') return 0
  if (status === 'yellow') return 1
  if (status === 'red') return 2
  return 3
}

export function buyPriceStatusTextClass(status: BuyPriceStatus | null): string {
  if (status === 'green') return 'text-emerald-400'
  if (status === 'yellow') return 'text-yellow-400'
  if (status === 'red') return 'text-red-400'
  return 'text-gray-600'
}

export function buyPriceStatusDotClass(status: BuyPriceStatus | null): string {
  if (status === 'green') return 'bg-emerald-400'
  if (status === 'yellow') return 'bg-yellow-400'
  if (status === 'red') return 'bg-red-400'
  return 'bg-gray-600'
}
