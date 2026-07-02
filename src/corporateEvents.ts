export type CorporateEventType = 'split'

export interface SplitAdjustment {
  sharesBefore: number
  sharesAfter: number
  costAvgBefore: number
  costAvgAfter: number
  totalInvested: number
}

/** Apply a forward split (e.g. 1:2 — one old share becomes two new shares). */
export function calcSplitAdjustment(
  shares: number,
  costAvg: number,
  ratioFrom: number,
  ratioTo: number,
): SplitAdjustment {
  if (!Number.isInteger(shares) || shares <= 0) {
    throw new Error('Shares must be a positive integer')
  }
  if (!Number.isFinite(costAvg) || costAvg <= 0) {
    throw new Error('Cost average must be a positive number')
  }
  if (!Number.isInteger(ratioFrom) || ratioFrom <= 0) {
    throw new Error('Ratio "from" must be a positive integer')
  }
  if (!Number.isInteger(ratioTo) || ratioTo <= 0) {
    throw new Error('Ratio "to" must be a positive integer')
  }

  const factor = ratioTo / ratioFrom
  const sharesAfter = Math.round(shares * factor)
  const totalInvested = shares * costAvg
  const costAvgAfter = totalInvested / sharesAfter

  return {
    sharesBefore: shares,
    sharesAfter,
    costAvgBefore: costAvg,
    costAvgAfter,
    totalInvested,
  }
}

export function formatSplitRatio(ratioFrom: number, ratioTo: number): string {
  return `${ratioFrom}:${ratioTo}`
}

export function isCorporateEventType(value: string): value is CorporateEventType {
  return value === 'split'
}
