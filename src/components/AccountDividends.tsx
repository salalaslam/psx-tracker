import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { Dividend, DividendSummary, HoldingWithPrice } from '../db.server'
import { calcDividendYieldOnCost, dividendPerShare } from '../dividends'
import {
  serverAddDividend,
  serverDeleteDividend,
  serverImportDividends,
} from '../serverFns'
import { formatPaymentDate, parseDividendPaste } from '../dividends'

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type SortKey =
  | 'event_id'
  | 'symbol'
  | 'security_name'
  | 'financial_year'
  | 'shares'
  | 'gross_amount'
  | 'net_amount'
  | 'divYield'
  | 'status'
  | 'payment_date'

export function AccountDividends({
  account,
  dividends,
  summary,
  holdings,
}: {
  account: string
  dividends: Dividend[]
  summary: DividendSummary
  holdings: HoldingWithPrice[]
}) {
  const costBySymbol = Object.fromEntries(
    holdings.map(h => [h.symbol, h.total_invested / h.shares]),
  )
  const holdingShares = holdings.reduce((sum, h) => sum + h.shares, 0)
  const accountDivYield = calcDividendYieldOnCost({
    totalNet: summary.total_net,
    totalDividendShares: summary.total_shares,
    invested: holdings.reduce((sum, h) => sum + h.total_invested, 0),
    holdingShares,
    eventCount: summary.count,
  })
  const accountDps = dividendPerShare(summary.total_net, summary.total_shares)
  const router = useRouter()
  const [sortColumn, setSortColumn] = useState<SortKey | null>('payment_date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [showAddForm, setShowAddForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const [eventId, setEventId] = useState('')
  const [symbol, setSymbol] = useState('')
  const [securityName, setSecurityName] = useState('')
  const [financialYear, setFinancialYear] = useState('')
  const [grossAmount, setGrossAmount] = useState('')
  const [netAmount, setNetAmount] = useState('')
  const [status, setStatus] = useState('paid')
  const [paymentDate, setPaymentDate] = useState('')
  const [shares, setShares] = useState('')

  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<{
    count: number
    format: string
    errors: string[]
  } | null>(null)

  function toggleSort(col: SortKey) {
    if (sortColumn === col) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

  const rowYield = (d: Dividend) => {
    const dps = dividendPerShare(d.net_amount, d.shares)
    const cost = costBySymbol[d.symbol]
    if (dps == null || cost == null || cost <= 0) return null
    return (dps / cost) * 100
  }

  const sorted = [...dividends].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'divYield') {
      return ((rowYield(a) ?? -1) - (rowYield(b) ?? -1)) * dir
    }
    const av =
      sortColumn === 'shares' ? (a.shares ?? -1) : (a[sortColumn] ?? '')
    const bv =
      sortColumn === 'shares' ? (b.shares ?? -1) : (b[sortColumn] ?? '')
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })

  function sortIndicator(col: SortKey) {
    if (sortColumn !== col) return ' ↕'
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    setFormSuccess(null)
    try {
      const result = await serverAddDividend({
        data: {
          account,
          event_id: eventId,
          symbol,
          security_name: securityName || null,
          financial_year: financialYear,
          gross_amount: Number(grossAmount),
          net_amount: Number(netAmount),
          status,
          payment_date: paymentDate,
          ...(shares.trim() ? { shares: Number(shares) } : {}),
        },
      })
      if (!result.ok) {
        setFormError(result.error ?? 'Could not add dividend')
        return
      }
      setFormSuccess('Dividend added')
      setEventId('')
      setSymbol('')
      setSecurityName('')
      setFinancialYear('')
      setGrossAmount('')
      setNetAmount('')
      setPaymentDate('')
      setShares('')
      await router.invalidate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add dividend')
    } finally {
      setSaving(false)
    }
  }

  function handlePreviewImport() {
    const { rows, errors, format } = parseDividendPaste(importText)
    setImportPreview({
      count: rows.length,
      format: format === 'summary_report' ? 'CDC summary (shares)' : 'payment history',
      errors,
    })
  }

  async function handleConfirmImport() {
    setSaving(true)
    setFormError(null)
    setFormSuccess(null)
    try {
      const result = await serverImportDividends({ data: { account, text: importText } })
      const parts = [`${result.inserted} new`, `${result.updated} updated`, `${result.skipped} skipped`]
      const msg = `Import: ${parts.join(', ')}`
      if (result.errors.length > 0) {
        setFormError(`${msg}. ${result.errors.slice(0, 3).join('; ')}`)
      } else {
        setFormSuccess(msg)
      }
      setImportText('')
      setImportPreview(null)
      setShowImport(false)
      await router.invalidate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, event_id: string) {
    if (!confirm(`Delete dividend ${event_id}?`)) return
    setSaving(true)
    setFormError(null)
    try {
      await serverDeleteDividend({ data: { id, account } })
      await router.invalidate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total Net Received</p>
          <p className="mt-1 text-xl font-bold text-emerald-400">₨ {fmt(summary.total_net)}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total Gross</p>
          <p className="mt-1 text-xl font-bold text-white">₨ {fmt(summary.total_gross)}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Dividend Events</p>
          <p className="mt-1 text-xl font-bold text-white">{summary.count}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Dividend Yield</p>
          <p className="mt-1 text-xl font-bold text-emerald-400">
            {accountDivYield !== null ? `${accountDivYield.toFixed(2)}%` : '—'}
          </p>
          {accountDps != null && (
            <p className="mt-0.5 text-xs text-gray-500">₨ {accountDps.toFixed(2)}/sh on cost</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setShowAddForm(v => !v)
            setShowImport(false)
          }}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 transition-colors"
        >
          {showAddForm ? 'Hide form' : 'Add dividend'}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowImport(v => !v)
            setShowAddForm(false)
            setImportPreview(null)
          }}
          className="rounded-md bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
        >
          {showImport ? 'Hide import' : 'Import from CDC'}
        </button>
      </div>

      {formError && (
        <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
          {formError}
        </div>
      )}
      {formSuccess && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950 px-4 py-3 text-sm text-emerald-300">
          {formSuccess}
        </div>
      )}

      {showAddForm && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Add dividend
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label>
                <span className="mb-1 block text-xs text-gray-500">Event ID</span>
                <input
                  value={eventId}
                  onChange={e => setEventId(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                  disabled={saving}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-gray-500">Symbol</span>
                <input
                  value={symbol}
                  onChange={e => setSymbol(e.target.value.toUpperCase())}
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm uppercase"
                  disabled={saving}
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs text-gray-500">Security name</span>
                <input
                  value={securityName}
                  onChange={e => setSecurityName(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                  disabled={saving}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-gray-500">Financial year</span>
                <input
                  value={financialYear}
                  onChange={e => setFinancialYear(e.target.value)}
                  placeholder="2025-26"
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                  disabled={saving}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-gray-500">Gross (PKR)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={grossAmount}
                  onChange={e => setGrossAmount(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                  disabled={saving}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-gray-500">Net (PKR)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={netAmount}
                  onChange={e => setNetAmount(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                  disabled={saving}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-gray-500">Status</span>
                <input
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                  disabled={saving}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-gray-500">Payment date</span>
                <input
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                  disabled={saving}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs text-gray-500">Shares held</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={shares}
                  onChange={e => setShares(e.target.value)}
                  placeholder="e.g. 89"
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                  disabled={saving}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-fit rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save dividend'}
            </button>
          </form>
        </div>
      )}

      {showImport && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            Bulk import (CDC paste)
          </h2>
          <p className="text-xs text-gray-500">
            Paste CDC payment history or the dividend summary report (with shares held).
            Summary rows match existing dividends by symbol, date, and net amount.
          </p>
          <textarea
            value={importText}
            onChange={e => {
              setImportText(e.target.value)
              setImportPreview(null)
            }}
            rows={8}
            placeholder="Event ID	Symbol	Name	FY	Gross	Net	Status	Date"
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-gray-100"
            disabled={saving}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePreviewImport}
              disabled={!importText.trim() || saving}
              className="rounded-md bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
            >
              Preview import
            </button>
            {importPreview && importPreview.count > 0 && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={saving}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Import {importPreview.count} row(s)
              </button>
            )}
          </div>
          {importPreview && (
            <div className="text-sm text-gray-400">
              {importPreview.count} row(s) ready ({importPreview.format}).
              {importPreview.errors.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-red-400">
                  {importPreview.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {dividends.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-12 text-center text-sm text-gray-500">
          No dividends recorded yet.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="border-b border-gray-800 px-5 py-3 flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Dividends
            </h2>
            <span className="text-xs text-gray-500">{dividends.length} events</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[62rem] text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">
                    <button type="button" onClick={() => toggleSort('event_id')} className="hover:text-gray-300">
                      Event ID{sortIndicator('event_id')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button type="button" onClick={() => toggleSort('symbol')} className="hover:text-gray-300">
                      Symbol{sortIndicator('symbol')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button type="button" onClick={() => toggleSort('security_name')} className="hover:text-gray-300">
                      Name{sortIndicator('security_name')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <button type="button" onClick={() => toggleSort('financial_year')} className="hover:text-gray-300">
                      FY{sortIndicator('financial_year')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button type="button" onClick={() => toggleSort('shares')} className="hover:text-gray-300">
                      Shares{sortIndicator('shares')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button type="button" onClick={() => toggleSort('gross_amount')} className="hover:text-gray-300">
                      Gross{sortIndicator('gross_amount')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button type="button" onClick={() => toggleSort('net_amount')} className="hover:text-gray-300">
                      Net{sortIndicator('net_amount')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button type="button" onClick={() => toggleSort('divYield')} className="hover:text-gray-300">
                      Div. Yield{sortIndicator('divYield')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <button type="button" onClick={() => toggleSort('status')} className="hover:text-gray-300">
                      Status{sortIndicator('status')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <button type="button" onClick={() => toggleSort('payment_date')} className="hover:text-gray-300">
                      Payment date{sortIndicator('payment_date')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {sorted.map(d => (
                  <tr key={d.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{d.event_id}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-400 whitespace-nowrap">
                      {d.symbol}
                    </td>
                    <td className="px-4 py-3 text-gray-300 max-w-[14rem] truncate" title={d.security_name ?? ''}>
                      {d.security_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">{d.financial_year}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-300">
                      {d.shares != null ? d.shares.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-300">{fmt(d.gross_amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-200">
                      {fmt(d.net_amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {rowYield(d) != null ? (
                        <div>
                          <span className="font-medium text-emerald-400 tabular-nums">
                            {rowYield(d)!.toFixed(2)}%
                          </span>
                          {d.shares != null && (
                            <p className="text-xs text-gray-500 tabular-nums">
                              ₨ {(d.net_amount / d.shares).toFixed(2)}/sh
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs uppercase text-gray-400">{d.status}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500 whitespace-nowrap">
                      {formatPaymentDate(d.payment_date)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(d.id, d.event_id)}
                        disabled={saving}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
