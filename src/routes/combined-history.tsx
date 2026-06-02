import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { serverGetCombinedHoldingPriceHistory } from '../serverFns'
import type { CombinedHoldingPriceSeries } from '../db.server'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

let zoomPluginReady: Promise<void> | null = null

function ensureZoomPlugin(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (!zoomPluginReady) {
    zoomPluginReady = import('chartjs-plugin-zoom').then(({ default: zoomPlugin }) => {
      ChartJS.register(zoomPlugin)
    })
  }
  return zoomPluginReady
}

export const Route = createFileRoute('/combined-history')({
  loader: async () => {
    const series = await serverGetCombinedHoldingPriceHistory()
    return { series }
  },
  component: CombinedHistoryPage,
})

const COLORS = [
  '#34d399',
  '#38bdf8',
  '#fbbf24',
  '#f87171',
  '#a78bfa',
  '#fb7185',
  '#2dd4bf',
  '#c084fc',
  '#60a5fa',
  '#f97316',
]

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `₨${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `₨${(n / 1_000).toFixed(0)}K`
  return `₨${n.toFixed(0)}`
}

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString('en-PK', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function accountLabel(account: string): string {
  return account.charAt(0).toUpperCase() + account.slice(1)
}

function CombinedHistoryPage() {
  const { series } = Route.useLoaderData()
  const chartable = series.filter(s => s.points.length >= 2)
  const totalShares = series.reduce((sum, s) => sum + s.shares, 0)
  const latestPriced = series.filter(s => s.latest_price !== null).length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-sm text-gray-400 hover:text-gray-200">
          ← Back
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Combined Holding Price History</h1>
          <p className="mt-1 text-sm text-gray-400">
            {series.length} current stocks · {totalShares.toLocaleString()} shares · {latestPriced}/
            {series.length} priced
          </p>
        </div>
        <div className="text-sm text-gray-500">
          Each line starts from that stock&apos;s first purchase date.
        </div>
      </div>

      {series.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-10 text-center">
          <p className="text-sm text-gray-400">No current holdings found.</p>
        </div>
      ) : (
        <>
          <CombinedPriceChart data={chartable} />
        </>
      )}
    </div>
  )
}

function CombinedPriceChart({ data }: { data: CombinedHoldingPriceSeries[] }) {
  const chartRef = useRef<ChartJS<'line'>>(null)
  const [zoomReady, setZoomReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void ensureZoomPlugin().then(() => {
      if (!cancelled) setZoomReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const chart = useMemo(() => {
    const days = new Set<string>()
    for (const stock of data) {
      for (const point of stock.points) {
        days.add(point.fetched_at.slice(0, 10))
      }
    }
    const labels = [...days].sort()
    const indexByDay = new Map(labels.map((day, index) => [day, index]))

    const datasets = data.map((stock, index) => {
      const values: Array<number | null> = Array.from({ length: labels.length }, () => null)
      for (const point of stock.points) {
        const dayIndex = indexByDay.get(point.fetched_at.slice(0, 10))
        if (dayIndex !== undefined) values[dayIndex] = point.price
      }

      return {
        label: stock.symbol,
        data: values,
        borderColor: COLORS[index % COLORS.length],
        backgroundColor: COLORS[index % COLORS.length],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: true,
        tension: 0.28,
      }
    })

    return { labels, datasets }
  }, [data])

  if (data.length === 0 || chart.labels.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-10 text-center">
        <p className="text-sm text-gray-400">
          Not enough price snapshots yet. Fetch latest prices again after recording holdings.
        </p>
      </div>
    )
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#d1d5db',
          boxHeight: 8,
          boxWidth: 8,
          padding: 14,
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(3, 7, 18, 0.96)',
        borderColor: '#374151',
        borderWidth: 1,
        titleColor: '#e5e7eb',
        bodyColor: '#d1d5db',
        padding: 10,
        displayColors: true,
        callbacks: {
          title: items => fmtDate(String(items[0]?.label ?? '')),
          label: item => `${item.dataset.label}: ₨ ${fmt(Number(item.parsed.y))}`,
        },
      },
      zoom: {
        limits: {
          x: { minRange: 7 },
          y: { minRange: 1 },
        },
        pan: {
          enabled: true,
          mode: 'xy',
        },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          drag: {
            enabled: true,
            backgroundColor: 'rgba(52, 211, 153, 0.12)',
            borderColor: 'rgba(52, 211, 153, 0.6)',
            borderWidth: 1,
          },
          mode: 'xy',
        },
      },
    },
    scales: {
      x: {
        grid: { color: '#1f2937' },
        border: { color: '#374151' },
        ticks: {
          color: '#9ca3af',
          maxRotation: 0,
          autoSkipPadding: 18,
          callback: (_value, index) => fmtDate(chart.labels[index] ?? ''),
        },
      },
      y: {
        grid: { color: '#1f2937' },
        border: { color: '#374151' },
        ticks: {
          color: '#9ca3af',
          callback: value => fmtCompact(Number(value)),
        },
      },
    },
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-200">Current Holdings Price Movement</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Individual stock prices, combined across all accounts
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="hidden text-xs text-gray-500 sm:inline">
                Scroll to zoom · drag to select · drag chart to pan
              </span>
              <button
                type="button"
                onClick={() => chartRef.current?.resetZoom()}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-gray-600 hover:bg-gray-700 hover:text-white"
              >
                Reset zoom
              </button>
            </div>
            <div className="text-xs text-gray-500">
              {chart.labels.length} trading days with stored snapshots
            </div>
          </div>
        </div>
      </div>

      <div className="h-[42rem] px-3 py-4">
        {zoomReady ? (
          <Line ref={chartRef} data={chart} options={options} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Loading chart…
          </div>
        )}
      </div>
    </div>
  )
}
