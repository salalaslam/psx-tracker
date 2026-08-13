import { describe, expect, it } from 'vitest'
import type { LedgerEvent } from './ledger'
import { replayLedger } from './ledger'

function transaction(
  id: number,
  side: 'buy' | 'sell',
  shares: number,
  costPerShare: number,
  tradedAt: string,
  symbol = 'ABC',
): LedgerEvent {
  return {
    kind: 'transaction',
    id,
    symbol,
    side,
    shares,
    cost_per_share: costPerShare,
    traded_at: tradedAt,
  }
}

function split(
  id: number,
  effectiveDate: string,
  ratioFrom: number,
  ratioTo: number,
  symbol = 'ABC',
): LedgerEvent {
  return {
    kind: 'split',
    id,
    symbol,
    effective_date: effectiveDate,
    ratio_from: ratioFrom,
    ratio_to: ratioTo,
  }
}

describe('replayLedger', () => {
  it('computes buy and sell running balances without changing average cost on sale', () => {
    const result = replayLedger([
      transaction(1, 'buy', 10, 100, '2025-01-01T09:00:00Z'),
      transaction(2, 'buy', 10, 200, '2025-01-02T09:00:00Z'),
      transaction(3, 'sell', 5, 250, '2025-01-03T09:00:00Z'),
    ])

    expect(result.transactionBalances.get(1)).toEqual({
      shares_after: 10,
      total_invested_after: 1_000,
    })
    expect(result.transactionBalances.get(2)).toEqual({
      shares_after: 20,
      total_invested_after: 3_000,
    })
    expect(result.transactionBalances.get(3)).toEqual({
      shares_after: 15,
      total_invested_after: 2_250,
    })
  })

  it('closes a position when all shares are sold', () => {
    const result = replayLedger([
      transaction(1, 'buy', 8, 125, '2025-01-01T09:00:00Z'),
      transaction(2, 'sell', 8, 150, '2025-01-02T09:00:00Z'),
    ])

    expect(result.transactionBalances.get(2)).toEqual({
      shares_after: 0,
      total_invested_after: 0,
    })
    expect(result.positions.has('ABC')).toBe(false)
  })

  it('throws when a sale exceeds the historical position', () => {
    expect(() => replayLedger([
      transaction(1, 'buy', 5, 100, '2025-01-01T09:00:00Z'),
      transaction(2, 'sell', 6, 110, '2025-01-02T09:00:00Z'),
    ])).toThrow('Cannot sell 6 ABC: only 5 shares held')
  })

  it('applies a split between two buys', () => {
    const result = replayLedger([
      transaction(3, 'buy', 10, 60, '2025-01-03T09:00:00Z'),
      split(2, '2025-01-02', 1, 2),
      transaction(1, 'buy', 10, 100, '2025-01-01T09:00:00Z'),
    ])

    expect(result.transactionBalances.get(1)?.shares_after).toBe(10)
    expect(result.transactionBalances.get(3)).toEqual({
      shares_after: 30,
      total_invested_after: 1_600,
    })
    expect(result.positions.get('ABC')).toEqual({
      shares: 30,
      total_invested: 1_600,
    })
  })

  it('applies a split after the final transaction without creating a row balance', () => {
    const result = replayLedger([
      transaction(1, 'buy', 10, 100, '2025-01-01T09:00:00Z'),
      split(2, '2025-01-10', 1, 2),
    ])

    expect(result.transactionBalances.get(1)?.shares_after).toBe(10)
    expect(result.transactionBalances.size).toBe(1)
    expect(result.positions.get('ABC')?.shares).toBe(20)
  })

  it('orders same-date transactions before splits and same-date splits by id', () => {
    const result = replayLedger([
      split(3, '2025-01-01', 1, 2),
      split(2, '2025-01-01', 2, 1),
      transaction(1, 'buy', 5, 100, '2025-01-01T23:59:00Z'),
    ])

    expect(result.transactionBalances.get(1)?.shares_after).toBe(5)
    expect(result.positions.get('ABC')?.shares).toBe(6)
    expect(result.positions.get('ABC')?.total_invested).toBe(500)
  })

  it('recomputes downstream balances when a mid-history row is inserted', () => {
    const result = replayLedger([
      transaction(1, 'buy', 10, 100, '2025-01-01T09:00:00Z'),
      transaction(3, 'sell', 5, 200, '2025-01-03T09:00:00Z'),
      transaction(2, 'buy', 10, 200, '2025-01-02T09:00:00Z'),
    ])

    expect(result.transactionBalances.get(2)).toEqual({
      shares_after: 20,
      total_invested_after: 3_000,
    })
    expect(result.transactionBalances.get(3)).toEqual({
      shares_after: 15,
      total_invested_after: 2_250,
    })
  })
})
