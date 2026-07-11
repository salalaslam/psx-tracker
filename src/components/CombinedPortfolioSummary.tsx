import { Link } from '@tanstack/react-router'
import type { HoldingWithPrice } from '../db.server'
import { calcDividendYieldOnCost, dividendPerShare } from '../dividends'

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcSummary(holdings: HoldingWithPrice[]) {
  let invested = 0
  let current = 0
  let priced = 0
  for (const h of holdings) {
    invested += h.total_invested
    if (h.latest_price !== null) {
      current += h.shares * h.latest_price
      priced++
    }
  }
  const gainLoss = current - invested
  const pct = invested > 0 ? (gainLoss / invested) * 100 : 0
  return { invested, current, gainLoss, pct, priced, total: holdings.length }
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${color ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

export function CombinedPortfolioSummary({
  accounts,
  holdings,
  dividendTotals,
}: {
  accounts: string[]
  holdings: Record<string, HoldingWithPrice[]>
  dividendTotals: {
    total_net: number
    total_shares: number | null
    count: number
  }
}) {
  const summaries = Object.fromEntries(
    accounts.map(account => [account, calcSummary(holdings[account] || [])]),
  )

  const combined = accounts.reduce(
    (acc, account) => {
      const s = summaries[account]
      return {
        invested: acc.invested + s.invested,
        current: acc.current + s.current,
        gainLoss: acc.gainLoss + s.gainLoss,
        pct: 0,
        priced: acc.priced + s.priced,
        total: acc.total + s.total,
      }
    },
    { invested: 0, current: 0, gainLoss: 0, pct: 0, priced: 0, total: 0 },
  )
  combined.pct = combined.invested > 0 ? (combined.gainLoss / combined.invested) * 100 : 0

  const allHoldings = Object.values(holdings).flat()
  const combinedHoldingShares = allHoldings.reduce((sum, h) => sum + h.shares, 0)
  const combinedDividendYield = calcDividendYieldOnCost({
    totalNet: dividendTotals.total_net,
    totalDividendShares: dividendTotals.total_shares,
    invested: combined.invested,
    holdingShares: combinedHoldingShares,
    eventCount: dividendTotals.count,
  })
  const combinedDps = dividendPerShare(dividendTotals.total_net, dividendTotals.total_shares)
  const green = combined.gainLoss >= 0

  return (
    <div className="rounded-xl border border-gray-700 bg-gradient-to-br from-gray-900 to-gray-800 p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold uppercase tracking-wider text-gray-400">Combined Portfolio</h2>
        <Link
          to="/combined-history"
          className="rounded-md bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
        >
          View Price History →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total Invested" value={`₨ ${fmt(combined.invested)}`} />
        <Stat
          label="Current Value"
          value={combined.priced > 0 ? `₨ ${fmt(combined.current)}` : '—'}
        />
        <Stat
          label="Total Gain / Loss"
          value={combined.priced > 0 ? `₨ ${fmt(combined.gainLoss)}` : '—'}
          color={combined.priced > 0 ? (green ? 'text-emerald-400' : 'text-red-400') : undefined}
        />
        <Stat
          label="Overall Return"
          value={combined.priced > 0 ? `${green ? '+' : ''}${combined.pct.toFixed(2)}%` : '—'}
          color={combined.priced > 0 ? (green ? 'text-emerald-400' : 'text-red-400') : undefined}
        />
        <Stat
          label="Net Dividends"
          value={dividendTotals.count > 0 ? `₨ ${fmt(dividendTotals.total_net)}` : '—'}
          sub={dividendTotals.count > 0 ? `${dividendTotals.count} events` : undefined}
          color={dividendTotals.count > 0 ? 'text-emerald-400' : undefined}
        />
        <Stat
          label="Dividend Yield"
          value={combinedDividendYield !== null ? `${combinedDividendYield.toFixed(2)}%` : '—'}
          sub={
            combinedDps != null
              ? `₨ ${combinedDps.toFixed(2)}/sh on cost`
              : combinedDividendYield !== null
                ? 'on cost basis'
                : undefined
          }
          color={combinedDividendYield !== null ? 'text-emerald-400' : undefined}
        />
      </div>
    </div>
  )
}
