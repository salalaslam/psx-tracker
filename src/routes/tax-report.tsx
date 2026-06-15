import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { formatPaymentDate } from '../dividends'
import {
  DIVIDEND_WHT_RATE,
  dividendTaxReportToCsv,
  type DividendTaxRow,
} from '../dividendTax'
import { serverGetCombinedDividendTaxReport } from '../serverFns'

export const Route = createFileRoute('/tax-report')({
  loader: async () => serverGetCombinedDividendTaxReport(),
  component: TaxReportPage,
})

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function accountLabel(account: string): string {
  return account.charAt(0).toUpperCase() + account.slice(1)
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

type SortKey = keyof Pick<
  DividendTaxRow,
  'account' | 'symbol' | 'payment_date' | 'gross_amount' | 'wht_amount' | 'withheld'
>

function TaxReportPage() {
  const report = Route.useLoaderData()
  const [sortColumn, setSortColumn] = useState<SortKey>('payment_date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const sortedRows = useMemo(() => {
    const rows = [...report.rows]
    rows.sort((a, b) => {
      const av = a[sortColumn]
      const bv = b[sortColumn]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDirection === 'asc' ? av - bv : bv - av
      }
      const cmp = String(av).localeCompare(String(bv))
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return rows
  }, [report.rows, sortColumn, sortDirection])

  function toggleSort(col: SortKey) {
    if (sortColumn === col) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection(col === 'payment_date' ? 'desc' : 'asc')
    }
  }

  function sortIndicator(col: SortKey) {
    if (sortColumn !== col) return null
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  function handleDownload() {
    const date = report.generated_at.slice(0, 10)
    downloadCsv(dividendTaxReportToCsv(report), `dividend-tax-report-${date}.csv`)
  }

  const { summary } = report

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Combined Tax Report</h1>
          <p className="mt-1 text-sm text-gray-400">
            Dividend withholding tax across all accounts — {DIVIDEND_WHT_RATE * 100}% WHT on gross
            payouts
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Generated {formatPaymentDate(report.generated_at.slice(0, 10))} · {summary.count} events
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={summary.count === 0}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Download CSV
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Gross Dividends" value={`₨ ${fmt(summary.total_gross)}`} />
        <SummaryTile label="Net Received" value={`₨ ${fmt(summary.total_net)}`} color="text-emerald-400" />
        <SummaryTile
          label={`WHT (${DIVIDEND_WHT_RATE * 100}%)`}
          value={`₨ ${fmt(summary.total_wht)}`}
          color="text-amber-400"
        />
        <SummaryTile
          label="Recorded Withheld"
          value={`₨ ${fmt(summary.total_withheld)}`}
          sub={
            summary.total_withheld !== summary.total_wht
              ? `Δ ₨ ${fmt(Math.abs(summary.total_withheld - summary.total_wht))} vs WHT`
              : 'Matches 15% WHT'
          }
        />
      </div>

      {report.by_account.length > 0 && (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
            By account
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {report.by_account.map(acct => (
              <div key={acct.account} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                <h3 className="font-semibold text-gray-200">{accountLabel(acct.account)}</h3>
                <p className="mt-1 text-xs text-gray-500">{acct.count} events</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Gross" value={`₨ ${fmt(acct.total_gross)}`} />
                  <Row label="Net" value={`₨ ${fmt(acct.total_net)}`} valueClass="text-emerald-400" />
                  <Row
                    label="WHT 15%"
                    value={`₨ ${fmt(acct.total_wht)}`}
                    valueClass="text-amber-400"
                  />
                  <Row label="Withheld" value={`₨ ${fmt(acct.total_withheld)}`} />
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      {summary.count === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center text-gray-400">
          No dividend payments recorded yet. Import CDC payouts on each account&apos;s Dividends tab.
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-200">All dividend events</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-gray-800 bg-gray-950/80 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <SortHeader col="account" label="Account" onSort={toggleSort} indicator={sortIndicator} />
                  <SortHeader col="symbol" label="Symbol" onSort={toggleSort} indicator={sortIndicator} />
                  <th className="px-4 py-3">Security</th>
                  <th className="px-4 py-3">FY</th>
                  <SortHeader
                    col="payment_date"
                    label="Paid"
                    onSort={toggleSort}
                    indicator={sortIndicator}
                  />
                  <th className="px-4 py-3 text-right">Shares</th>
                  <SortHeader
                    col="gross_amount"
                    label="Gross"
                    align="right"
                    onSort={toggleSort}
                    indicator={sortIndicator}
                  />
                  <th className="px-4 py-3 text-right">Net</th>
                  <SortHeader
                    col="withheld"
                    label="Withheld"
                    align="right"
                    onSort={toggleSort}
                    indicator={sortIndicator}
                  />
                  <SortHeader
                    col="wht_amount"
                    label="WHT 15%"
                    align="right"
                    onSort={toggleSort}
                    indicator={sortIndicator}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sortedRows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-800/40">
                    <td className="px-4 py-3 text-gray-300">{accountLabel(row.account)}</td>
                    <td className="px-4 py-3 font-medium text-white">{row.symbol}</td>
                    <td className="px-4 py-3 text-gray-400">{row.security_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{row.financial_year}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {formatPaymentDate(row.payment_date)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {row.shares != null ? row.shares.toLocaleString('en-PK') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">₨ {fmt(row.gross_amount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">₨ {fmt(row.net_amount)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">₨ {fmt(row.withheld)}</td>
                    <td className="px-4 py-3 text-right text-amber-400">₨ {fmt(row.wht_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-700 bg-gray-950/80 font-semibold text-gray-200">
                <tr>
                  <td className="px-4 py-3" colSpan={6}>
                    Combined total
                  </td>
                  <td className="px-4 py-3 text-right">₨ {fmt(summary.total_gross)}</td>
                  <td className="px-4 py-3 text-right text-emerald-400">
                    ₨ {fmt(summary.total_net)}
                  </td>
                  <td className="px-4 py-3 text-right">₨ {fmt(summary.total_withheld)}</td>
                  <td className="px-4 py-3 text-right text-amber-400">
                    ₨ {fmt(summary.total_wht)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function SummaryTile({
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
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color ?? 'text-white'}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className={valueClass ?? 'text-gray-200'}>{value}</dd>
    </div>
  )
}

function SortHeader({
  col,
  label,
  align = 'left',
  onSort,
  indicator,
}: {
  col: SortKey
  label: string
  align?: 'left' | 'right'
  onSort: (col: SortKey) => void
  indicator: (col: SortKey) => string | null
}) {
  return (
    <th className={`px-4 py-3 ${align === 'right' ? 'text-right' : ''}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className="inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-gray-300"
      >
        {label}
        {indicator(col)}
      </button>
    </th>
  )
}
