import { describe, expect, it } from 'vitest'
import type { Dividend } from './db.server'
import {
  buildCombinedDividendTaxReport,
  calcDividendWht,
  calcDividendWithheld,
  dividendTaxReportToCsv,
} from './dividendTax'

const sample: Dividend[] = [
  {
    id: 1,
    account: 'jane',
    event_id: 'e1',
    symbol: 'HUBC',
    security_name: 'Hub Power',
    financial_year: '2025',
    gross_amount: 100,
    net_amount: 85,
    status: 'paid',
    payment_date: '2025-06-01',
    shares: 50,
  },
  {
    id: 2,
    account: 'john',
    event_id: 'e2',
    symbol: 'OGDC',
    security_name: null,
    financial_year: '2025',
    gross_amount: 200,
    net_amount: 170,
    status: 'paid',
    payment_date: '2025-07-01',
    shares: 100,
  },
]

describe('dividendTax', () => {
  it('calculates WHT and withheld amounts', () => {
    expect(calcDividendWht(100)).toBe(15)
    expect(calcDividendWithheld(100, 85)).toBe(15)
  })

  it('builds combined report with per-account summaries', () => {
    const report = buildCombinedDividendTaxReport(sample)
    expect(report.rows).toHaveLength(2)
    expect(report.by_account).toHaveLength(2)
    expect(report.summary.count).toBe(2)
    expect(report.summary.total_gross).toBe(300)
    expect(report.summary.total_wht).toBe(45)
    expect(report.summary.total_withheld).toBe(45)
  })

  it('exports CSV with headers and totals', () => {
    const report = buildCombinedDividendTaxReport(sample)
    const csv = dividendTaxReportToCsv(report)
    expect(csv).toContain('PSX Combined Dividend Tax Report')
    expect(csv).toContain('jane,HUBC,Hub Power')
    expect(csv).toContain('Combined Total,2,300,255,45,45')
  })
})
