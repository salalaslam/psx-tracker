import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { serverFetchAndStorePrices, serverGetHoldings, serverGetLatestPrices, serverGetPortfolioHistory, serverGetAllAccounts, type FetchResult } from '../serverFns'
import type { HoldingWithPrice, PortfolioValuePoint } from '../db.server'

export const Route = createFileRoute('/')({
  loader: async () => {
    const accounts = await serverGetAllAccounts()
    const holdings: Record<string, HoldingWithPrice[]> = {}
    
    // Load holdings for all accounts
    const holdingsPromises = accounts.map(async (account) => {
      holdings[account] = await serverGetHoldings({ data: account })
    })
    await Promise.all(holdingsPromises)
    
    const [prices, portfolioHistory] = await Promise.all([
      serverGetLatestPrices(),
      serverGetPortfolioHistory(),
    ])
    
    return { accounts, holdings, prices, portfolioHistory }
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

function SummaryCard({
  label,
  account,
  holdings,
}: {
  label: string
  account: string
  holdings: HoldingWithPrice[]
}) {
  const s = calcSummary(holdings)
  const green = s.gainLoss >= 0
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
      </div>
      <p className="mt-3 text-xs text-gray-500">{s.total} positions</p>
    </div>
  )
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

function Dashboard() {
  const { accounts, holdings, portfolioHistory } = Route.useLoaderData()
  const [fetching, setFetching] = useState(false)
  const [fetchResults, setFetchResults] = useState<FetchResult[] | null>(null)
  const router = useRouter()

  // Calculate summaries for all accounts
  const summaries = Object.fromEntries(
    accounts.map(account => [account, calcSummary(holdings[account] || [])])
  )

  // Calculate combined summary
  const combined = accounts.reduce(
    (acc, account) => {
      const s = summaries[account]
      return {
        invested: acc.invested + s.invested,
        current: acc.current + s.current,
        gainLoss: acc.gainLoss + s.gainLoss,
        pct: 0, // will calculate below
        priced: acc.priced + s.priced,
        total: acc.total + s.total,
      }
    },
    { invested: 0, current: 0, gainLoss: 0, pct: 0, priced: 0, total: 0 }
  )
  combined.pct = combined.invested > 0 ? (combined.gainLoss / combined.invested) * 100 : 0

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
  const green = combined.gainLoss >= 0

  // Merge all holdings for TopMovers
  const allHoldings = Object.values(holdings).flat()

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

      {/* Combined summary */}
      <div className="rounded-xl border border-gray-700 bg-gradient-to-br from-gray-900 to-gray-800 p-6">
        <h2 className="mb-4 text-base font-semibold uppercase tracking-wider text-gray-400">Combined Portfolio</h2>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
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
        </div>
      </div>

      {/* Per-account cards */}
      <div className={`grid gap-6 ${accounts.length === 1 ? '' : accounts.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3 lg:grid-cols-4'}`}>
        {accounts.map(account => (
          <SummaryCard
            key={account}
            label={`${account.charAt(0).toUpperCase() + account.slice(1)}'s Portfolio`}
            account={account}
            holdings={holdings[account] || []}
          />
        ))}
      </div>

      {/* Portfolio value chart */}
      <PortfolioChart data={portfolioHistory} />

      {/* Holdings overview (all accounts combined, by current P&L) */}
      <TopMovers holdings={allHoldings} />
    </div>
  )
}

function PortfolioChart({ data }: { data: PortfolioValuePoint[] }) {
  if (data.length === 0) return null

  const W = 800
  const H = 180
  const padL = 72, padR = 16, padT = 12, padB = 36
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const values = data.map(d => d.portfolio_value)
  const latest = values[values.length - 1]
  const first = values[0]
  const change = latest - first
  const changePct = first > 0 ? (change / first) * 100 : 0
  const isUp = change >= 0
  const color = isUp ? '#34d399' : '#f87171'
  const areaColor = isUp ? '#34d39915' : '#f8717115'

  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || latest * 0.02 || 1
  const rangeMin = minV - range * 0.05
  const rangeMax = maxV + range * 0.05
  const rangeTotal = rangeMax - rangeMin

  const pts = values.map((v, i) => ({
    x: padL + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW),
    y: padT + chartH - ((v - rangeMin) / rangeTotal) * chartH,
  }))

  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const lastPt = pts[pts.length - 1]
  const firstPt = pts[0]
  const bottomY = padT + chartH
  const areaD = `M${firstPt.x.toFixed(1)},${bottomY} ${pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} L${lastPt.x.toFixed(1)},${bottomY} Z`

  const ySteps = [0, 1 / 3, 2 / 3, 1].map(f => ({
    y: padT + chartH - f * chartH,
    v: rangeMin + f * rangeTotal,
  }))

  const maxLabels = Math.min(data.length, 6)
  const labelIndices =
    data.length <= maxLabels
      ? data.map((_, i) => i)
      : Array.from({ length: maxLabels }, (_, k) =>
          Math.round((k * (data.length - 1)) / (maxLabels - 1)),
        )

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-200">Portfolio Value Over Time</h2>
          <p className="text-xs text-gray-500 mt-0.5">Combined current value at each price fetch</p>
        </div>
        {data.length >= 2 && (
          <div className="text-right">
            <p className="text-lg font-bold text-white">₨ {fmt(latest)}</p>
            <p className={`text-sm font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {isUp ? '+' : ''}{fmt(change)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
            </p>
          </div>
        )}
      </div>
      {data.length < 2 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-2xl font-bold text-white">₨ {fmt(latest)}</p>
          <p className="mt-1 text-xs text-gray-500">Fetch prices again to start tracking history</p>
        </div>
      ) : (
        <div className="px-2 py-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '180px' }}>
            {ySteps.map(({ y, v }, i) => (
              <g key={i}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#1f2937" strokeWidth="1" />
                <text x={padL - 6} y={y + 4} textAnchor="end" fill="#4b5563" fontSize="9">
                  {fmtCompact(v)}
                </text>
              </g>
            ))}
            <path d={areaD} fill={areaColor} />
            <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={lastPt.x.toFixed(1)} cy={lastPt.y.toFixed(1)} r="4" fill={color} />
            {labelIndices.map(i => (
              <text key={i} x={pts[i].x.toFixed(1)} y={H - 4} textAnchor="middle" fill="#4b5563" fontSize="9">
                {fmtDate(data[i].sess)}
              </text>
            ))}
          </svg>
        </div>
      )}
    </div>
  )
}

type SortCol = 'symbol' | 'shares' | 'invested' | 'current' | 'gainLoss' | 'pct'

function TopMovers({ holdings }: { holdings: HoldingWithPrice[] }) {
  const [sortCol, setSortCol] = useState<SortCol>('gainLoss')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  // Merge same symbol across accounts, tracking per-account shares
  const map = new Map<string, { symbol: string; shares: number; accountShares: Record<string, number>; invested: number; current: number }>()
  const addHolding = (h: HoldingWithPrice) => {
    if (h.latest_price === null) return
    const existing = map.get(h.symbol)
    if (existing) {
      existing.shares += h.shares
      existing.invested += h.total_invested
      existing.current += h.shares * h.latest_price
      existing.accountShares[h.account] = (existing.accountShares[h.account] || 0) + h.shares
    } else {
      map.set(h.symbol, {
        symbol: h.symbol,
        shares: h.shares,
        accountShares: { [h.account]: h.shares },
        invested: h.total_invested,
        current: h.shares * h.latest_price,
      })
    }
  }
  for (const h of holdings) addHolding(h)

  const rows = [...map.values()]
    .map(r => ({ ...r, gainLoss: r.current - r.invested, pct: ((r.current - r.invested) / r.invested) * 100 }))
    .sort((a, b) => {
      let cmp = 0
      if (sortCol === 'symbol') cmp = a.symbol.localeCompare(b.symbol)
      else if (sortCol === 'shares') cmp = a.shares - b.shares
      else if (sortCol === 'invested') cmp = a.invested - b.invested
      else if (sortCol === 'current') cmp = a.current - b.current
      else if (sortCol === 'gainLoss') cmp = a.gainLoss - b.gainLoss
      else if (sortCol === 'pct') cmp = a.pct - b.pct
      return sortDir === 'desc' ? -cmp : cmp
    })

  if (rows.length === 0) return null

  const accountNames = [...new Set(holdings.map(h => h.account))].sort()

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800">
        <h2 className="text-base font-semibold text-gray-200">Holdings Overview</h2>
        <p className="text-xs text-gray-500 mt-0.5">Combined across {accountNames.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', ')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-6 py-3 text-left">#</th>
              {([
                { col: 'symbol' as SortCol, label: 'Symbol', align: 'left' },
                { col: 'shares' as SortCol, label: 'Shares', align: 'right' },
                { col: 'invested' as SortCol, label: 'Invested (₨)', align: 'right' },
                { col: 'current' as SortCol, label: 'Current (₨)', align: 'right' },
                { col: 'gainLoss' as SortCol, label: 'P&L (₨)', align: 'right' },
                { col: 'pct' as SortCol, label: 'Return', align: 'right' },
              ] as const).map(({ col, label, align }) => (
                <th
                  key={col}
                  className={`px-6 py-3 text-${align} cursor-pointer select-none hover:text-gray-300 transition-colors`}
                  onClick={() => handleSort(col)}
                >
                  <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end w-full' : ''}`}>
                    {label}
                    <span className="text-gray-600">
                      {sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {rows.map((r, idx) => {
              const g = r.gainLoss >= 0
              return (
                <tr key={r.symbol} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-6 py-3 text-xs text-gray-500">{idx + 1}</td>
                  <td className="px-6 py-3 font-semibold">
                    <Link
                      to="/history/$symbol"
                      params={{ symbol: r.symbol }}
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-right text-gray-300">
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
                  </td>
                  <td className="px-6 py-3 text-right text-gray-300">{fmt(r.invested)}</td>
                  <td className="px-6 py-3 text-right text-gray-300">{fmt(r.current)}</td>
                  <td className={`px-6 py-3 text-right font-medium ${g ? 'text-emerald-400' : 'text-red-400'}`}>
                    {g ? '+' : ''}{fmt(r.gainLoss)}
                  </td>
                  <td className={`px-6 py-3 text-right font-medium ${g ? 'text-emerald-400' : 'text-red-400'}`}>
                    {g ? '+' : ''}{r.pct.toFixed(2)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
