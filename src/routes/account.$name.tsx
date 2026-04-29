import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { serverAddTrade, serverGetAllAccounts, serverGetHoldings } from '../serverFns'
import { ArrowUp, ArrowDown } from 'lucide-react'
import type { HoldingWithPrice } from '../db.server'

export const Route = createFileRoute('/account/$name')({
  loader: async ({ params }) => {
    const accounts = await serverGetAllAccounts()
    if (!accounts.includes(params.name)) throw notFound()
    const holdings = await serverGetHoldings({ data: params.name })
    return { holdings, account: params.name }
  },
  component: AccountPage,
})

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function AccountPage() {
  const { holdings, account } = Route.useLoaderData()
  const router = useRouter()
  const name = account.charAt(0).toUpperCase() + account.slice(1)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [symbol, setSymbol] = useState('')
  const [shares, setShares] = useState('')
  const [costPerShare, setCostPerShare] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Sorting logic
  const getSortValue = (h: HoldingWithPrice, col: string): number | string => {
    switch (col) {
      case 'symbol':
        return h.symbol
      case 'shares':
        return h.shares
      case 'cost':
        return h.cost_avg
      case 'invested':
        return h.total_invested
      case 'allocation':
        const investedTotal = holdings.reduce((sum, item) => sum + item.total_invested, 0)
        return investedTotal > 0 ? (h.total_invested / investedTotal) * 100 : 0
      case 'price':
        return h.latest_price ?? 0
      case 'value':
        return h.latest_price !== null ? h.shares * h.latest_price : 0
      case 'pl':
        const currVal = h.latest_price !== null ? h.shares * h.latest_price : null
        return currVal !== null ? currVal - h.total_invested : 0
      case 'return':
        const cv = h.latest_price !== null ? h.shares * h.latest_price : null
        const pl = cv !== null ? cv - h.total_invested : null
        return pl !== null && h.total_invested > 0 ? (pl / h.total_invested) * 100 : 0
      default:
        return 0
    }
  }

  const sortedHoldings = [...holdings].sort((a, b) => {
    if (!sortColumn) return 0
    const aVal = getSortValue(a, sortColumn)
    const bVal = getSortValue(b, sortColumn)

    let comparison = 0
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      comparison = aVal.localeCompare(bVal)
    } else {
      comparison = (aVal as number) - (bVal as number)
    }

    return sortDirection === 'asc' ? comparison : -comparison
  })

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  let totalInvested = 0
  let currentValue = 0
  let pricedCount = 0

  for (const h of holdings) {
    totalInvested += h.total_invested
    if (h.latest_price !== null) {
      currentValue += h.shares * h.latest_price
      pricedCount++
    }
  }

  const gainLoss = currentValue - totalInvested
  const pct = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0
  const green = gainLoss >= 0

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(null)

    const cleanedSymbol = symbol.trim().toUpperCase()
    const parsedShares = Number(shares)
    const parsedCostPerShare = Number(costPerShare)

    if (!cleanedSymbol) {
      setFormError('Symbol is required')
      return
    }
    if (!Number.isInteger(parsedShares) || parsedShares <= 0) {
      setFormError('Shares must be a positive integer')
      return
    }
    if (!Number.isFinite(parsedCostPerShare) || parsedCostPerShare <= 0) {
      setFormError('Cost per share must be a positive number')
      return
    }

    setSaving(true)
    try {
      const result = await serverAddTrade({
        data: {
          account,
          symbol: cleanedSymbol,
          side,
          shares: parsedShares,
          cost_per_share: parsedCostPerShare,
        },
      })

      if (!result.ok) {
        setFormError(result.error ?? 'Could not save trade')
        return
      }

      setFormSuccess(`${side === 'buy' ? 'Buy' : 'Sell'} trade recorded for ${cleanedSymbol}.`)
      setSymbol('')
      setShares('')
      setCostPerShare('')
      await router.invalidate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save trade')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{name}'s Portfolio</h1>
        <p className="mt-1 text-sm text-gray-400">{holdings.length} positions</p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Invested" value={`₨ ${fmt(totalInvested)}`} />
        <StatCard
          label="Current Value"
          value={pricedCount > 0 ? `₨ ${fmt(currentValue)}` : '—'}
          sub={pricedCount < holdings.length ? `${pricedCount}/${holdings.length} priced` : undefined}
        />
        <StatCard
          label="Gain / Loss"
          value={pricedCount > 0 ? `₨ ${fmt(gainLoss)}` : '—'}
          color={pricedCount > 0 ? (green ? 'text-emerald-400' : 'text-red-400') : undefined}
        />
        <StatCard
          label="Return"
          value={pricedCount > 0 ? `${green ? '+' : ''}${pct.toFixed(2)}%` : '—'}
          color={pricedCount > 0 ? (green ? 'text-emerald-400' : 'text-red-400') : undefined}
        />
      </div>

      {/* Add trade */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Add Buy/Sell Trade</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
          <label className="sm:col-span-1">
            <span className="mb-1 block text-xs text-gray-500">Type</span>
            <select
              value={side}
              onChange={e => setSide(e.target.value === 'sell' ? 'sell' : 'buy')}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={saving}
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>

          <label className="sm:col-span-1">
            <span className="mb-1 block text-xs text-gray-500">Symbol</span>
            <input
              type="text"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="MARI"
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm uppercase text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={saving}
            />
          </label>

          <label className="sm:col-span-1">
            <span className="mb-1 block text-xs text-gray-500">Shares</span>
            <input
              type="number"
              min={1}
              step={1}
              value={shares}
              onChange={e => setShares(e.target.value)}
              placeholder="100"
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={saving}
            />
          </label>

          <label className="sm:col-span-1">
            <span className="mb-1 block text-xs text-gray-500">Cost / Share (Rs)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={costPerShare}
              onChange={e => setCostPerShare(e.target.value)}
              placeholder="250.50"
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={saving}
            />
          </label>

          <div className="sm:col-span-1 sm:self-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Trade'}
            </button>
          </div>
        </form>

        {formError && <p className="mt-3 text-sm text-red-400">{formError}</p>}
        {formSuccess && <p className="mt-3 text-sm text-emerald-400">{formSuccess}</p>}
      </div>

      {/* Holdings table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left whitespace-nowrap">#</th>
                <th
                  onClick={() => handleSort('symbol')}
                  className="px-5 py-3 text-left cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Symbol
                    {sortColumn === 'symbol' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('shares')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    Shares
                    {sortColumn === 'shares' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('invested')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <span>Invested / Avg Cost (₨)</span>
                      <span className="text-[10px] font-normal normal-case tracking-normal text-gray-600">%</span>
                    </span>
                    {sortColumn === 'invested' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('value')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    Value / Curr. Price (₨)
                    {sortColumn === 'value' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('pl')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <span>P&amp;L / Return</span>
                      <span className="text-[10px] font-normal normal-case tracking-normal text-gray-600">₨ / %</span>
                    </span>
                    {sortColumn === 'pl' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th className="px-5 py-3 text-left whitespace-nowrap">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {sortedHoldings.map((h, idx) => {
                const currVal = h.latest_price !== null ? h.shares * h.latest_price : null
                const pl = currVal !== null ? currVal - h.total_invested : null
                const plPct = pl !== null && h.total_invested > 0 ? (pl / h.total_invested) * 100 : null
                const allocationPct = totalInvested > 0 ? (h.total_invested / totalInvested) * 100 : null
                const g = pl !== null ? pl >= 0 : null
                const updatedAt = h.latest_fetched_at
                  ? new Date(h.latest_fetched_at).toLocaleString('en-PK', { dateStyle: 'short', timeStyle: 'short' })
                  : null
                return (
                  <tr key={h.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-3 text-xs text-gray-500">{idx + 1}</td>
                    <td className="px-5 py-3 font-semibold">
                      <Link
                        to="/history/$symbol"
                        params={{ symbol: h.symbol }}
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        {h.symbol}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-300">{h.shares.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-gray-300">
                      <div className="flex flex-col items-end leading-tight">
                        <span>{fmt(h.total_invested)}</span>
                        <span className="text-sm text-gray-500">{fmt(h.cost_avg)}</span>
                        <span className="text-xs text-gray-500">
                          {allocationPct !== null ? `${allocationPct.toFixed(2)}%` : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-300">
                      <div className="flex flex-col items-end leading-tight">
                        <span>{currVal !== null ? fmt(currVal) : <span className="text-gray-600">—</span>}</span>
                        <span className="text-sm text-gray-500">{h.latest_price !== null ? fmt(h.latest_price) : <span className="text-gray-600">—</span>}</span>
                      </div>
                    </td>
                    <td className={`px-5 py-3 text-right font-medium ${g === true ? 'text-emerald-400' : g === false ? 'text-red-400' : 'text-gray-600'}`}>
                      <div className="flex flex-col items-end leading-tight">
                        <span>{pl !== null ? `${g ? '+' : ''}${fmt(pl)}` : '—'}</span>
                        <span className="text-sm opacity-80">{plPct !== null ? `${g ? '+' : ''}${plPct.toFixed(2)}%` : '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {updatedAt ?? <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({
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
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color ?? 'text-white'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}
