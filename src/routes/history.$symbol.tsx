import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { serverGetPriceHistory } from '../serverFns'
import type { PriceSnapshot } from '../db.server'

export const Route = createFileRoute('/history/$symbol')({
  loader: async ({ params }) => {
    const history = await serverGetPriceHistory({ data: params.symbol.toUpperCase() })
    return { history, symbol: params.symbol.toUpperCase() }
  },
  component: HistoryPage,
})

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function MiniChart({ data }: { data: PriceSnapshot[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (data.length < 2) return null

  const series = [...data].reverse()
  const prices = series.map(d => d.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  const W = 600
  const H = 120
  const pad = 8
  const chartW = W - pad * 2
  const chartH = H - pad * 2

  const pts = prices.map((p, i) => ({
    x: pad + (i / (prices.length - 1)) * chartW,
    y: H - pad - ((p - min) / range) * chartH,
  }))

  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const lastPt = pts[pts.length - 1]
  const isUp = prices[prices.length - 1] >= prices[0]
  const color = isUp ? '#34d399' : '#f87171'

  return (
    <div className="relative" onMouseLeave={() => setHoverIdx(null)}>
      {hoverIdx !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-gray-700 bg-gray-950/95 px-3 py-2 shadow-lg backdrop-blur-sm"
          style={{
            left: `${(pts[hoverIdx].x / W) * 100}%`,
            top: 0,
            transform:
              pts[hoverIdx].x > W * 0.72
                ? 'translateX(-100%)'
                : pts[hoverIdx].x < W * 0.28
                  ? 'translateX(0)'
                  : 'translateX(-50%)',
          }}
        >
          <p className="text-xs font-medium text-gray-300">
            {new Date(series[hoverIdx].fetched_at).toLocaleString('en-PK', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
          <p className={`mt-1 text-sm font-semibold ${isUp ? 'text-emerald-300' : 'text-red-300'}`}>
            ₨ {fmt(series[hoverIdx].price)}
          </p>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair"
        style={{ height: '120px' }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          const mouseX = ((e.clientX - rect.left) / rect.width) * W
          if (mouseX < pad || mouseX > W - pad) {
            setHoverIdx(null)
            return
          }
          const t = (mouseX - pad) / chartW
          const idx = Math.round(t * (series.length - 1))
          setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)))
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[0.25, 0.5, 0.75].map(f => {
          const y = pad + f * chartH
          return <line key={f} x1={pad} y1={y} x2={W - pad} y2={y} stroke="#374151" strokeWidth="1" />
        })}
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hoverIdx !== null ? (
          <>
            <line
              x1={pts[hoverIdx].x.toFixed(1)}
              y1={pad}
              x2={pts[hoverIdx].x.toFixed(1)}
              y2={H - pad}
              stroke="#6b7280"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <circle
              cx={pts[hoverIdx].x.toFixed(1)}
              cy={pts[hoverIdx].y.toFixed(1)}
              r="4"
              fill={color}
              stroke="#111827"
              strokeWidth="2"
            />
          </>
        ) : (
          <circle cx={lastPt.x.toFixed(1)} cy={lastPt.y.toFixed(1)} r="4" fill={color} />
        )}
        <rect x={pad} y={pad} width={chartW} height={chartH} fill="transparent" pointerEvents="all" />
      </svg>
    </div>
  )
}

function HistoryPage() {
  const { history, symbol } = Route.useLoaderData()

  if (history.length === 0) {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-sm text-gray-400 hover:text-gray-200">← Back</Link>
        <h1 className="text-2xl font-bold text-white">{symbol} — Price History</h1>
        <p className="text-gray-400">No price snapshots yet. Use "Fetch Latest Prices" on the dashboard.</p>
      </div>
    )
  }

  const latest = history[0]
  const oldest = history[history.length - 1]
  const change = latest.price - oldest.price
  const changePct = (change / oldest.price) * 100
  const green = change >= 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-sm text-gray-400 hover:text-gray-200">← Back</Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{symbol}</h1>
          <a
            href={`https://dps.psx.com.pk/company/${symbol}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-xs text-gray-500 hover:text-emerald-400 transition-colors"
          >
            View on PSX DPS ↗
          </a>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-white">₨ {fmt(latest.price)}</p>
          <p className={`text-sm font-medium ${green ? 'text-emerald-400' : 'text-red-400'}`}>
            {green ? '+' : ''}{fmt(change)} ({green ? '+' : ''}{changePct.toFixed(2)}%)
            <span className="ml-1 text-xs text-gray-500">vs first snapshot</span>
          </p>
        </div>
      </div>

      {/* Sparkline chart */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <MiniChart data={history} />
        <div className="mt-2 flex justify-between text-xs text-gray-500">
          <span>{new Date(oldest.fetched_at).toLocaleDateString()}</span>
          <span>{new Date(latest.fetched_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-gray-200">Snapshot History</h2>
          <p className="text-xs text-gray-500 mt-0.5">{history.length} snapshots (newest first)</p>
        </div>
        <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left">#</th>
                <th className="px-5 py-3 text-left">Date &amp; Time</th>
                <th className="px-5 py-3 text-right">Price (₨)</th>
                <th className="px-5 py-3 text-right">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {history.map((snap, idx) => {
                const prev = history[idx + 1]
                const delta = prev ? snap.price - prev.price : null
                const deltaPct = prev ? ((snap.price - prev.price) / prev.price) * 100 : null
                const g = delta !== null ? delta >= 0 : null
                return (
                  <tr key={snap.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-2.5 text-gray-600 text-xs">{history.length - idx}</td>
                    <td className="px-5 py-2.5 text-gray-300">
                      {new Date(snap.fetched_at).toLocaleString('en-PK', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold text-white">{fmt(snap.price)}</td>
                    <td className={`px-5 py-2.5 text-right text-xs font-medium ${g === true ? 'text-emerald-400' : g === false ? 'text-red-400' : 'text-gray-500'}`}>
                      {delta !== null ? `${g ? '+' : ''}${fmt(delta)} (${g ? '+' : ''}${deltaPct!.toFixed(2)}%)` : '—'}
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
