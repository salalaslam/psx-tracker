import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Line } from 'react-chartjs-2'
import { SortIndicator } from '../components/SortIndicator'
import { serverDeleteInterestedSymbol, serverEnsureSectors, serverFetchAndStorePrices, serverGetAllDividendTotals, serverGetHoldings, serverGetHoldingsMarketMetrics, serverGetInterestedSymbols, serverGetLatestPrices, serverGetPortfolioHistory, serverGetAllAccounts, serverUpsertInterestedSymbol, type FetchResult } from '../serverFns'
import type { HoldingMarketMetrics } from '../valueResearch'
import type { HoldingWithPrice, InterestedSymbol, PortfolioValuePoint } from '../db.server'
import { AllocationDonut } from '../components/AllocationDonut'
import { CombinedPortfolioSummary } from '../components/CombinedPortfolioSummary'
import { GoodBuyPriceCell } from '../components/GoodBuyPriceCell'
import { PriceValuationCell } from '../components/PriceValuationCell'
import { buyPriceStatusRank, calcGoodBuyPrice, calcPriceValuation, priceValuationRank } from '../goodBuyPrice'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

export const Route = createFileRoute('/')({
  loader: async () => {
    await serverEnsureSectors()

    const accounts = await serverGetAllAccounts()
    const holdings: Record<string, HoldingWithPrice[]> = {}

    const holdingsPromises = accounts.map(async (account) => {
      holdings[account] = await serverGetHoldings({ data: account })
    })
    await Promise.all(holdingsPromises)
    
    const [prices, portfolioHistory, dividendTotals, marketMetrics, interestedSymbols] = await Promise.all([
      serverGetLatestPrices(),
      serverGetPortfolioHistory(),
      serverGetAllDividendTotals(),
      serverGetHoldingsMarketMetrics(),
      serverGetInterestedSymbols(),
    ])
    
    return { accounts, holdings, prices, portfolioHistory, dividendTotals, marketMetrics, interestedSymbols }
  },
  component: Dashboard,
})

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `₨${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `₨${(n / 1_000).toFixed(0)}K`
  return `₨${n.toFixed(0)}`
}

function fmtDate(sess: string): string {
  const [datePart] = sess.split('T')
  const parts = datePart.split('-')
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[month - 1]} ${day}`
}

