import { useMemo } from 'react'
import type { HoldingWithPrice } from '../db.server'

export type DonutSlice = {
  label: string
  value: number
}

const COLORS = [
  '#34d399',
  '#60a5fa',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#fb923c',
  '#22d3ee',
  '#84cc16',
  '#e879f9',
  '#f87171',
]

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `₨${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `₨${(n / 1_000).toFixed(0)}K`
  return `₨${n.toFixed(0)}`
}

function holdingValue(h: HoldingWithPrice): number {
  if (h.latest_price !== null) return h.shares * h.latest_price
  return h.total_invested
}

/** Merge holdings by symbol; uses current value when priced, else invested. */
export function slicesFromHoldings(holdings: HoldingWithPrice[], maxSlices = 8): DonutSlice[] {
  const map = new Map<string, number>()
  for (const h of holdings) {
    const v = holdingValue(h)
    if (v <= 0) continue
    map.set(h.symbol, (map.get(h.symbol) ?? 0) + v)
  }
  return packSlices(
    [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    maxSlices,
  )
}

/** Merge holdings by sector; unclassified when sector is missing. */
export function slicesFromSectors(holdings: HoldingWithPrice[], maxSlices = 8): DonutSlice[] {
  const map = new Map<string, number>()
  for (const h of holdings) {
    const v = holdingValue(h)
    if (v <= 0) continue
    const label = formatSectorLabel(h.sector)
    map.set(label, (map.get(label) ?? 0) + v)
  }
  return packSlices(
    [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    maxSlices,
  )
}

function formatSectorLabel(sector: string | null): string {
  if (!sector) return 'Unclassified'
  return sector
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
}

/** One slice per account from combined holdings. */
export function slicesFromAccounts(
  accounts: string[],
  holdingsByAccount: Record<string, HoldingWithPrice[]>,
  maxSlices = 8,
): DonutSlice[] {
  const slices = accounts
    .map(account => ({
      label: account.charAt(0).toUpperCase() + account.slice(1),
      value: (holdingsByAccount[account] ?? []).reduce((sum, h) => sum + holdingValue(h), 0),
    }))
    .filter(s => s.value > 0)
    .sort((a, b) => b.value - a.value)
  return packSlices(slices, maxSlices)
}

function packSlices(sorted: DonutSlice[], maxSlices: number): DonutSlice[] {
  if (sorted.length <= maxSlices) return sorted
  const top = sorted.slice(0, maxSlices - 1)
  const other = sorted.slice(maxSlices - 1).reduce((sum, s) => sum + s.value, 0)
  return [...top, { label: 'Other', value: other }]
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polar(cx, cy, r, endAngle)
  const end = polar(cx, cy, r, startAngle)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

type DonutSegment = DonutSlice & {
  start: number
  end: number
  color: string
  pct: number
}

function buildSegments(slices: DonutSlice[], total: number): DonutSegment[] {
  let angle = 0
  return slices.map((slice, i) => {
    const sweep = (slice.value / total) * 360
    const start = angle
    const end = angle + sweep
    angle = end
    return {
      ...slice,
      start,
      end,
      color: slice.label === 'Other' ? '#6b7280' : COLORS[i % COLORS.length],
      pct: (slice.value / total) * 100,
    }
  })
}

function DonutChart({
  title,
  slices,
  compact,
  ariaLabel,
}: {
  title?: string
  slices: DonutSlice[]
  compact: boolean
  ariaLabel: string
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  const segments = buildSegments(slices, total)

  const size = compact ? 132 : 160
  const cx = size / 2
  const cy = size / 2
  const outerR = compact ? 56 : 68
  const innerR = compact ? 36 : 44
  const stroke = outerR - innerR

  return (
    <section className="min-w-0">
      {title && (
        <h3 className={`mb-3 font-medium text-gray-300 ${compact ? 'text-xs' : 'text-sm'}`}>{title}</h3>
      )}
      <div
        className={`flex flex-col sm:flex-row sm:items-center ${
          compact ? 'gap-3' : 'gap-4'
        }`}
      >
        <div className="relative mx-auto shrink-0 sm:mx-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
            {segments.map(seg => {
              if (seg.end - seg.start >= 359.99) {
                return (
                  <circle
                    key={seg.label}
                    cx={cx}
                    cy={cy}
                    r={(outerR + innerR) / 2}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={stroke}
                  />
                )
              }
              return (
                <path
                  key={seg.label}
                  d={arcPath(cx, cy, (outerR + innerR) / 2, seg.start, seg.end)}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeLinecap="butt"
                />
              )
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase tracking-wide text-gray-500">Total</span>
            <span className="text-sm font-bold text-white">{fmtCompact(total)}</span>
          </div>
        </div>
        <ul
          className={`min-w-0 flex-1 ${
            compact ? 'grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2' : 'space-y-2'
          }`}
        >
          {segments.map(seg => (
            <li key={seg.label} className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="truncate font-medium text-gray-200" title={seg.label}>
                {seg.label}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-gray-400">{seg.pct.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function AllocationDonut({
  title = 'Portfolio Allocation',
  subtitle = 'Share by current value (or invested if unpriced)',
  slices: slicesProp,
  holdings,
  emptyMessage = 'No holdings to display',
  variant = 'default',
}: {
  title?: string
  subtitle?: string
  slices?: DonutSlice[]
  holdings?: HoldingWithPrice[]
  emptyMessage?: string
  /** embedded: no outer card chrome (use inside a parent panel); compact: denser chart + legend */
  variant?: 'default' | 'embedded' | 'compact'
}) {
  const embedded = variant === 'embedded' || variant === 'compact'
  const compact = variant === 'compact'

  const holdingSlices = useMemo(
    () => (holdings ? slicesFromHoldings(holdings) : []),
    [holdings],
  )
  const sectorSlices = useMemo(
    () => (holdings ? slicesFromSectors(holdings) : []),
    [holdings],
  )
  const slices = slicesProp ?? []

  const shellClass = embedded
    ? 'overflow-hidden'
    : 'rounded-xl border border-gray-800 bg-gray-900 overflow-hidden'

  const total = holdings
    ? holdingSlices.reduce((sum, s) => sum + s.value, 0)
    : slices.reduce((sum, s) => sum + s.value, 0)

  if (total <= 0) {
    return (
      <div className={shellClass}>
        <DonutHeader title={title} subtitle={subtitle} embedded={embedded} compact={compact} />
        <p className={`text-center text-sm text-gray-500 ${compact ? 'px-4 pb-5' : 'px-6 pb-8'}`}>
          {emptyMessage}
        </p>
      </div>
    )
  }

  if (holdings) {
    return (
      <div className={shellClass}>
        <DonutHeader title={title} subtitle={subtitle} embedded={embedded} compact={compact} />
        <div
          className={`grid gap-6 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-gray-800 ${
            compact ? 'px-4 pb-4 pt-1' : 'px-6 pb-6 pt-1'
          }`}
        >
          <div className={compact ? 'lg:pr-4' : 'lg:pr-6'}>
            <DonutChart
              title="By Holding"
              slices={holdingSlices}
              compact={compact}
              ariaLabel="Allocation by holding"
            />
          </div>
          <div className={compact ? 'lg:pl-4' : 'lg:pl-6'}>
            <DonutChart
              title="By Sector"
              slices={sectorSlices}
              compact={compact}
              ariaLabel="Allocation by sector"
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={shellClass}>
      <DonutHeader title={title} subtitle={subtitle} embedded={embedded} compact={compact} />
      <div className={compact ? 'px-4 pb-4 pt-1' : 'px-6 pb-6 pt-1'}>
        <DonutChart slices={slices} compact={compact} ariaLabel={title} />
      </div>
    </div>
  )
}

function DonutHeader({
  title,
  subtitle,
  embedded = false,
  compact = false,
}: {
  title: string
  subtitle?: string
  embedded?: boolean
  compact?: boolean
}) {
  return (
    <div
      className={`border-b border-gray-800 ${compact ? 'px-4 py-3' : embedded ? 'px-5 py-3' : 'px-6 py-4'}`}
    >
      <div className="min-w-0">
        <h2 className={`font-semibold text-gray-200 ${compact ? 'text-sm' : 'text-base'}`}>{title}</h2>
        {subtitle && !compact && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      </div>
    </div>
  )
}
