import type { Dividend } from './db.server'
import { roundMoney } from './fees'

/** PSX cash dividend withholding tax rate on gross payout. */
export const DIVIDEND_WHT_RATE = 0.15

export interface DividendTaxRow {
  id: number
  account: string
  symbol: string
  security_name: string | null
  financial_year: string
  payment_date: string
  shares: number | null
  gross_amount: number
  net_amount: number
  /** Recorded CDC deduction (gross − net). */
  withheld: number
  /** Standard 15% WHT on gross. */
  wht_amount: number
}

export interface DividendTaxAccountSummary {
  account: string
  count: number
  total_gross: number
  total_net: number
  total_withheld: number
  total_wht: number
}

export interface CombinedDividendTaxReport {
  rows: DividendTaxRow[]
  by_account: DividendTaxAccountSummary[]
  summary: Omit<DividendTaxAccountSummary, 'account'>
  generated_at: string
}

export function calcDividendWht(grossAmount: number): number {
  return roundMoney(grossAmount * DIVIDEND_WHT_RATE)
}

export function calcDividendWithheld(grossAmount: number, netAmount: number): number {
  return roundMoney(grossAmount - netAmount)
}

function toTaxRow(d: Dividend): DividendTaxRow {
  return {
    id: d.id,
    account: d.account,
    symbol: d.symbol,
    security_name: d.security_name,
    financial_year: d.financial_year,
    payment_date: d.payment_date,
    shares: d.shares,
    gross_amount: d.gross_amount,
    net_amount: d.net_amount,
    withheld: calcDividendWithheld(d.gross_amount, d.net_amount),
    wht_amount: calcDividendWht(d.gross_amount),
  }
}

function summarizeAccount(rows: DividendTaxRow[]): DividendTaxAccountSummary {
  const account = rows[0]?.account ?? ''
  return rows.reduce<DividendTaxAccountSummary>(
    (acc, row) => ({
      account,
      count: acc.count + 1,
      total_gross: roundMoney(acc.total_gross + row.gross_amount),
      total_net: roundMoney(acc.total_net + row.net_amount),
      total_withheld: roundMoney(acc.total_withheld + row.withheld),
      total_wht: roundMoney(acc.total_wht + row.wht_amount),
    }),
    { account, count: 0, total_gross: 0, total_net: 0, total_withheld: 0, total_wht: 0 },
  )
}

export function buildCombinedDividendTaxReport(dividends: Dividend[]): CombinedDividendTaxReport {
  const rows = dividends.map(toTaxRow)
  const byAccountMap = new Map<string, DividendTaxRow[]>()
  for (const row of rows) {
    const list = byAccountMap.get(row.account) ?? []
    list.push(row)
    byAccountMap.set(row.account, list)
  }

  const by_account = [...byAccountMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, accountRows]) => summarizeAccount(accountRows))

  const summary = rows.reduce<Omit<DividendTaxAccountSummary, 'account'>>(
    (acc, row) => ({
      count: acc.count + 1,
      total_gross: roundMoney(acc.total_gross + row.gross_amount),
      total_net: roundMoney(acc.total_net + row.net_amount),
      total_withheld: roundMoney(acc.total_withheld + row.withheld),
      total_wht: roundMoney(acc.total_wht + row.wht_amount),
    }),
    { count: 0, total_gross: 0, total_net: 0, total_withheld: 0, total_wht: 0 },
  )

  return {
    rows,
    by_account,
    summary,
    generated_at: new Date().toISOString(),
  }
}

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function csvLine(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',')
}

export function dividendTaxReportToCsv(report: CombinedDividendTaxReport): string {
  const whtRateLabel = `${DIVIDEND_WHT_RATE * 100}% of gross`
  const lines: string[] = [
    csvLine(['PSX Combined Dividend Tax Report']),
    csvLine(['Generated', report.generated_at.slice(0, 10)]),
    csvLine(['WHT rate', whtRateLabel]),
    '',
    csvLine([
      'Account',
      'Symbol',
      'Security',
      'Financial Year',
      'Payment Date',
      'Shares',
      'Gross (PKR)',
      'Net (PKR)',
      'Withheld (PKR)',
      'WHT 15% (PKR)',
    ]),
  ]

  for (const row of report.rows) {
    lines.push(
      csvLine([
        row.account,
        row.symbol,
        row.security_name,
        row.financial_year,
        row.payment_date,
        row.shares,
        row.gross_amount,
        row.net_amount,
        row.withheld,
        row.wht_amount,
      ]),
    )
  }

  lines.push('')
  lines.push(csvLine(['Account Summary']))
  lines.push(
    csvLine([
      'Account',
      'Events',
      'Gross (PKR)',
      'Net (PKR)',
      'Withheld (PKR)',
      'WHT 15% (PKR)',
    ]),
  )
  for (const acct of report.by_account) {
    lines.push(
      csvLine([
        acct.account,
        acct.count,
        acct.total_gross,
        acct.total_net,
        acct.total_withheld,
        acct.total_wht,
      ]),
    )
  }

  lines.push('')
  lines.push(
    csvLine([
      'Combined Total',
      report.summary.count,
      report.summary.total_gross,
      report.summary.total_net,
      report.summary.total_withheld,
      report.summary.total_wht,
    ]),
  )

  return `${lines.join('\n')}\n`
}
