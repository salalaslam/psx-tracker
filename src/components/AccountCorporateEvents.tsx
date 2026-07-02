import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { CorporateEvent, HoldingWithPrice } from '../db.server'
import { calcSplitAdjustment, formatSplitRatio } from '../corporateEvents'
import { serverAddCorporateEvent, serverDeleteCorporateEvent } from '../serverFns'

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

type SortKey = 'effective_date' | 'symbol' | 'ratio' | 'shares_before' | 'shares_after'

export function AccountCorporateEvents({
  account,
  events,
  holdings,
}: {
  account: string
  events: CorporateEvent[]
  holdings: HoldingWithPrice[]
}) {
  const router = useRouter()
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<SortKey | null>('effective_date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const [symbol, setSymbol] = useState('')
  const [ratioFrom, setRatioFrom] = useState('1')
  const [ratioTo, setRatioTo] = useState('2')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [notes, setNotes] = useState('')

  const holdingSymbols = holdings.map(h => h.symbol).sort()

  const preview = useMemo(() => {
    const sym = symbol.trim().toUpperCase()
    const holding = holdings.find(h => h.symbol === sym)
    const from = Number(ratioFrom)
    const to = Number(ratioTo)
    if (!holding || !Number.isInteger(from) || from <= 0 || !Number.isInteger(to) || to <= 0) {
      return null
    }
    try {
      return calcSplitAdjustment(holding.shares, holding.cost_avg, from, to)
    } catch {
      return null
    }
  }, [symbol, ratioFrom, ratioTo, holdings])

  function toggleSort(col: SortKey) {
    if (sortColumn === col) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

  function sortIndicator(col: SortKey) {
    if (sortColumn !== col) return ' ↕'
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  const sorted = [...events].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'ratio') {
      const av = a.ratio_to / a.ratio_from
      const bv = b.ratio_to / b.ratio_from
      return (av - bv) * dir
    }
    const av = a[sortColumn]
    const bv = b[sortColumn]
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    setFormSuccess(null)
    try {
      const result = await serverAddCorporateEvent({
        data: {
          account,
          symbol,
          event_type: 'split',
          effective_date: effectiveDate,
          ratio_from: Number(ratioFrom),
          ratio_to: Number(ratioTo),
          notes: notes.trim() || null,
        },
      })
      if (!result.ok) {
        setFormError(result.error ?? 'Could not record event')
        return
      }
      setFormSuccess('Split applied to holdings')
      setSymbol('')
      setRatioFrom('1')
      setRatioTo('2')
      setEffectiveDate('')
      setNotes('')
      setShowAddForm(false)
      await router.invalidate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not record event')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, sym: string) {
    if (!confirm(`Delete ${sym} split event and reverse holdings adjustment?`)) return
    setSaving(true)
    setFormError(null)
    setFormSuccess(null)
    try {
      const result = await serverDeleteCorporateEvent({ data: { id, account } })
      if (!result.ok) {
        setFormError(result.error ?? 'Could not delete event')
        return
      }
      await router.invalidate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not delete event')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        Record share splits and similar corporate actions. Applying a split updates share count and
        cost average while keeping total invested unchanged.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowAddForm(v => !v)}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 transition-colors"
        >
          {showAddForm ? 'Hide form' : 'Record split'}
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
              Record share split
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label>
                <span className="mb-1 block text-xs text-gray-500">Symbol</span>
                <input
                  list="holding-symbols"
                  value={symbol}
                  onChange={e => setSymbol(e.target.value.toUpperCase())}
                  required
                  placeholder="MTL"
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm uppercase"
                  disabled={saving}
                />
                <datalist id="holding-symbols">
                  {holdingSymbols.map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              <label>
                <span className="mb-1 block text-xs text-gray-500">Ratio (old : new)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={ratioFrom}
                    onChange={e => setRatioFrom(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                    disabled={saving}
                  />
                  <span className="text-gray-500">:</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={ratioTo}
                    onChange={e => setRatioTo(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                    disabled={saving}
                  />
                </div>
              </label>
              <label>
                <span className="mb-1 block text-xs text-gray-500">Effective date</span>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={e => setEffectiveDate(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                  disabled={saving}
                />
              </label>
              <label className="sm:col-span-2 lg:col-span-4">
                <span className="mb-1 block text-xs text-gray-500">Notes (optional)</span>
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. MTL sub-division Rs10 → Rs5, record date 19-Jun-2026"
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                  disabled={saving}
                />
              </label>
            </div>

            {preview && (
              <div className="rounded-lg border border-gray-700 bg-gray-800/60 px-4 py-3 text-sm text-gray-300">
                <span className="text-gray-500">Preview: </span>
                {preview.sharesBefore.toLocaleString()} → {preview.sharesAfter.toLocaleString()}{' '}
                shares · ₨ {fmt(preview.costAvgBefore)} → ₨ {fmt(preview.costAvgAfter)} avg cost ·
                invested unchanged at ₨ {fmt(preview.totalInvested)}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving || !preview}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? 'Applying…' : 'Apply split'}
              </button>
            </div>
          </form>
        </div>
      )}

      {events.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-8 text-center text-sm text-gray-500">
          No corporate events recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort('effective_date')}>
                  Date{sortIndicator('effective_date')}
                </th>
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort('symbol')}>
                  Symbol{sortIndicator('symbol')}
                </th>
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort('ratio')}>
                  Ratio{sortIndicator('ratio')}
                </th>
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort('shares_before')}>
                  Shares{sortIndicator('shares_before')}
                </th>
                <th className="px-4 py-3">Avg cost</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {sorted.map(ev => (
                <tr key={ev.id} className="hover:bg-gray-800/40">
                  <td className="px-4 py-3 text-gray-300">{fmtDate(ev.effective_date)}</td>
                  <td className="px-4 py-3 font-medium text-white">{ev.symbol}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {formatSplitRatio(ev.ratio_from, ev.ratio_to)}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {ev.shares_before.toLocaleString()} → {ev.shares_after.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    ₨ {fmt(ev.cost_avg_before)} → ₨ {fmt(ev.cost_avg_after)}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-gray-500" title={ev.notes ?? ''}>
                    {ev.notes ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(ev.id, ev.symbol)}
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
      )}
    </div>
  )
}