function fmtDateFull(sess: string): string {
  const [datePart] = sess.split('T')
  return new Date(`${datePart}T12:00:00`).toLocaleDateString('en-PK', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function Dashboard() {
  const { accounts, holdings, portfolioHistory, dividendTotals, marketMetrics, interestedSymbols } = Route.useLoaderData()
  const [fetching, setFetching] = useState(false)
  const [fetchResults, setFetchResults] = useState<FetchResult[] | null>(null)
  const router = useRouter()

  const allHoldings = Object.values(holdings).flat()

  async function handleFetch() {
    setFetching(true)
    setFetchResults(null)
    try {
      const results = await serverFetchAndStorePrices()
      setFetchResults(results)
      // reload all loader data
      await router.invalidate()
    } finally {
      setFetching(false)
    }
  }

  const successCount = fetchResults?.filter(r => r.stored).length ?? 0
  const failCount = fetchResults?.filter(r => !r.stored).length ?? 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolio Dashboard</h1>
          <p className="mt-1 text-sm text-gray-400">Combined holdings — {accounts.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(' & ')}</p>
        </div>
        <button
          onClick={handleFetch}
          disabled={fetching}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {fetching ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Fetching…
            </>
          ) : (
            'Fetch Latest Prices'
          )}
        </button>
      </div>

      {/* Fetch status */}
      {fetchResults && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${failCount === 0 ? 'border-emerald-800 bg-emerald-950 text-emerald-300' : 'border-yellow-800 bg-yellow-950 text-yellow-300'}`}
        >
          Fetched {successCount}/{fetchResults.length} prices.{' '}
          {failCount > 0 && (
            <span className="text-red-400">
              Failed: {fetchResults.filter(r => !r.stored).map(r => r.symbol).join(', ')}
            </span>
          )}
        </div>
      )}

      {/* Allocation chart */}
      <AllocationDonut
        holdings={allHoldings}
        subtitle="Share of combined portfolio by current value (or invested if unpriced)"
      />

      {/* Combined summary */}
      <CombinedPortfolioSummary
        accounts={accounts}
        holdings={holdings}
        dividendTotals={dividendTotals}
      />

      <InterestedSymbols
        symbols={interestedSymbols}
        marketMetrics={marketMetrics}
      />

      {/* Portfolio value chart */}
      <PortfolioChart data={portfolioHistory} />

      {/* Holdings overview (all accounts combined, by return %) */}
      <TopMovers
        holdings={allHoldings}
        dividendBySymbol={dividendTotals.by_symbol}
        marketMetrics={marketMetrics}
      />
    </div>
  )
}

function InterestedSymbols({
  symbols,
  marketMetrics,
}: {
  symbols: InterestedSymbol[]
  marketMetrics: Record<string, HoldingMarketMetrics>
}) {
  const router = useRouter()
  const [symbol, setSymbol] = useState('')
  const [fairValue, setFairValue] = useState('')
  const [notes, setNotes] = useState('')
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(
    () => symbols
      .map(item => {
        const valuation = calcPriceValuation(item.fair_value, item.latest_price)
        const versusFairPct = item.latest_price === null
          ? null
          : ((item.latest_price - item.fair_value) / item.fair_value) * 100
        return {
          ...item,
          valuation,
          versusFairPct,
          metrics: marketMetrics[item.symbol],
        }
      })
      .sort((a, b) => {
        const valuationOrder = priceValuationRank(a.valuation) - priceValuationRank(b.valuation)
        if (valuationOrder !== 0) return valuationOrder
        return (a.versusFairPct ?? Number.POSITIVE_INFINITY) - (b.versusFairPct ?? Number.POSITIVE_INFINITY)
      }),
    [symbols, marketMetrics],
  )

  function resetForm() {
    setSymbol('')
    setFairValue('')
    setNotes('')
    setEditingSymbol(null)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanSymbol = symbol.trim().toUpperCase()
    const parsedFairValue = Number(fairValue)
    if (!cleanSymbol) {
      setError('Symbol is required')
      return
    }
    if (!Number.isFinite(parsedFairValue) || parsedFairValue <= 0) {
      setError('Fair value must be a positive number')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await serverUpsertInterestedSymbol({
        data: { symbol: cleanSymbol, fair_value: parsedFairValue, notes },
      })
      resetForm()
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the symbol')
    } finally {
      setSaving(false)
    }
  }

  function startEditing(item: InterestedSymbol) {
    setEditingSymbol(item.symbol)
    setSymbol(item.symbol)
    setFairValue(String(item.fair_value))
    setNotes(item.notes ?? '')
    setError(null)
  }

  async function handleRemove(symbolToRemove: string) {
    setRemoving(symbolToRemove)
    setError(null)
    try {
      await serverDeleteInterestedSymbol({ data: symbolToRemove })
      if (editingSymbol === symbolToRemove) resetForm()
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not remove ${symbolToRemove}`)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-amber-900/60 bg-gray-900">
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-200">Interested in investing</h2>
              <span className="rounded-full bg-amber-950 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300 ring-1 ring-amber-800/70">
                Not held
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              Track entry timing against your fair-value estimate; these symbols are excluded from portfolio totals.
            </p>
          </div>
          <p className="text-xs text-gray-500">{symbols.length} {symbols.length === 1 ? 'symbol' : 'symbols'} watched</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 lg:grid-cols-[8rem_10rem_minmax(12rem,1fr)_auto]">
          <label className="block">
            <span className="sr-only">PSX symbol</span>
            <input
              value={symbol}
              onChange={event => setSymbol(event.target.value.toUpperCase())}
              disabled={editingSymbol !== null}
              placeholder="Symbol e.g. MEBL"
              maxLength={20}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm uppercase text-white outline-none placeholder:normal-case placeholder:text-gray-600 focus:border-amber-500 disabled:cursor-not-allowed disabled:text-gray-500"
            />
          </label>
          <label className="block">
            <span className="sr-only">Fair value per share</span>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={fairValue}
              onChange={event => setFairValue(event.target.value)}
              placeholder="Fair value (₨)"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-amber-500"
            />
          </label>
          <label className="block">
            <span className="sr-only">Investment notes</span>
            <input
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder="Notes or catalyst (optional)"
              maxLength={240}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-amber-500"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="whitespace-nowrap rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : editingSymbol ? 'Save changes' : 'Add symbol'}
            </button>
            {editingSymbol && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm font-medium text-gray-300">No symbols on your interested list yet.</p>
          <p className="mt-1 text-xs text-gray-500">Add a PSX symbol and your fair-value estimate to start tracking an entry.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3 text-left">Symbol</th>
                <th className="px-5 py-3 text-left">Sector</th>
                <th className="px-5 py-3 text-right">Current</th>
                <th className="px-5 py-3 text-right">Fair value</th>
                <th className="px-5 py-3 text-right">Vs fair</th>
                <th className="px-5 py-3 text-right">Good buy range</th>
                <th className="px-5 py-3 text-left">Price status</th>
                <th className="px-5 py-3 text-right">P/E</th>
                <th className="px-5 py-3 text-left">Liquidity</th>
                <th className="px-5 py-3 text-left">Notes</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {rows.map(item => {
                const versusFair = item.versusFairPct
                return (
                  <tr key={item.symbol} className="transition-colors hover:bg-gray-800/40">
                    <td className="px-5 py-3 font-semibold">
                      <Link
                        to="/history/$symbol"
                        params={{ symbol: item.symbol }}
                        className="text-amber-300 hover:text-amber-200"
                      >
                        {item.symbol}
                      </Link>
                    </td>
                    <td className="max-w-[12rem] truncate px-5 py-3 text-xs text-gray-400" title={item.sector ?? undefined}>
                      {item.sector ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-200">
                      {item.latest_price === null ? '—' : `₨ ${fmt(item.latest_price)}`}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-300">₨ {fmt(item.fair_value)}</td>
                    <td className={`px-5 py-3 text-right font-medium tabular-nums ${
                      versusFair === null
                        ? 'text-gray-500'
                        : versusFair < 0
                          ? 'text-emerald-400'
                          : versusFair > 0
                            ? 'text-red-400'
                            : 'text-sky-400'
                    }`}>
                      {versusFair === null
                        ? '—'
                        : versusFair < 0
                          ? `${Math.abs(versusFair).toFixed(1)}% below`
                          : versusFair > 0
                            ? `${versusFair.toFixed(1)}% above`
                            : 'At fair'}
                    </td>
                    <td className="px-5 py-3 text-right text-xs">
                      <GoodBuyPriceCell avgCost={item.fair_value} currentPrice={item.latest_price} />
                    </td>
                    <td className="px-5 py-3">
                      <PriceValuationCell avgCost={item.fair_value} currentPrice={item.latest_price} />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-300">
                      {item.metrics?.peRatio == null ? '—' : item.metrics.peRatio.toFixed(2)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        item.metrics?.liquid
                          ? 'bg-sky-950 text-sky-300 ring-1 ring-sky-800/70'
                          : 'bg-gray-800 text-gray-400'
                      }`}>
                        {item.metrics?.liquid ? 'Liquid' : 'Illiquid'}
                      </span>
                    </td>
                    <td className="max-w-[16rem] truncate px-5 py-3 text-xs text-gray-400" title={item.notes ?? undefined}>
                      {item.notes ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(item)}
                          className="text-xs font-medium text-gray-400 hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(item.symbol)}
                          disabled={removing === item.symbol}
                          className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          {removing === item.symbol ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function PortfolioChart({ data }: { data: PortfolioValuePoint[] }) {
  const { chart, stats } = useMemo(() => {
    if (data.length === 0) {
      return { chart: { labels: [] as string[], datasets: [] }, stats: null }
    }

    const values = data.map(d => d.portfolio_value)
    const currentAssetValues = data.map(d => d.current_assets_value)
    const latest = values[values.length - 1]
    const latestCurrent = currentAssetValues[currentAssetValues.length - 1]
    const first = values[0]
    const firstCurrent = currentAssetValues[0]
    const change = latest - first
    const changePct = first > 0 ? (change / first) * 100 : 0
    const currentChange = latestCurrent - firstCurrent
    const currentChangePct = firstCurrent > 0 ? (currentChange / firstCurrent) * 100 : 0
    const isUp = change >= 0
    const isCurrentUp = currentChange >= 0
    const color = isUp ? '#34d399' : '#f87171'
    const areaColor = isUp ? 'rgba(52, 211, 153, 0.08)' : 'rgba(248, 113, 113, 0.08)'

    return {
      stats: {
        latest,
        latestCurrent,
        change,
        changePct,
        currentChange,
        currentChangePct,
        isUp,
        isCurrentUp,
        periodLabel: data.length >= 2 ? `${fmtDate(data[0].sess)} to today` : '',
      },
      chart: {
        labels: data.map(d => d.sess),
        datasets: [
          {
            label: 'As held',
            data: values,
            borderColor: color,
            backgroundColor: areaColor,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
            tension: 0.28,
          },
          {
            label: "Today's holdings",
            data: currentAssetValues,
            borderColor: '#38bdf8',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.28,
          },
        ],
      },
    }
  }, [data])

  const options = useMemo<ChartOptions<'line'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(3, 7, 18, 0.96)',
          borderColor: '#374151',
          borderWidth: 1,
          titleColor: '#e5e7eb',
          bodyColor: '#d1d5db',
          padding: 10,
          displayColors: true,
          callbacks: {
            title: items => fmtDateFull(String(items[0]?.label ?? '')),
            label: item => `${item.dataset.label}: ₨ ${fmt(Number(item.parsed.y))}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: '#1f2937' },
          border: { color: '#374151' },
          ticks: {
            color: '#6b7280',
            maxRotation: 0,
            autoSkipPadding: 18,
            callback: (_value, index) => fmtDate(chart.labels[index] ?? ''),
          },
        },
        y: {
          grid: { color: '#1f2937' },
          border: { color: '#374151' },
          ticks: {
            color: '#6b7280',
            callback: value => fmtCompact(Number(value)),
          },
        },
      },
    }),
    [chart.labels],
  )

  if (data.length === 0 || !stats) return null

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-200">Portfolio Value Over Time</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Holdings as of each day vs today&apos;s portfolio at historical prices
          </p>
          {data.length >= 2 && (
            <div className="flex gap-4 mt-2 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 rounded bg-emerald-400" />
                As held
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 rounded border-t border-dashed border-sky-400" />
                Today&apos;s holdings
              </span>
            </div>
          )}
        </div>
        {data.length >= 2 && (
          <div className="text-right">
            <p className="text-lg font-bold text-white">₨ {fmt(stats.latest)}</p>
            <p className={`text-sm font-medium ${stats.isUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {stats.isUp ? '+' : ''}{fmt(stats.change)} ({stats.isUp ? '+' : ''}{stats.changePct.toFixed(2)}%)
            </p>
            <p className="text-xs text-gray-500 mt-1">Today&apos;s holdings ({stats.periodLabel})</p>
            <p className="text-sm font-semibold text-sky-300">₨ {fmt(stats.latestCurrent)}</p>
            <p className={`text-xs font-medium ${stats.isCurrentUp ? 'text-sky-400/80' : 'text-red-400/80'}`}>
              {stats.isCurrentUp ? '+' : ''}{fmt(stats.currentChange)} ({stats.isCurrentUp ? '+' : ''}{stats.currentChangePct.toFixed(2)}%)
            </p>
          </div>
        )}
      </div>
      {data.length < 2 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-2xl font-bold text-white">₨ {fmt(stats.latest)}</p>
          <p className="mt-1 text-xs text-gray-500">Fetch prices again to start tracking history</p>
        </div>
      ) : (
        <div className="h-52 px-3 py-4">
          <Line data={chart} options={options} />
        </div>
      )}
    </div>
  )
}

type SortCol = 'symbol' | 'sector' | 'shares' | 'invested' | 'current' | 'gainLoss' | 'pct' | 'dividendReceived' | 'buyRange' | 'peRatio' | 'priceStatus' | 'liquidity'
type HoldingColumn = 'rank' | SortCol

const holdingColumns: ReadonlyArray<{
  key: HoldingColumn
  label: string
  align: 'left' | 'right'
  sortable?: SortCol
}> = [
  { key: 'rank', label: '#', align: 'left' },
  { key: 'symbol', label: 'Symbol', align: 'left', sortable: 'symbol' },
  { key: 'sector', label: 'Sector', align: 'left', sortable: 'sector' },
  { key: 'shares', label: 'Shares', align: 'right', sortable: 'shares' },
  { key: 'invested', label: 'Invested (₨)', align: 'right', sortable: 'invested' },
  { key: 'current', label: 'Current (₨)', align: 'right', sortable: 'current' },
  { key: 'gainLoss', label: 'P&L (₨)', align: 'right', sortable: 'gainLoss' },
  { key: 'pct', label: 'Return', align: 'right', sortable: 'pct' },
  { key: 'buyRange', label: 'Good Buy Range', align: 'right', sortable: 'buyRange' },
  { key: 'dividendReceived', label: 'Dividends Received (₨)', align: 'right', sortable: 'dividendReceived' },
  { key: 'peRatio', label: 'P/E', align: 'right', sortable: 'peRatio' },
  { key: 'priceStatus', label: 'Price Status', align: 'left', sortable: 'priceStatus' },
  { key: 'liquidity', label: 'Liquidity', align: 'left', sortable: 'liquidity' },
]

const defaultHoldingColumnVisibility = Object.fromEntries(
  holdingColumns.map(column => [column.key, true]),
) as Record<HoldingColumn, boolean>

const holdingColumnStorageKey = 'dashboard-holdings-visible-columns'

function TopMovers({
  holdings,
  dividendBySymbol,
  marketMetrics,
}: {
  holdings: HoldingWithPrice[]
  dividendBySymbol: Record<string, { total_net: number; count: number; total_shares?: number | null }>
  marketMetrics: Record<string, HoldingMarketMetrics>
}) {
  const [sortCol, setSortCol] = useState<SortCol>('pct')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [visibleColumns, setVisibleColumns] = useState(defaultHoldingColumnVisibility)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(holdingColumnStorageKey)
      if (!saved) return
      const parsed = JSON.parse(saved) as Partial<Record<HoldingColumn, boolean>>
      setVisibleColumns(current => ({ ...current, ...parsed }))
    } catch {
      // Ignore invalid or unavailable local storage and keep the defaults.
    }
  }, [])

  function toggleColumn(column: HoldingColumn) {
    setVisibleColumns(current => {
      const next = { ...current, [column]: !current[column] }
      try {
        window.localStorage.setItem(holdingColumnStorageKey, JSON.stringify(next))
      } catch {
        // Column visibility still works for this session if storage is unavailable.
      }
      return next
    })
  }

  function showAllColumns() {
    setVisibleColumns(defaultHoldingColumnVisibility)
    try {
      window.localStorage.setItem(holdingColumnStorageKey, JSON.stringify(defaultHoldingColumnVisibility))
    } catch {
      // Column visibility still works for this session if storage is unavailable.
    }
  }

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  // Merge same symbol across accounts, tracking per-account shares
  const map = new Map<string, { symbol: string; sector: string | null; shares: number; accountShares: Record<string, number>; invested: number; current: number }>()
  const addHolding = (h: HoldingWithPrice) => {
    if (h.latest_price === null) return
    const existing = map.get(h.symbol)
    if (existing) {
      existing.shares += h.shares
      existing.invested += h.total_invested
      existing.current += h.shares * h.latest_price
      existing.accountShares[h.account] = (existing.accountShares[h.account] || 0) + h.shares
      if (!existing.sector && h.sector) existing.sector = h.sector
    } else {
      map.set(h.symbol, {
        symbol: h.symbol,
        sector: h.sector,
        shares: h.shares,
        accountShares: { [h.account]: h.shares },
        invested: h.total_invested,
        current: h.shares * h.latest_price,
      })
    }
  }
  for (const h of holdings) addHolding(h)

  const rows = [...map.values()]
    .map(r => {
      const div = dividendBySymbol[r.symbol]
      const dividendNet = div?.total_net ?? 0
      const dividendCount = div?.count ?? 0
      const avgCost = r.shares > 0 ? r.invested / r.shares : 0
      const currentPrice = r.shares > 0 ? r.current / r.shares : null
      const buyRangeStatus = calcGoodBuyPrice(avgCost, currentPrice)?.status ?? null
      const priceValuation = calcPriceValuation(avgCost, currentPrice)
      const metrics = marketMetrics[r.symbol]
      return {
        ...r,
        avgCost,
        currentPrice,
        buyRangeStatus,
        priceValuation,
        gainLoss: r.current - r.invested,
        pct: ((r.current - r.invested) / r.invested) * 100,
        dividendNet,
        dividendCount,
        peRatio: metrics?.peRatio ?? null,
        liquid: metrics?.liquid ?? false,
      }
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortCol === 'symbol') cmp = a.symbol.localeCompare(b.symbol)
      else if (sortCol === 'sector') cmp = (a.sector ?? '').localeCompare(b.sector ?? '')
      else if (sortCol === 'shares') cmp = a.shares - b.shares
      else if (sortCol === 'invested') cmp = a.invested - b.invested
      else if (sortCol === 'current') cmp = a.current - b.current
      else if (sortCol === 'gainLoss') cmp = a.gainLoss - b.gainLoss
      else if (sortCol === 'pct') cmp = a.pct - b.pct
      else if (sortCol === 'dividendReceived') cmp = a.dividendNet - b.dividendNet
      else if (sortCol === 'buyRange') cmp = buyPriceStatusRank(a.buyRangeStatus) - buyPriceStatusRank(b.buyRangeStatus)
      else if (sortCol === 'peRatio') {
        const av = a.peRatio ?? Number.POSITIVE_INFINITY
        const bv = b.peRatio ?? Number.POSITIVE_INFINITY
        cmp = av - bv
      }
      else if (sortCol === 'priceStatus') cmp = priceValuationRank(a.priceValuation) - priceValuationRank(b.priceValuation)
      else if (sortCol === 'liquidity') cmp = Number(a.liquid) - Number(b.liquid)
      return sortDir === 'desc' ? -cmp : cmp
    })

  if (rows.length === 0) return null

  const accountNames = [...new Set(holdings.map(h => h.account))].sort()

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-200">Holdings Overview</h2>
          <p className="text-xs text-gray-500 mt-0.5">Combined across {accountNames.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', ')}</p>
        </div>
        <details className="relative">
          <summary className="list-none cursor-pointer select-none rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:bg-gray-700">
            Columns
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-gray-700 bg-gray-900 p-2 shadow-xl">
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Show columns</span>
              <button type="button" onClick={showAllColumns} className="text-xs text-emerald-400 hover:text-emerald-300">
                Show all
              </button>
            </div>
            {holdingColumns.map(column => (
              <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-300 hover:bg-gray-800">
                <input
                  type="checkbox"
                  checked={visibleColumns[column.key]}
                  onChange={() => toggleColumn(column.key)}
                  className="h-4 w-4 accent-emerald-500"
                />
                {column.label}
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
              {holdingColumns.filter(column => visibleColumns[column.key]).map(({ key, label, align, sortable }) => sortable ? (
                <th
                  key={key}
                  className={`px-6 py-3 text-${align} cursor-pointer select-none hover:text-gray-300 transition-colors`}
                  onClick={() => handleSort(sortable)}
                >
                  <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end w-full' : ''}`}>
                    {label}
                    <span className="text-gray-600">
                      <SortIndicator active={sortCol === sortable} direction={sortDir} />
                    </span>
                  </span>
                </th>
              ) : (
                <th key={key} className={`px-6 py-3 text-${align}`}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {rows.map((r, idx) => {
              const g = r.gainLoss >= 0
              return (
                <tr key={r.symbol} className="hover:bg-gray-800/40 transition-colors">
                  {visibleColumns.rank && <td className="px-6 py-3 text-xs text-gray-500">{idx + 1}</td>}
                  {visibleColumns.symbol && <td className="px-6 py-3 font-semibold">
                    <Link
                      to="/history/$symbol"
                      params={{ symbol: r.symbol }}
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      {r.symbol}
                    </Link>
                  </td>}
                  {visibleColumns.sector && <td className="px-6 py-3 text-gray-400 text-xs max-w-[12rem] truncate" title={r.sector ?? undefined}>
                    {r.sector ?? '—'}
                  </td>}
                  {visibleColumns.shares && <td className="px-6 py-3 text-right text-gray-300">
                    <div className="relative inline-block group">
                      <span className="cursor-default underline decoration-dotted decoration-gray-600 underline-offset-2">
                        {r.shares.toLocaleString()}
                      </span>
                      <div className="pointer-events-none absolute bottom-full right-0 mb-1.5 hidden group-hover:block z-10 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-xs shadow-lg whitespace-nowrap">
                        <div className="flex gap-4">
                          {accountNames.map(account => (
                            <span key={account} className="text-gray-400">
                              {account.charAt(0).toUpperCase() + account.slice(1)}: <span className="font-medium text-white">{(r.accountShares[account] || 0).toLocaleString()}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>}
                  {visibleColumns.invested && <td className="px-6 py-3 text-right text-gray-300">{fmt(r.invested)}</td>}
                  {visibleColumns.current && <td className="px-6 py-3 text-right text-gray-300">{fmt(r.current)}</td>}
                  {visibleColumns.gainLoss && <td className={`px-6 py-3 text-right font-medium ${g ? 'text-emerald-400' : 'text-red-400'}`}>
                    {g ? '+' : ''}{fmt(r.gainLoss)}
                  </td>}
                  {visibleColumns.pct && <td className={`px-6 py-3 text-right font-medium ${g ? 'text-emerald-400' : 'text-red-400'}`}>
                    {g ? '+' : ''}{r.pct.toFixed(2)}%
                  </td>}
                  {visibleColumns.buyRange && <td className="px-6 py-3 text-right text-xs">
                    <GoodBuyPriceCell avgCost={r.avgCost} currentPrice={r.currentPrice} />
                  </td>}
                  {visibleColumns.dividendReceived && <td className="px-6 py-3 text-right">
                    {r.dividendCount > 0 ? (
                      <div>
                        <span className="font-medium text-emerald-400">₨ {fmt(r.dividendNet)}</span>
                        <p className="text-xs text-gray-500">{r.dividendCount} {r.dividendCount === 1 ? 'payment' : 'payments'}</p>
                      </div>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>}
                  {visibleColumns.peRatio && (
                    <td className="px-6 py-3 text-right tabular-nums text-gray-300">
                      {r.peRatio === null ? '—' : r.peRatio.toFixed(2)}
                    </td>
                  )}
                  {visibleColumns.priceStatus && (
                    <td className="px-6 py-3">
                      <PriceValuationCell avgCost={r.avgCost} currentPrice={r.currentPrice} />
                    </td>
                  )}
                  {visibleColumns.liquidity && (
                    <td className="px-6 py-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          r.liquid
                            ? 'bg-sky-950 text-sky-300 ring-1 ring-sky-800/70'
                            : 'bg-gray-800 text-gray-400'
                        }`}
                        title={r.liquid ? 'KMI30 constituent' : 'Not in KMI30'}
                      >
                        {r.liquid ? 'Liquid' : 'Illiquid'}
                      </span>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
