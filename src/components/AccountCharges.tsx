import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { AccountCharge, AccountChargeSummary } from '../db.server'
import {
  ACCOUNT_CHARGE_CATEGORIES,
  accountChargeCategoryLabel,
} from '../accountCharges'
import { serverAddAccountCharge, serverDeleteAccountCharge } from '../serverFns'

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`
}

type SortKey = 'charged_at' | 'category' | 'label' | 'amount' | 'voucher_no'

export function AccountCharges({
  account,
  charges,
  summary,
}: {
  account: string
  charges: AccountCharge[]
  summary: AccountChargeSummary
}) {
  const router = useRouter()
  const [sortColumn, setSortColumn] = useState<SortKey>('charged_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const [category, setCategory] = useState<string>('cgt')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [chargedAt, setChargedAt] = useState('')
  const [voucherNo, setVoucherNo] = useState('')
  const [notes, setNotes] = useState('')

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

  const sorted = [...charges].sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1
    const av = a[sortColumn] ?? ''
    const bv = b[sortColumn] ?? ''
    if (sortColumn === 'amount') return (a.amount - b.amount) * dir
    return String(av).localeCompare(String(bv)) * dir
  })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    setFormSuccess(null)
    try {
      const parsed = Number(amount)
      const result = await serverAddAccountCharge({
        data: {
          account,
          category,
          label,
          amount: parsed,
          charged_at: chargedAt,
          voucher_no: voucherNo.trim() || null,
          notes: notes.trim() || null,
        },
      })
      if (!result.ok) {
        setFormError(result.error ?? 'Could not add charge')
        return
      }
      setFormSuccess('Charge recorded')
      setLabel('')
      setAmount('')
      setChargedAt('')
      setVoucherNo('')
      setNotes('')
      setShowAddForm(false)
      await router.invalidate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add charge')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, chargeLabel: string) {
    if (!confirm(`Delete "${chargeLabel}"?`)) return
    setSaving(true)
    setFormError(null)
    try {
      await serverDeleteAccountCharge({ data: { id, account } })
      await router.invalidate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Net charges</p>
          <p
            className={`mt-1 text-xl font-bold ${
              summary.net < 0 ? 'text-red-400' : summary.net > 0 ? 'text-emerald-400' : 'text-white'
            }`}
          >
            {summary.net >= 0 ? '+' : ''}₨ {fmt(summary.net)}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">Debits + credits (cash ledger)</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total debits</p>
          <p className="mt-1 text-xl font-bold text-red-400">₨ {fmt(summary.total_debits)}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total credits</p>
          <p className="mt-1 text-xl font-bold text-emerald-400">+₨ {fmt(summary.total_credits)}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Entries</p>
          <p className="mt-1 text-xl font-bold text-white">{summary.count}</p>
        </div>
      </div>

      <p className="text-sm text-gray-400">
        Non-trade cash from your broker statement (CGT, registration, tariffs). Use negative amounts for
        debits and positive for credits. These do not change per-share cost on holdings.
      </p>

      {(formError || formSuccess) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            formError
              ? 'border-red-900/50 bg-red-950/30 text-red-300'
              : 'border-emerald-900/50 bg-emerald-950/30 text-emerald-300'
          }`}
        >
          {formError ?? formSuccess}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowAddForm(v => !v)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          {showAddForm ? 'Cancel' : 'Add charge'}
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4 grid gap-4 sm:grid-cols-2"
        >
          <label className="sm:col-span-1">
            <span className="mb-1 block text-xs text-gray-500">Category</span>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              disabled={saving}
            >
              {ACCOUNT_CHARGE_CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-1">
            <span className="mb-1 block text-xs text-gray-500">Date</span>
            <input
              type="date"
              value={chargedAt}
              onChange={e => setChargedAt(e.target.value)}
              required
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              disabled={saving}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-gray-500">Label (as on statement)</span>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="CGT-DEC-2025"
              required
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              disabled={saving}
            />
          </label>
          <label className="sm:col-span-1">
            <span className="mb-1 block text-xs text-gray-500">Amount (₨)</span>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="-31.18 for debit"
              required
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              disabled={saving}
            />
          </label>
          <label className="sm:col-span-1">
            <span className="mb-1 block text-xs text-gray-500">Voucher no.</span>
            <input
              type="text"
              value={voucherNo}
              onChange={e => setVoucherNo(e.target.value)}
              placeholder="GV010024"
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              disabled={saving}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-gray-500">Notes (optional)</span>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              disabled={saving}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save charge'}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3 cursor-pointer" onClick={() => toggleSort('charged_at')}>
                  Date{sortIndicator('charged_at')}
                </th>
                <th className="px-5 py-3 cursor-pointer" onClick={() => toggleSort('category')}>
                  Type{sortIndicator('category')}
                </th>
                <th className="px-5 py-3 cursor-pointer" onClick={() => toggleSort('label')}>
                  Description{sortIndicator('label')}
                </th>
                <th className="px-5 py-3 cursor-pointer" onClick={() => toggleSort('voucher_no')}>
                  Voucher{sortIndicator('voucher_no')}
                </th>
                <th className="px-5 py-3 text-right cursor-pointer" onClick={() => toggleSort('amount')}>
                  Amount{sortIndicator('amount')}
                </th>
                <th className="px-5 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                    No account charges yet. Add CGT, registration, or other broker debits/credits.
                  </td>
                </tr>
              ) : (
                sorted.map(c => (
                  <tr key={c.id} className="border-b border-gray-800/80 hover:bg-gray-800/40">
                    <td className="px-5 py-3 text-gray-300 whitespace-nowrap">{fmtDate(c.charged_at)}</td>
                    <td className="px-5 py-3 text-gray-400">{accountChargeCategoryLabel(c.category)}</td>
                    <td className="px-5 py-3 text-gray-200">
                      {c.label}
                      {c.notes ? (
                        <span className="block text-xs text-gray-500 mt-0.5">{c.notes}</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">{c.voucher_no ?? '—'}</td>
                    <td
                      className={`px-5 py-3 text-right font-medium tabular-nums ${
                        c.amount < 0 ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {c.amount < 0 ? '' : '+'}₨ {fmt(c.amount)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id, c.label)}
                        className="text-xs text-gray-500 hover:text-red-400"
                        disabled={saving}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
