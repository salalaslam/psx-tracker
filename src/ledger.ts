import { calcSplitAdjustment } from './corporateEvents'

export interface LedgerPosition {
  shares: number
  total_invested: number
}

export interface LedgerTransactionEvent {
  kind: 'transaction'
  id: number
  symbol: string
  side: 'buy' | 'sell'
  shares: number
  cost_per_share: number
  traded_at: string
}

export interface LedgerSplitEvent {
  kind: 'split'
  id: number
  symbol: string
  effective_date: string
  ratio_from: number
  ratio_to: number
}

export type LedgerEvent = LedgerTransactionEvent | LedgerSplitEvent

export interface TransactionBalance {
  shares_after: number
  total_invested_after: number
}

export interface LedgerReplayResult {
  transactionBalances: Map<number, TransactionBalance>
  positions: Map<string, LedgerPosition>
}

function eventDate(event: LedgerEvent): string {
  return event.kind === 'transaction'
    ? event.traded_at.slice(0, 10)
    : event.effective_date
}

function compareEvents(a: LedgerEvent, b: LedgerEvent): number {
  const dateComparison = eventDate(a).localeCompare(eventDate(b))
  if (dateComparison !== 0) return dateComparison

  // All transactions on date D precede splits effective on D. Transactions
  // retain traded_at/id order, while same-date splits are ordered by id.
  if (a.kind !== b.kind) return a.kind === 'transaction' ? -1 : 1
  if (a.kind === 'transaction' && b.kind === 'transaction') {
    return a.traded_at.localeCompare(b.traded_at) || a.id - b.id
  }
  return a.id - b.id
}

export function replayLedger(events: readonly LedgerEvent[]): LedgerReplayResult {
  const transactionBalances = new Map<number, TransactionBalance>()
  const positions = new Map<string, LedgerPosition>()

  for (const event of [...events].sort(compareEvents)) {
    const previous = positions.get(event.symbol)

    if (event.kind === 'split') {
      if (!previous || previous.shares <= 0) {
        throw new Error(
          `Cannot apply split ${event.id} for ${event.symbol}: no shares held`,
        )
      }
      const adjustment = calcSplitAdjustment(
        previous.shares,
        previous.total_invested / previous.shares,
        event.ratio_from,
        event.ratio_to,
      )
      positions.set(event.symbol, {
        shares: adjustment.sharesAfter,
        total_invested: adjustment.totalInvested,
      })
      continue
    }

    let next: LedgerPosition
    if (event.side === 'buy') {
      next = {
        shares: (previous?.shares ?? 0) + event.shares,
        total_invested:
          (previous?.total_invested ?? 0) + event.shares * event.cost_per_share,
      }
    } else {
      if (!previous || event.shares > previous.shares) {
        throw new Error(
          `Cannot sell ${event.shares} ${event.symbol}: only ${previous?.shares ?? 0} shares held`,
        )
      }
      const shares = previous.shares - event.shares
      next = shares === 0
        ? { shares: 0, total_invested: 0 }
        : {
            shares,
            total_invested:
              (previous.total_invested / previous.shares) * shares,
          }
    }

    transactionBalances.set(event.id, {
      shares_after: next.shares,
      total_invested_after: next.total_invested,
    })
    if (next.shares === 0) positions.delete(event.symbol)
    else positions.set(event.symbol, next)
  }

  return { transactionBalances, positions }
}
