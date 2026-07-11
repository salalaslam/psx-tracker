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

export function AccountSummaryCard({
  label,
  account,
  holdings,
  dividendNet,
  dividendCount,
  dividendShares,
}: {
  label: string
  account: string
  holdings: HoldingWithPrice[]
  dividendNet: number
  dividendCount: number
  dividendShares: number | null
}) {
  const s = calcSummary(holdings)
  const holdingShares = holdings.reduce((sum, h) => sum + h.shares, 0)
  const green = s.gainLoss >= 0
  const dividendYield = calcDividendYieldOnCost({
    totalNet: dividendNet,
    totalDividendShares: dividendShares,
    invested: s.invested,
    holdingShares,
    eventCount: dividendCount,
  })
  const dps = dividendPerShare(dividendNet, dividendShares)
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-200">{label}</h2>
        <Link
          to="/account/$name"
          params={{ name: account }}
          className="rounded-md bg-gray-800 px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
        >
          View Details →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Invested" value={`₨ ${fmt(s.invested)}`} />
        <Stat
          label="Current Value"
          value={s.priced > 0 ? `₨ ${fmt(s.current)}` : '—'}
          sub={s.priced < s.total ? `${s.priced}/${s.total} priced` : undefined}
        />
        <Stat
          label="Gain / Loss"
          value={s.priced > 0 ? `₨ ${fmt(s.gainLoss)}` : '—'}
          color={s.priced > 0 ? (green ? 'text-emerald-400' : 'text-red-400') : undefined}
        />
        <Stat
          label="Return"
          value={s.priced > 0 ? `${green ? '+' : ''}${s.pct.toFixed(2)}%` : '—'}
          color={s.priced > 0 ? (green ? 'text-emerald-400' : 'text-red-400') : undefined}
        />
        <Stat
          label="Net Dividends"
          value={dividendCount > 0 ? `₨ ${fmt(dividendNet)}` : '—'}
          sub={dividendCount > 0 ? `${dividendCount} events` : undefined}
          color={dividendCount > 0 ? 'text-emerald-400' : undefined}
        />
        <Stat
          label="Dividend Yield"
          value={dividendYield !== null ? `${dividendYield.toFixed(2)}%` : '—'}
          sub={
            dps != null
              ? `₨ ${dps.toFixed(2)}/sh on cost`
              : dividendYield !== null
                ? 'on cost basis'
                : undefined
          }
          color={dividendYield !== null ? 'text-emerald-400' : undefined}
        />
      </div>
      <p className="mt-3 text-xs text-gray-500">{s.total} positions</p>
    </div>
  )
}
