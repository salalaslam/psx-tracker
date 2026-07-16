import { createFileRoute } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Database,
  Dot,
  ExternalLink,
  Eye,
  Info,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AllocationDonut } from '../components/AllocationDonut'
import { serverGetValueResearchReport } from '../serverFns'
import {
  VALUE_RESEARCH_SOURCES,
  type HoldingResearchRow,
  type OpportunityResearchItem,
  type ScreenScore,
  type ShariahStatus,
  type ShariahUniverseRow,
  type ValueResearchReport,
} from '../valueResearch'

export const Route = createFileRoute('/research')({
  loader: () => serverGetValueResearchReport(),
  head: () => ({ meta: [{ title: 'PSX Value & Shariah Research' }] }),
  component: ResearchPage,
})

type ResearchTab = 'portfolio' | 'opportunities' | 'universe' | 'methodology'
type HoldingFilter = 'all' | 'attention' | 'compliant' | 'kmi30'
type HoldingSort = 'weight' | 'score' | 'return' | 'symbol'
type UniverseFilter = 'kmiall' | 'kmi30' | 'held'
type CounterFilter = 'all' | 'normal' | 'risk'

const researchTabs: ReadonlyArray<{
  key: ResearchTab
  label: string
}> = [
  { key: 'portfolio', label: 'Portfolio report' },
  { key: 'opportunities', label: 'Opportunity research' },
  { key: 'universe', label: 'Shariah universe' },
  { key: 'methodology', label: 'Methodology' },
]

function money(value: number): string {
  return `₨ ${value.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

function compactMoney(value: number): string {
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000_000) return `₨ ${(value / 1_000_000_000).toFixed(2)}B`
  if (absolute >= 1_000_000) return `₨ ${(value / 1_000_000).toFixed(2)}M`
  if (absolute >= 1_000) return `₨ ${(value / 1_000).toFixed(0)}K`
  return money(value)
}

function number(value: number): string {
  return value.toLocaleString('en-PK', { maximumFractionDigits: 2 })
}

function pct(value: number | null, digits = 1): string {
  if (value === null) return '—'
  return `${value.toFixed(digits)}%`
}

function shortDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function companyUrl(symbol: string): string {
  return `https://dps.psx.com.pk/company/${encodeURIComponent(symbol)}`
}

function ResearchPage() {
  const report = Route.useLoaderData()
  const [tab, setTab] = useState<ResearchTab>('portfolio')

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % researchTabs.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + researchTabs.length) % researchTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = researchTabs.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const nextTab = researchTabs[nextIndex]
    setTab(nextTab.key)
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(nextIndex)
      .focus()
  }

  return (
    <div className="space-y-6">
      <ResearchHero report={report} onMethodology={() => setTab('methodology')} />

      {report.listingError && (
        <Notice
          tone="warning"
          title={
            report.listingSource === 'unavailable'
              ? 'Live PSX universe could not be loaded'
              : 'PSX universe was only partially loaded'
          }
        >
          Portfolio evidence falls back to the dated official recomposition snapshot where possible, but
          membership, counts and opportunity eligibility should be rechecked before acting. {report.listingError}
        </Notice>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900 p-1.5">
        <div className="flex min-w-max gap-1" role="tablist" aria-label="Research sections">
          {researchTabs.map((item, index) => (
            <button
              key={item.key}
              id={`research-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              aria-controls={`research-panel-${item.key}`}
              tabIndex={tab === item.key ? 0 : -1}
              onClick={() => setTab(item.key)}
              onKeyDown={event => handleTabKeyDown(event, index)}
              className={`rounded-lg px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                tab === item.key
                  ? 'bg-gray-800 text-white shadow-sm'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`}
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="block text-[11px] text-gray-500">
                {item.key === 'portfolio'
                  ? `${report.summary.holdingCount} holdings`
                  : item.key === 'opportunities'
                    ? `${report.opportunities.length} studies`
                    : item.key === 'universe'
                      ? `${report.universe.length} companies`
                      : 'Rules & limits'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        id={`research-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`research-tab-${tab}`}
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        {tab === 'portfolio' && <PortfolioReport report={report} />}
        {tab === 'opportunities' && <OpportunityResearch report={report} />}
        {tab === 'universe' && <ShariahUniverse report={report} />}
        {tab === 'methodology' && <Methodology />}
      </div>

      <p className="pb-2 text-center text-xs leading-relaxed text-gray-600">
        Research aid only — not investment, tax or Shariah advice. Verify company filings, the latest PSX
        recomposition and a qualified Shariah opinion before a transaction.
      </p>
    </div>
  )
}

function ResearchHero({
  report,
  onMethodology,
}: {
  report: ValueResearchReport
  onMethodology: () => void
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 px-6 py-7 sm:px-8">
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-500/8 blur-3xl" />
      <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-amber-400/5 blur-3xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
            <span className="text-emerald-400">Owner&apos;s lens</span>
            <Dot aria-hidden="true" className="h-4 w-4 text-gray-700" />
            <span className="text-gray-500">Pakistan Stock Exchange</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Value &amp; Shariah Research
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">
            Buffett-inspired business quality and margin-of-safety thinking, adapted for PSX liquidity,
            inflation, PKR risk, circular debt and the KMI Shariah gate.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <SourceChip label={`KMI All effective ${shortDate(report.kmiAllEffectiveDate)}`} />
            <SourceChip label={`KMI30 effective ${shortDate(report.kmi30EffectiveDate)}`} />
            <SourceChip label={`Accounts to ${shortDate(report.accountsAsOf)}`} />
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span
              className={`h-2 w-2 rounded-full ${
                report.listingSource === 'live' && !report.listingError
                  ? 'bg-emerald-400'
                  : 'bg-amber-400'
              }`}
            />
            PSX universe{' '}
            {report.listingSource === 'live' && !report.listingError
              ? 'checked'
              : report.listingSource === 'partial'
                ? 'partially checked'
                : 'unavailable'}{' '}
            {shortDate(report.listingFetchedAt)}
          </div>
          <button
            type="button"
            onClick={onMethodology}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-gray-600 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <BookOpen className="h-4 w-4" />
            Read methodology
          </button>
        </div>
      </div>
    </section>
  )
}

function SourceChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-gray-700/80 bg-gray-950/50 px-3 py-1 text-xs text-gray-400">
      {label}
    </span>
  )
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: 'warning' | 'danger' | 'info'
  title: string
  children: React.ReactNode
}) {
  const styles = {
    warning: 'border-amber-800/70 bg-amber-950/40 text-amber-100',
    danger: 'border-red-800/70 bg-red-950/40 text-red-100',
    info: 'border-sky-800/70 bg-sky-950/30 text-sky-100',
  }[tone]
  const Icon = tone === 'danger' ? XCircle : tone === 'warning' ? AlertTriangle : Info
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3.5 ${styles}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <div className="mt-1 text-xs leading-5 opacity-80">{children}</div>
      </div>
    </div>
  )
}

