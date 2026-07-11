import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, CalendarDays, Clock3, TrendingUp, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { serverGetGainPositions } from '../serverFns'
import type { GainPosition } from '../db.server'

export const Route = createFileRoute('/gains')({
  loader: async () => ({ positions: await serverGetGainPositions() }),
  component: GainsPage,
})

type SortKey = 'gain' | 'return' | 'time' | 'invested'

function money(value: number): string {
  return `₨ ${value.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function compactMoney(value: number): string {
  if (value >= 1_000_000) return `₨ ${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `₨ ${(value / 1_000).toFixed(1)}K`
  return money(value)
}

function dayCount(from: string | null, to: string): number | null {
  if (!from) return null
  const start = new Date(from).getTime()
  const end = new Date(to).getTime()
  return Math.max(0, Math.floor((end - start) / 86_400_000))
}

function durationLabel(days: number | null): string {
  if (days === null) return 'Date unavailable'
  if (days < 1) return 'Less than a day'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`
  if (days < 365) {
    const months = Math.floor(days / 30)
    const rest = days % 30
    return `${months}mo${rest ? ` ${rest}d` : ''}`
  }
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  return `${years}y${months ? ` ${months}mo` : ''}`
}

function dateLabel(value: string | null): string {
  if (!value) return 'Unknown'
  return new Date(value).toLocaleDateString('en-PK', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function accountLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function metrics(position: GainPosition) {
  const current = position.shares * position.latest_price
  const marketGain = current - position.total_invested
  const gain = marketGain + position.dividend_net
  const returnPct = (gain / position.total_invested) * 100
  const days = dayCount(position.first_invested_at, position.latest_fetched_at)
  return { current, marketGain, gain, returnPct, days }
}

function GainsPage() {
  const { positions } = Route.useLoaderData()
  const [sort, setSort] = useState<SortKey>('gain')

  const rows = useMemo(() => [...positions].sort((a, b) => {
    const am = metrics(a)
    const bm = metrics(b)
    if (sort === 'return') return bm.returnPct - am.returnPct
    if (sort === 'time') return (bm.days ?? -1) - (am.days ?? -1)
    if (sort === 'invested') return b.total_invested - a.total_invested
    return bm.gain - am.gain
  }), [positions, sort])

  const totals = positions.reduce((sum, position) => {
    const m = metrics(position)
    return {
      invested: sum.invested + position.total_invested,
      current: sum.current + m.current,
      dividends: sum.dividends + position.dividend_net,
      gain: sum.gain + m.gain,
    }
  }, { invested: 0, current: 0, dividends: 0, gain: 0 })
  const totalReturn = totals.invested ? (totals.gain / totals.invested) * 100 : 0
  const knownDurations = positions.map(p => metrics(p).days).filter((d): d is number => d !== null)
  const averageDays = knownDurations.length
    ? Math.round(knownDurations.reduce((sum, days) => sum + days, 0) / knownDurations.length)
    : null

  return (
    <div className="space-y-7">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-emerald-400">
              <Trophy className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Winning positions only</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Gains &amp; Time</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              See how much each profitable holding has earned from price movement and dividends—and how long the investment took to get there.
            </p>
          </div>
          {positions.length > 0 && (
            <p className="text-xs text-gray-500">Values use the latest fetched market price.</p>
          )}
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 px-6 py-16 text-center">
          <TrendingUp className="mx-auto h-9 w-9 text-gray-600" />
          <h2 className="mt-4 text-lg font-semibold text-white">No profitable positions yet</h2>
          <p className="mt-1 text-sm text-gray-400">Fetch the latest prices from the dashboard to refresh your results.</p>
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Summary label="Capital in winners" value={compactMoney(totals.invested)} detail={`${positions.length} profitable position${positions.length === 1 ? '' : 's'}`} />
            <Summary label="Net dividends" value={compactMoney(totals.dividends)} detail="Included in total gain" />
            <Summary label="Total gain" value={`+${compactMoney(totals.gain)}`} detail={`+${totalReturn.toFixed(2)}% incl. dividends`} accent />
            <Summary label="Average time" value={durationLabel(averageDays)} detail="Across dated investments" />
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
            <div className="flex flex-col gap-3 border-b border-gray-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-white">Profitable holdings</h2>
                <p className="mt-0.5 text-xs text-gray-500">Positions with a positive market-and-dividend return appear here.</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                Sort by
                <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 outline-none focus:border-emerald-500">
                  <option value="gain">Highest gain</option>
                  <option value="return">Best return</option>
                  <option value="time">Longest held</option>
                  <option value="invested">Most invested</option>
                </select>
              </label>
            </div>
            <div className="divide-y divide-gray-800">
              {rows.map((position, index) => <PositionRow key={`${position.account}-${position.symbol}`} position={position} rank={index + 1} />)}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Summary({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? 'border-emerald-800/70 bg-emerald-950/40' : 'border-gray-800 bg-gray-900'}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${accent ? 'text-emerald-400' : 'text-white'}`}>{value}</p>
      <p className={`mt-1 text-xs ${accent ? 'text-emerald-600' : 'text-gray-500'}`}>{detail}</p>
    </div>
  )
}

function PositionRow({ position, rank }: { position: GainPosition; rank: number }) {
  const { current, marketGain, gain, returnPct, days } = metrics(position)
  return (
    <div className="grid gap-5 px-5 py-5 transition-colors hover:bg-gray-800/35 lg:grid-cols-[1.2fr_1.4fr_1fr_auto] lg:items-center">
      <div className="flex items-center gap-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-gray-500">{rank}</span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/history/$symbol" params={{ symbol: position.symbol }} className="text-lg font-bold text-white hover:text-emerald-400">{position.symbol}</Link>
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-400">{accountLabel(position.account)}</span>
          </div>
          <p className="mt-0.5 max-w-xs truncate text-xs text-gray-500">{position.sector ?? `${position.shares.toLocaleString()} shares`}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Invested</p>
          <p className="mt-1 font-semibold text-gray-200">{money(position.total_invested)}</p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-gray-700" />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Now worth</p>
          <p className="mt-1 font-semibold text-white">{money(current)}</p>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500">Total gain</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-lg font-bold text-emerald-400">+{money(gain)}</span>
          <span className="text-xs font-semibold text-emerald-500">+{returnPct.toFixed(2)}%</span>
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          Market {marketGain >= 0 ? '+' : ''}{money(marketGain)} · Dividends +{money(position.dividend_net)}
          {position.dividend_count > 0 ? ` (${position.dividend_count})` : ''}
        </p>
      </div>

      <div className="min-w-40 rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <Clock3 className="h-4 w-4" />
          <span className="font-bold">{durationLabel(days)}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-500">
          <CalendarDays className="h-3 w-3" />
          Since {dateLabel(position.first_invested_at)}
        </div>
      </div>
    </div>
  )
}