function PortfolioReport({ report }: { report: ValueResearchReport }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<HoldingFilter>('all')
  const [sort, setSort] = useState<HoldingSort>('weight')
  const [expanded, setExpanded] = useState<string | null>('APL')
  const nonCompliant = report.holdings.filter(row => row.shariahStatus === 'non_compliant')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return report.holdings
      .filter(row => {
        if (needle && !`${row.symbol} ${row.name} ${row.sector}`.toLowerCase().includes(needle)) {
          return false
        }
        if (filter === 'attention') {
          return row.shariahReviewLevel !== 'standard' || row.exchangeRisk
        }
        if (filter === 'compliant') return row.shariahStatus === 'compliant'
        if (filter === 'kmi30') return row.kmi30
        return true
      })
      .sort((left, right) => {
        if (sort === 'symbol') return left.symbol.localeCompare(right.symbol)
        if (sort === 'score') return (right.score.total ?? -1) - (left.score.total ?? -1)
        if (sort === 'return') return (right.returnPct ?? -Infinity) - (left.returnPct ?? -Infinity)
        return right.portfolioWeightPct - left.portfolioWeightPct
      })
  }, [filter, query, report.holdings, sort])

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Portfolio"
          value={compactMoney(report.summary.currentValue)}
          note={`${report.summary.holdingCount} companies · ${report.summary.accountCount} accounts`}
        />
        <MetricCard
          label="Shariah screen"
          value={`${report.summary.shariahCompliantCount}/${report.summary.holdingCount}`}
          note={`${report.summary.compliantValuePct.toFixed(1)}% of current value compliant`}
          tone={report.summary.shariahNonCompliantCount > 0 ? 'danger' : 'positive'}
        />
        <MetricCard
          label="By exception"
          value={pct(report.summary.exceptionValuePct)}
          note="Current value needing closer review"
          tone="warning"
        />
        <MetricCard
          label="KMI30 coverage"
          value={pct(report.summary.kmi30ValuePct)}
          note="Liquidity index, not quality approval"
          tone="info"
        />
        <MetricCard
          label="Energy complex"
          value={pct(report.summary.energyThemeValuePct)}
          note="E&P + OMC + power"
          tone="warning"
        />
        <MetricCard
          label="Sector breadth"
          value={`${report.summary.sectorCount}`}
          note={`${report.summary.topFiveValuePct.toFixed(1)}% in top five names`}
        />
      </section>

      {nonCompliant.map(row => (
        <Notice key={row.symbol} tone="danger" title={`${row.symbol}: Shariah review required`}>
          {row.name} is not in the current KMI All Share screen. {row.shariahNote}{' '}
          <a
            className="font-semibold underline decoration-red-400/50 underline-offset-2 hover:text-white"
            href={VALUE_RESEARCH_SOURCES.kmiAllNotice}
            target="_blank"
            rel="noreferrer"
          >
            Open PSX notice
          </a>
          . This page does not issue a silent sell order; seek qualified guidance on timing and purification.
        </Notice>
      ))}

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-xl border border-gray-800 bg-gray-900">
          <AllocationDonut
            title="Allocation by sector"
            subtitle="Current value; invested value used when a price is missing"
            slices={report.sectors.map(sector => ({ label: titleCase(sector.sector), value: sector.value }))}
            variant="embedded"
          />
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-400">
                Correlated-risk watch
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">Ticker count overstates diversity</h2>
            </div>
            <Eye className="h-5 w-5 text-gray-600" />
          </div>
          <p className="mt-3 text-sm leading-6 text-gray-400">
            Energy, fertilizer, autos and cement together dominate the portfolio and share exposure to
            administered prices, government receivables, rates, FX and domestic construction demand.
          </p>
          <div className="mt-5 space-y-3">
            {report.sectors.slice(0, 6).map(sector => (
              <div key={sector.sector}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-gray-300">{titleCase(sector.sector)}</span>
                  <span className="font-semibold tabular-nums text-gray-400">
                    {sector.weightPct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-full rounded-full bg-emerald-500/80"
                    style={{ width: `${Math.min(100, sector.weightPct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Notice tone="info" title="What the automated screen can—and cannot—say">
        It uses four-year profitability, P/E, index liquidity and portfolio fit. It does not yet establish a
        moat, management quality, owner earnings, exact leverage or intrinsic value. Missing data is shown as
        missing, never converted into a zero.
      </Notice>

      <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Invested-company report</h2>
              <p className="mt-1 text-xs text-gray-500">
                Price performance is context—not evidence that a business is cheap or expensive.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block">
                <span className="sr-only">Search holdings</span>
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search company or sector"
                  className="w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-9 pr-3 text-sm text-gray-200 outline-none placeholder:text-gray-600 focus:border-emerald-500 sm:w-56"
                />
              </label>
              <Select ariaLabel="Filter invested companies" value={filter} onChange={value => setFilter(value as HoldingFilter)}>
                <option value="all">All holdings</option>
                <option value="attention">Needs attention</option>
                <option value="compliant">Compliant</option>
                <option value="kmi30">KMI30 only</option>
              </Select>
              <Select ariaLabel="Sort invested companies" value={sort} onChange={value => setSort(value as HoldingSort)}>
                <option value="weight">Sort: portfolio weight</option>
                <option value="score">Sort: screen score</option>
                <option value="return">Sort: price return</option>
                <option value="symbol">Sort: symbol</option>
              </Select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Portfolio</th>
                <th className="px-4 py-3 font-semibold">Shariah</th>
                <th className="px-4 py-3 font-semibold">Index</th>
                <th className="px-4 py-3 text-right font-semibold">P/E</th>
                <th className="px-4 py-3 text-right font-semibold">Screen</th>
                <th className="px-4 py-3 font-semibold">Research stance</th>
                <th className="px-6 py-3 text-right font-semibold"><span className="sr-only">Expand</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {filtered.map(row => (
                <HoldingRows
                  key={row.symbol}
                  row={row}
                  expanded={expanded === row.symbol}
                  onToggle={() => setExpanded(current => (current === row.symbol ? null : row.symbol))}
                />
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="px-6 py-12 text-center text-sm text-gray-500">No holdings match these filters.</p>
        )}
        <div className="border-t border-gray-800 px-6 py-3 text-xs text-gray-600">
          Showing {filtered.length} of {report.holdings.length} invested companies · Fundamentals: PSX
          standardized company summaries, checked {shortDate(report.generatedAt)}
        </div>
      </section>
    </div>
  )
}

function HoldingRows({
  row,
  expanded,
  onToggle,
}: {
  row: HoldingResearchRow
  expanded: boolean
  onToggle: () => void
}) {
  const positive = row.gainLoss >= 0
  return (
    <>
      <tr className="transition-colors hover:bg-gray-800/35">
        <td className="px-6 py-4">
          <a
            href={companyUrl(row.symbol)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-bold text-white hover:text-emerald-300"
          >
            {row.symbol}
            <ExternalLink className="h-3 w-3 text-gray-600" />
          </a>
          <p className="mt-0.5 max-w-[240px] truncate text-xs text-gray-500" title={row.name}>
            {row.name}
          </p>
          <p className="mt-1 max-w-[240px] truncate text-[11px] text-gray-600" title={row.sector}>
            {titleCase(row.sector)}
          </p>
        </td>
        <td className="px-4 py-4">
          <p className="font-semibold tabular-nums text-gray-200">{row.portfolioWeightPct.toFixed(1)}%</p>
          <p className={`mt-0.5 text-xs tabular-nums ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? '+' : ''}{pct(row.returnPct)} price return
          </p>
          <p className="mt-0.5 text-[11px] text-gray-600">{row.accounts.join(' + ')}</p>
        </td>
        <td className="px-4 py-4">
          <ShariahBadge status={row.shariahStatus} review={row.shariahReviewLevel} />
          {row.incomeRatioPct !== null && (
            <p className="mt-1.5 text-[11px] text-gray-600">NC income {row.incomeRatioPct.toFixed(2)}%</p>
          )}
        </td>
        <td className="px-4 py-4">
          <div className="flex flex-wrap gap-1">
            {row.kmi30 && <IndexBadge label="KMI30" primary />}
            {row.kmiAllShare && <IndexBadge label="KMI All" />}
            {!row.kmi30 && !row.kmiAllShare && <span className="text-xs text-gray-600">None</span>}
          </div>
        </td>
        <td className="px-4 py-4 text-right font-medium tabular-nums text-gray-300">
          {row.peRatio === null ? '—' : row.peRatio.toFixed(2)}
        </td>
        <td className="px-4 py-4 text-right">
          <ScorePill score={row.score} />
        </td>
        <td className="px-4 py-4">
          <StanceBadge label={row.screenLabel} />
          <p className="mt-1 text-[11px] text-gray-600">{row.score.confidence} data confidence</p>
        </td>
        <td className="px-6 py-4 text-right">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${row.symbol} research details`}
            className="rounded-md border border-gray-700 bg-gray-800 p-2 text-gray-400 transition-colors hover:border-gray-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-950/50">
          <td colSpan={8} className="px-6 py-5">
            <HoldingDetail row={row} />
          </td>
        </tr>
      )}
    </>
  )
}

function HoldingDetail({ row }: { row: HoldingResearchRow }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <DetailPanel title="Position & evidence">
        <DetailLine label="Current value" value={money(row.currentValue)} />
        <DetailLine label="Average cost" value={money(row.avgCost)} />
        <DetailLine label="Net dividends recorded" value={money(row.dividendNet)} />
        <DetailLine label="Annual EPS" value={series(row.annualPeriods, row.annualEps, false)} />
        <DetailLine label="Annual PAT (000s)" value={series(row.annualPeriods, row.annualProfitAfterTax, true)} />
      </DetailPanel>
      <DetailPanel title="First-pass screen">
        <ScoreLine label="Earnings quality" score={row.score.quality} />
        <ScoreLine label="P/E valuation snapshot" score={row.score.valuation} />
        <ScoreLine label="Index liquidity" score={row.score.liquidity} />
        <ScoreLine label="Portfolio fit" score={row.score.portfolioFit} />
        <p className="mt-3 text-[11px] leading-5 text-gray-600">
          Rank aid only. A low P/E can be a cyclical peak; average purchase cost is not intrinsic value.
        </p>
      </DetailPanel>
      <DetailPanel title="Review flags">
        {row.shariahNote && (
          <p className="mb-3 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3 text-xs leading-5 text-amber-200/80">
            {row.shariahNote}
          </p>
        )}
        <ul className="space-y-2">
          {row.riskFlags.map(flag => (
            <li key={flag} className="flex gap-2 text-xs text-gray-400">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              {flag}
            </li>
          ))}
        </ul>
        {row.riskFlags.length === 0 && <p className="text-xs text-gray-500">No automated flags.</p>}
      </DetailPanel>
    </div>
  )
}

function series(periods: string[], values: Array<number | null>, compact: boolean): string {
  if (values.length === 0) return 'Not available'
  return values
    .map((value, index) => {
      const display = value === null ? '—' : compact ? compactNumber(value) : number(value)
      return `${periods[index] ?? index + 1}: ${display}`
    })
    .join(' · ')
}

function compactNumber(value: number): string {
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}B`
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}M`
  return number(value)
}

function DetailPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/80 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h3>
      {children}
    </div>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-gray-800/70 py-2 first:pt-0 last:border-0 last:pb-0">
      <p className="text-[11px] text-gray-600">{label}</p>
      <p className="mt-0.5 text-xs leading-5 text-gray-300">{value}</p>
    </div>
  )
}

function ScoreLine({ label, score }: { label: string; score: number | null }) {
  return (
    <div className="mb-2.5 grid grid-cols-[1fr_auto] items-center gap-3 last:mb-0">
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-gray-500">
          <span>{label}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
          <div
            className={`h-full rounded-full ${score === null ? 'bg-gray-700' : 'bg-emerald-500'}`}
            style={{ width: `${score ?? 0}%` }}
          />
        </div>
      </div>
      <span className="w-8 text-right text-xs font-semibold tabular-nums text-gray-300">
        {score ?? '—'}
      </span>
    </div>
  )
}

function MetricCard({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: string
  value: string
  note: string
  tone?: 'default' | 'positive' | 'warning' | 'danger' | 'info'
}) {
  const valueColor = {
    default: 'text-white',
    positive: 'text-emerald-400',
    warning: 'text-amber-300',
    danger: 'text-red-400',
    info: 'text-sky-300',
  }[tone]
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-600">{label}</p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-gray-500">{note}</p>
    </div>
  )
}

function ShariahBadge({
  status,
  review = 'standard',
}: {
  status: ShariahStatus
  review?: HoldingResearchRow['shariahReviewLevel']
}) {
  if (status === 'non_compliant') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-800/70 bg-red-950/50 px-2 py-1 text-[11px] font-semibold text-red-300">
        <XCircle className="h-3 w-3" /> Non-compliant
      </span>
    )
  }
  if (status === 'unverified') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] font-semibold text-gray-400">
        <Info className="h-3 w-3" /> Verify
      </span>
    )
  }
  if (review === 'exception' || review === 'watch') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-800/70 bg-amber-950/40 px-2 py-1 text-[11px] font-semibold text-amber-300">
        <AlertTriangle className="h-3 w-3" /> {review === 'exception' ? 'By exception' : 'Near limit'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/70 bg-emerald-950/40 px-2 py-1 text-[11px] font-semibold text-emerald-300">
      <CheckCircle2 className="h-3 w-3" /> Compliant
    </span>
  )
}

function IndexBadge({ label, primary = false }: { label: string; primary?: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        primary ? 'bg-sky-950 text-sky-300 ring-1 ring-sky-800/70' : 'bg-gray-800 text-gray-400'
      }`}
    >
      {label}
    </span>
  )
}

function ScorePill({ score }: { score: ScreenScore }) {
  if (score.total === null) return <span className="text-xs text-gray-600">Not enough data</span>
  const color = score.total >= 75 ? 'text-emerald-300' : score.total >= 60 ? 'text-amber-300' : 'text-gray-400'
  return (
    <div>
      <span className={`text-base font-bold tabular-nums ${color}`}>{score.total}</span>
      <span className="text-[10px] text-gray-600">/100</span>
    </div>
  )
}

function StanceBadge({ label }: { label: HoldingResearchRow['screenLabel'] }) {
  const styles = {
    'Shariah review': 'border-red-800/60 bg-red-950/40 text-red-300',
    'Priority review': 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300',
    Watch: 'border-amber-800/60 bg-amber-950/40 text-amber-300',
    Caution: 'border-gray-700 bg-gray-800 text-gray-400',
    'Data needed': 'border-gray-700 bg-gray-800 text-gray-500',
  }[label]
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${styles}`}>{label}</span>
}

function Select({
  ariaLabel,
  value,
  onChange,
  children,
}: {
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={event => onChange(event.target.value)}
      className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-300 outline-none focus:border-emerald-500"
    >
      {children}
    </select>
  )
}

function OpportunityResearch({ report }: { report: ValueResearchReport }) {
  const sectorWeight = new Map(report.sectors.map(sector => [sector.sector, sector.weightPct]))
  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">
            Research queue · not a buy list
          </p>
          <h2 className="mt-2 text-2xl font-bold text-white">Diversify the economic drivers</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
            The highest-value next step is not simply adding tickers. It is researching durable cash flows
            outside the portfolio&apos;s energy, fertilizer, auto and cement cluster—without relaxing the Shariah
            gate or overpaying for quality.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {['Islamic banking', 'Consumer staples', 'Glass', 'Chemicals'].map(label => (
              <span key={label} className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-amber-800/40 bg-gradient-to-br from-amber-950/35 to-gray-900 p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
            Opportunity-cost anchor
          </p>
          <p className="mt-2 text-3xl font-bold text-amber-200">11.30%</p>
          <p className="mt-1 text-xs text-gray-500">1-year GoP fixed Ijarah Sukuk cut-off · 8 Jul 2026</p>
          <p className="mt-4 text-xs leading-5 text-gray-400">
            June CPI was 11.07% y/y. Equity owner earnings are uncertain and long-duration, so they need a
            meaningful premium—not a mechanical P/E comparison.
          </p>
          <div className="mt-4 flex gap-3 text-xs">
            <ExternalSource href={VALUE_RESEARCH_SOURCES.gisAuctionResults} label="GIS source" />
            <ExternalSource href={VALUE_RESEARCH_SOURCES.pbsJuneCpi} label="PBS CPI" />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {report.opportunities.map(item => (
          <OpportunityCard
            key={item.symbol}
            item={item}
            currentSectorWeight={sectorWeight.get(item.sector) ?? 0}
          />
        ))}
      </div>

      <section className="rounded-xl border border-red-900/50 bg-red-950/20 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-red-400" />
          <div>
            <p className="text-sm font-semibold text-red-200">Shariah gate exclusions</p>
            {report.excluded.map(item => (
              <p key={item.symbol} className="mt-2 text-xs leading-5 text-red-200/60">
                <strong className="text-red-300">{item.symbol}</strong> — {item.reason} ({item.asOf})
              </p>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function OpportunityCard({
  item,
  currentSectorWeight,
}: {
  item: OpportunityResearchItem
  currentSectorWeight: number
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
      <div className="border-b border-gray-800 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={item.companyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-lg font-bold text-white hover:text-emerald-300"
              >
                {item.symbol} <ExternalLink className="h-3.5 w-3.5 text-gray-600" />
              </a>
              {item.kmi30 && <IndexBadge label="KMI30" primary />}
              {item.kmiAllShare && <IndexBadge label="KMI All" />}
            </div>
            <p className="mt-1 text-sm text-gray-400">{item.name}</p>
            <p className="mt-1 text-xs text-gray-600">{titleCase(item.sector)}</p>
            {item.price !== null && (
              <p className="mt-1 text-[11px] tabular-nums text-gray-600">
                Price snapshot {money(item.price)} · {shortDate(item.asOf)}
              </p>
            )}
          </div>
          <ShariahBadge status={item.shariahStatus} />
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          <MiniMetric label="P/E" value={item.peRatio === null ? '—' : item.peRatio.toFixed(2)} />
          <MiniMetric label="Earnings yield" value={pct(item.earningsYieldPct)} />
          <MiniMetric label="Sector now" value={pct(currentSectorWeight)} />
          <MiniMetric label="Lens" value={item.stance} compact />
        </div>
      </div>
      <div className="flex-1 space-y-5 p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Shariah snapshot</p>
          <p className="mt-1 text-xs leading-5 text-gray-400">{item.screenRatios}</p>
        </div>
        <OpportunityList title="Why research" items={item.reasons} tone="positive" />
        <OpportunityList title="What can break" items={item.risks} tone="warning" />
        <OpportunityList title="Research next" items={item.nextChecks} tone="default" />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-gray-800 bg-gray-950/30 px-5 py-3">
        <span className="text-[11px] text-gray-600">Evidence snapshot {shortDate(item.asOf)}</span>
        <ExternalSource href={item.filingUrl} label="Primary filing" />
      </div>
    </article>
  )
}

function MiniMetric({
  label,
  value,
  compact = false,
}: {
  label: string
  value: string
  compact?: boolean
}) {
  return (
    <div className="min-w-0 rounded-lg bg-gray-950/60 p-2.5">
      <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-gray-600">{label}</p>
      <p className={`mt-1 truncate font-semibold text-gray-200 ${compact ? 'text-[11px]' : 'text-sm'}`} title={value}>
        {value}
      </p>
    </div>
  )
}

function OpportunityList({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: 'positive' | 'warning' | 'default'
}) {
  const dot = tone === 'positive' ? 'bg-emerald-400' : tone === 'warning' ? 'bg-amber-400' : 'bg-sky-400'
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-600">{title}</p>
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item} className="flex gap-2.5 text-xs leading-5 text-gray-400">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ExternalSource({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:text-emerald-300"
    >
      {label} <ExternalLink className="h-3 w-3" />
    </a>
  )
}

function ShariahUniverse({ report }: { report: ValueResearchReport }) {
  const [query, setQuery] = useState('')
  const [universeFilter, setUniverseFilter] = useState<UniverseFilter>('kmiall')
  const [sector, setSector] = useState('all')
  const [counter, setCounter] = useState<CounterFilter>('all')
  const [page, setPage] = useState(0)
  const pageSize = 50
  const sectors = useMemo(
    () => [...new Set(report.universe.map(row => row.sector))].sort(),
    [report.universe],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return report.universe.filter(row => {
      if (needle && !`${row.symbol} ${row.name} ${row.sector}`.toLowerCase().includes(needle)) return false
      if (universeFilter === 'kmi30' && !row.kmi30) return false
      if (universeFilter === 'held' && !row.held) return false
      if (sector !== 'all' && row.sector !== sector) return false
      if (counter === 'normal' && row.counter !== 'normal') return false
      if (counter === 'risk' && row.counter !== 'non_compliant_segment') return false
      return true
    })
  }, [counter, query, report.universe, sector, universeFilter])

  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1)
  const safePage = Math.min(page, maxPage)
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)
  const kmi30Count = report.universe.filter(row => row.kmi30).length
  const heldCount = report.universe.filter(row => row.held).length
  const riskCount = report.universe.filter(row => row.counter === 'non_compliant_segment').length

  function updateFilter(action: () => void) {
    action()
    setPage(0)
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="KMI All Share" value={`${report.universe.length}`} note="Current Shariah-screened universe" tone="positive" />
        <MetricCard label="KMI30" value={`${kmi30Count}`} note="Liquid, impact-cost-ranked subset" tone="info" />
        <MetricCard label="Already held" value={`${heldCount}`} note="Portfolio overlap with KMI All" />
        <MetricCard label="PSX segment risk" value={`${riskCount}`} note="Regulatory / winding-up segment; not a Shariah label" tone="warning" />
      </section>

      <Notice tone="info" title="KMI All and KMI30 answer different questions">
        KMI All Share is the broad Shariah-eligible set. KMI30 is a liquid, free-float and impact-cost ranked
        subset. A company leaving KMI30 can remain fully Shariah compliant; GLAXO and MTL are current portfolio
        examples.
      </Notice>

      <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">PSX Shariah company directory</h2>
              <p className="mt-1 text-xs text-gray-500">
                {report.listingSource !== 'unavailable'
                  ? `Fetched from PSX ${shortDate(report.listingFetchedAt)}${report.listingSource === 'partial' ? ' · partial result' : ''}`
                  : 'Live directory unavailable—verify membership manually'}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <label className="relative block">
                <span className="sr-only">Search Shariah universe</span>
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                <input
                  value={query}
                  onChange={event => updateFilter(() => setQuery(event.target.value))}
                  placeholder="Symbol, company, sector"
                  className="w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-9 pr-3 text-sm text-gray-200 outline-none placeholder:text-gray-600 focus:border-emerald-500 sm:w-56"
                />
              </label>
              <Select ariaLabel="Filter Shariah universe" value={universeFilter} onChange={value => updateFilter(() => setUniverseFilter(value as UniverseFilter))}>
                <option value="kmiall">KMI All Share</option>
                <option value="kmi30">KMI30 only</option>
                <option value="held">My holdings</option>
              </Select>
              <Select ariaLabel="Filter Shariah universe by sector" value={sector} onChange={value => updateFilter(() => setSector(value))}>
                <option value="all">All sectors</option>
                {sectors.map(item => (
                  <option key={item} value={item}>{titleCase(item)}</option>
                ))}
              </Select>
              <Select ariaLabel="Filter Shariah universe by PSX counter" value={counter} onChange={value => updateFilter(() => setCounter(value as CounterFilter))}>
                <option value="all">All PSX counters</option>
                <option value="normal">Normal counter</option>
                <option value="risk">Regulatory-risk segment</option>
              </Select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Sector</th>
                <th className="px-4 py-3 font-semibold">Membership</th>
                <th className="px-4 py-3 font-semibold">Board / counter</th>
                <th className="px-4 py-3 text-right font-semibold">Shares</th>
                <th className="px-6 py-3 text-right font-semibold">Free float</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {visible.map(row => <UniverseRow key={row.symbol} row={row} />)}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && (
          <p className="px-6 py-12 text-center text-sm text-gray-500">No companies match these filters.</p>
        )}
        <div className="flex flex-col gap-3 border-t border-gray-800 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-600">
            {filtered.length === 0 ? '0' : `${safePage * pageSize + 1}–${Math.min(filtered.length, (safePage + 1) * pageSize)}`} of {filtered.length}
          </p>
          <div className="flex gap-2">
            <PaginationButton disabled={safePage === 0} onClick={() => setPage(current => Math.max(0, current - 1))}>Previous</PaginationButton>
            <PaginationButton disabled={safePage >= maxPage} onClick={() => setPage(current => Math.min(maxPage, current + 1))}>Next</PaginationButton>
          </div>
        </div>
      </section>
    </div>
  )
}

function UniverseRow({ row }: { row: ShariahUniverseRow }) {
  return (
    <tr className={`transition-colors hover:bg-gray-800/35 ${row.held ? 'bg-emerald-950/10' : ''}`}>
      <td className="px-6 py-3.5">
        <a href={companyUrl(row.symbol)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-bold text-white hover:text-emerald-300">
          {row.symbol} <ExternalLink className="h-3 w-3 text-gray-600" />
        </a>
        <p className="mt-0.5 max-w-[270px] truncate text-xs text-gray-500" title={row.name}>{row.name}</p>
        {row.held && <span className="mt-1 inline-block text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Held</span>}
      </td>
      <td className="max-w-[240px] px-4 py-3.5 text-xs text-gray-400">{titleCase(row.sector)}</td>
      <td className="px-4 py-3.5">
        <div className="flex flex-wrap gap-1">
          {row.kmi30 && <IndexBadge label="KMI30" primary />}
          {row.kmiAllShare && <IndexBadge label="KMI All" />}
          {row.kse100 && <IndexBadge label="KSE100" />}
        </div>
      </td>
      <td className="px-4 py-3.5">
        <p className="text-xs text-gray-400">{row.board === 'gem' ? 'GEM' : 'Main board'}</p>
        {row.counter === 'non_compliant_segment' ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-400">
            <AlertTriangle className="h-3 w-3" /> PSX segment risk
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-gray-600">Normal counter</p>
        )}
      </td>
      <td className="px-4 py-3.5 text-right text-xs tabular-nums text-gray-400">
        {row.shares === null ? '—' : row.shares.toLocaleString('en-PK')}
      </td>
      <td className="px-6 py-3.5 text-right">
        <p className="text-xs font-medium tabular-nums text-gray-300">{pct(row.freeFloatPct)}</p>
        <p className="mt-0.5 text-[11px] tabular-nums text-gray-600">
          {row.freeFloat === null ? '—' : row.freeFloat.toLocaleString('en-PK')}
        </p>
      </td>
    </tr>
  )
}

function PaginationButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function Methodology() {
  const shariahTests = [
    ['Business activity', 'Core business must be halal; conventional banking, insurance, alcohol, tobacco and other prohibited activities fail.'],
    ['Interest-bearing debt', 'Debt / total assets must be below 37%. PSX has approved 33% from the November 2026 recomposition.'],
    ['Non-compliant investments', 'Non-compliant investments / total assets must be below 33%.'],
    ['Non-compliant income', 'Non-compliant income / total revenue must be below 5%; the dividend-related amount is purified.'],
    ['Illiquid assets', 'Illiquid assets / total assets must be at least 25%, subject to documented Shariah treatments.'],
    ['Net liquid assets', 'Market price per share must be at least net liquid assets per share.'],
  ] as const
  const ownerPrinciples = [
    ['Understand the economics', 'Stay inside a real circle of competence. Write how the business earns, who pays it, and why returns can persist.'],
    ['Prefer durable owner earnings', 'Normalize CFO less maintenance capex and working-capital needs; nominal EPS growth is not enough in Pakistan inflation.'],
    ['Demand conservative financing', 'The KMI gate is a start, not a full balance-sheet analysis. Stress FX debt, leases, guarantees and refinancing.'],
    ['Judge stewardship per share', 'Review related parties, dilution, retained-earnings value creation, sponsor conduct and candid disclosure.'],
    ['Pay below careful value', 'Use normalized earnings and explicit assumptions. A low P/E or price below your cost is not a margin of safety.'],
  ] as const
  const pakistanChecks = [
    'PKR depreciation and imported inputs',
    'Circular-debt receivables and late-payment income',
    'Gas, electricity and administered-price availability',
    'Tax, tariff, subsidy and regulatory changes',
    'Sponsor, state and related-party governance',
    'Free float, impact cost and exit liquidity',
    'Commodity-cycle and replacement-capex normalization',
    'Dividend purification and payout reliability',
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Two-stage decision gate</p>
        <h2 className="mt-2 text-2xl font-bold text-white">Eligibility first. Quality and price second.</h2>
        <div className="mt-6 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
          <GateCard number="01" icon={<ShieldCheck className="h-5 w-5" />} title="Shariah eligibility" copy="Current final status, exceptions, purification and exchange-segment risk. A failed gate blocks the opportunity queue." />
          <div className="flex items-center justify-center text-gray-700"><ArrowRight className="h-5 w-5 rotate-90 md:rotate-0" /></div>
          <GateCard number="02" icon={<BookOpen className="h-5 w-5" />} title="Owner-value research" copy="Business durability, normalized owner earnings, stewardship, financing, liquidity and a genuine margin of safety." />
        </div>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">KMI screen</p>
            <h2 className="mt-1 text-xl font-bold text-white">Six tests—all must pass</h2>
          </div>
          <a href={VALUE_RESEARCH_SOURCES.alMeezanMethodology} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300">
            Al Meezan source <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shariahTests.map(([title, copy], index) => (
            <div key={title} className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-950 text-[10px] font-bold text-emerald-400">{index + 1}</span>
                <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500">{copy}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-amber-900/50 bg-amber-950/25 p-4 text-xs leading-5 text-amber-200/70">
          The approved debt threshold moves from 37% to 33% for the November 2026 recomposition. Status is
          semiannual and point-in-time; it is not a permanent company attribute.
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-400">Buffett owner lens</p>
          <h2 className="mt-1 text-xl font-bold text-white">What survives the PSX translation</h2>
          <div className="mt-5 space-y-4">
            {ownerPrinciples.map(([title, copy]) => (
              <div key={title} className="border-b border-gray-800 pb-4 last:border-0 last:pb-0">
                <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-gray-500">{copy}</p>
              </div>
            ))}
          </div>
          <div className="mt-5"><ExternalSource href={VALUE_RESEARCH_SOURCES.berkshireOwnerManual} label="Berkshire owner manual" /></div>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-400">Pakistan overlay</p>
          <h2 className="mt-1 text-xl font-bold text-white">Risks a generic value screen misses</h2>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {pakistanChecks.map(check => (
              <div key={check} className="flex gap-2.5 rounded-lg border border-gray-800 bg-gray-950/40 p-3 text-xs leading-5 text-gray-400">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                {check}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-5">
          <div className="flex items-center gap-2 text-emerald-300"><Database className="h-4 w-4" /><h3 className="text-sm font-semibold">Automated screen includes</h3></div>
          <p className="mt-3 text-xs leading-6 text-emerald-100/55">Four-year reported profit consistency, EPS trend, TTM P/E snapshot, KMI/KSE liquidity membership, portfolio-sector fit, current price performance and recorded dividends.</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center gap-2 text-gray-300"><Eye className="h-4 w-4" /><h3 className="text-sm font-semibold">Human research still required</h3></div>
          <p className="mt-3 text-xs leading-6 text-gray-500">Moat, management, normalized CFO and maintenance capex, exact leverage, auditor and related parties, ten-year cyclicality, intrinsic value, downside scenarios and position sizing.</p>
        </div>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-base font-semibold text-white">Primary references</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SourceCard label="KMI All recomposition" note="309 companies · effective 5 Jun 2026" href={VALUE_RESEARCH_SOURCES.kmiAllNotice} />
          <SourceCard label="KMI30 recomposition" note="30 liquid constituents · effective 25 May 2026" href={VALUE_RESEARCH_SOURCES.kmi30Notice} />
          <SourceCard label="Al Meezan methodology" note="Six Shariah screens and purification" href={VALUE_RESEARCH_SOURCES.alMeezanMethodology} />
          <SourceCard label="KMI30 brochure" note="Liquidity, free float and impact-cost ranking" href={VALUE_RESEARCH_SOURCES.kmi30Brochure} />
          <SourceCard label="KMI All brochure" note="Broad universe and illiquidity disclosure" href={VALUE_RESEARCH_SOURCES.kmiAllBrochure} />
          <SourceCard label="2026 methodology revision" note="33% debt screen from November 2026" href={VALUE_RESEARCH_SOURCES.methodologyRevision} />
        </div>
      </section>
    </div>
  )
}

function GateCard({
  number,
  icon,
  title,
  copy,
}: {
  number: string
  icon: React.ReactNode
  title: string
  copy: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/45 p-5">
      <div className="flex items-center justify-between text-emerald-400"><span>{icon}</span><span className="text-xs font-bold text-gray-700">{number}</span></div>
      <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-gray-500">{copy}</p>
    </div>
  )
}

function SourceCard({ label, note, href }: { label: string; note: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group rounded-lg border border-gray-800 bg-gray-950/40 p-4 transition-colors hover:border-gray-700 hover:bg-gray-800/50">
      <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-gray-200 group-hover:text-white">{label}</p><ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-600 group-hover:text-emerald-400" /></div>
      <p className="mt-2 text-xs leading-5 text-gray-600">{note}</p>
    </a>
  )
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, character => character.toUpperCase())
}
