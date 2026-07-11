import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import {
  serverAddTrade,
  serverEnsureSectors,
  serverGetAllAccounts,
  serverGetAccountCharges,
  serverGetCorporateEvents,
  serverGetDividends,
  serverGetHoldings,
  serverGetTransactions,
} from '../serverFns'
import { ArrowUp, ArrowDown } from 'lucide-react'
import type { HoldingWithPrice } from '../db.server'
import { transactionTotal, transactionTradeValue } from '../fees'
import { AllocationDonut } from '../components/AllocationDonut'
import { AccountTransactions, type TransactionRow } from '../components/AccountTransactions'
import { AccountCharges } from '../components/AccountCharges'
import { AccountCorporateEvents } from '../components/AccountCorporateEvents'
import { AccountDividends } from '../components/AccountDividends'
import { GoodBuyPriceCell } from '../components/GoodBuyPriceCell'
import { buyPriceStatusRank, calcGoodBuyPrice } from '../goodBuyPrice'

const ACCOUNT_TABS = ['portfolio', 'transactions', 'dividends', 'charges', 'events'] as const
type AccountTab = (typeof ACCOUNT_TABS)[number]

function parseAccountTab(value: unknown): AccountTab {
  const tab = String(value ?? 'portfolio')
  return ACCOUNT_TABS.includes(tab as AccountTab) ? (tab as AccountTab) : 'portfolio'
}

export const Route = createFileRoute('/account/$name')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: parseAccountTab(search.tab),
  }),
  loader: async ({ params }) => {
    await serverEnsureSectors()

    const accounts = await serverGetAllAccounts()
    if (!accounts.includes(params.name)) throw notFound()
    const [holdings, transactions, dividendData, chargeData, corporateEvents] = await Promise.all([
      serverGetHoldings({ data: params.name }),
      serverGetTransactions({ data: params.name }),
      serverGetDividends({ data: params.name }),
      serverGetAccountCharges({ data: params.name }),
      serverGetCorporateEvents({ data: params.name }),
    ])
    const transactionRows: TransactionRow[] = transactions.map(t => ({
      ...t,
      trade_value: transactionTradeValue(t.shares, t.rate_slip),
      total_amount: transactionTotal(
        t.shares,
        t.cost_per_share,
        t.rate_slip,
        t.commission,
        t.sales_tax,
        t.cdc_charges,
      ),
    }))
    return {
      holdings,
      transactions: transactionRows,
      dividends: dividendData.dividends,
      dividendSummary: dividendData.summary,
      accountCharges: chargeData.charges,
      accountChargeSummary: chargeData.summary,
      corporateEvents,
      account: params.name,
    }
  },
  component: AccountPage,
})

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function AccountPage() {
  const {
    holdings,
    transactions,
    dividends,
    dividendSummary,
    accountCharges,
    accountChargeSummary,
    corporateEvents,
    account,
  } = Route.useLoaderData()
  const { tab: activeTab } = Route.useSearch()
  const router = useRouter()
  const name = account.charAt(0).toUpperCase() + account.slice(1)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [symbol, setSymbol] = useState('')
  const [shares, setShares] = useState('')
  const [costPerShare, setCostPerShare] = useState('')
  const [rateSlip, setRateSlip] = useState('')
  const [cdcCharges, setCdcCharges] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Sorting logic
  const getSortValue = (h: HoldingWithPrice, col: string): number | string => {
    switch (col) {
      case 'symbol':
        return h.symbol
      case 'sector':
        return h.sector ?? ''
      case 'shares':
        return h.shares
      case 'cost':
        return h.cost_avg
      case 'invested':
        return h.total_invested
      case 'allocation':
        const investedTotal = holdings.reduce((sum, item) => sum + item.total_invested, 0)
        return investedTotal > 0 ? (h.total_invested / investedTotal) * 100 : 0
      case 'price':
        return h.latest_price ?? 0
      case 'value':
        return h.latest_price !== null ? h.shares * h.latest_price : 0
      case 'pl':
        const currVal = h.latest_price !== null ? h.shares * h.latest_price : null
        return currVal !== null ? currVal - h.total_invested : 0
      case 'return':
        const cv = h.latest_price !== null ? h.shares * h.latest_price : null
        const pl = cv !== null ? cv - h.total_invested : null
        return pl !== null && h.total_invested > 0 ? (pl / h.total_invested) * 100 : 0
      case 'buyRange':
        return buyPriceStatusRank(calcGoodBuyPrice(h.cost_avg, h.latest_price)?.status ?? null)
      default:
        return 0
    }
  }

  const sortedHoldings = [...holdings].sort((a, b) => {
    if (!sortColumn) return 0
    const aVal = getSortValue(a, sortColumn)
    const bVal = getSortValue(b, sortColumn)

    let comparison = 0
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      comparison = aVal.localeCompare(bVal)
    } else {
      comparison = (aVal as number) - (bVal as number)
    }

    return sortDirection === 'asc' ? comparison : -comparison
  })

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  let totalInvested = 0
  let currentValue = 0
  let pricedCount = 0

  for (const h of holdings) {
    totalInvested += h.total_invested
    if (h.latest_price !== null) {
      currentValue += h.shares * h.latest_price
      pricedCount++
    }
  }

  const gainLoss = currentValue - totalInvested
  const pct = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0
  const green = gainLoss >= 0

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(null)

    const cleanedSymbol = symbol.trim().toUpperCase()
    const parsedShares = Number(shares)
    const parsedCostPerShare = costPerShare.trim() === '' ? undefined : Number(costPerShare)
    const parsedRateSlip = rateSlip.trim() === '' ? undefined : Number(rateSlip)
    const parsedCdc = cdcCharges.trim() === '' ? undefined : Number(cdcCharges)

    if (!cleanedSymbol) {
      setFormError('Symbol is required')
      return
    }
    if (!Number.isInteger(parsedShares) || parsedShares <= 0) {
      setFormError('Shares must be a positive integer')
      return
    }
    const hasRate = parsedRateSlip != null && Number.isFinite(parsedRateSlip) && parsedRateSlip > 0
    const hasCost =
      parsedCostPerShare != null && Number.isFinite(parsedCostPerShare) && parsedCostPerShare > 0
    if (!hasRate && !hasCost) {
      setFormError('Enter rate slip (fees auto-calculated) or cost per share')
      return
    }

    setSaving(true)
    try {
      const result = await serverAddTrade({
        data: {
          account,
          symbol: cleanedSymbol,
          side,
          shares: parsedShares,
          ...(hasCost ? { cost_per_share: parsedCostPerShare } : {}),
          ...(hasRate ? { rate_slip: parsedRateSlip } : {}),
          ...(parsedCdc != null && Number.isFinite(parsedCdc) ? { cdc_charges: parsedCdc } : {}),
        },
      })

      if (!result.ok) {
        setFormError(result.error ?? 'Could not save trade')
        return
      }

      setFormSuccess(`${side === 'buy' ? 'Buy' : 'Sell'} trade recorded for ${cleanedSymbol}.`)
      setSymbol('')
      setShares('')
      setCostPerShare('')
      setRateSlip('')
      setCdcCharges('')
      await router.invalidate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save trade')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{name}'s Portfolio</h1>
        <p className="mt-1 text-sm text-gray-400">
          {holdings.length} positions · {transactions.length} transactions · {dividends.length}{' '}
          dividends · {accountCharges.length} charges
          {corporateEvents.length > 0 ? ` · ${corporateEvents.length} events` : ''}
        </p>
      </div>

      <div className="flex w-fit gap-1 rounded-lg border border-gray-800 bg-gray-900/80 p-1">
        <TabLink account={account} tab="portfolio" active={activeTab === 'portfolio'}>
          Portfolio
        </TabLink>
        <TabLink account={account} tab="transactions" active={activeTab === 'transactions'}>
          Transactions
          <span className="ml-1.5 rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] font-normal text-gray-400">
            {transactions.length}
          </span>
        </TabLink>
        <TabLink account={account} tab="dividends" active={activeTab === 'dividends'}>
          Dividends
          <span className="ml-1.5 rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] font-normal text-gray-400">
            {dividends.length}
          </span>
        </TabLink>
        <TabLink account={account} tab="charges" active={activeTab === 'charges'}>
          Charges
          <span className="ml-1.5 rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] font-normal text-gray-400">
            {accountCharges.length}
          </span>
        </TabLink>
        <TabLink account={account} tab="events" active={activeTab === 'events'}>
          Events
          {corporateEvents.length > 0 && (
            <span className="ml-1.5 rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] font-normal text-gray-400">
              {corporateEvents.length}
            </span>
          )}
        </TabLink>
      </div>

      {activeTab === 'transactions' ? (
        <AccountTransactions transactions={transactions} />
      ) : activeTab === 'dividends' ? (
        <AccountDividends
          account={account}
          dividends={dividends}
          summary={dividendSummary}
          holdings={holdings}
        />
      ) : activeTab === 'charges' ? (
        <AccountCharges
          account={account}
          charges={accountCharges}
          summary={accountChargeSummary}
        />
      ) : activeTab === 'events' ? (
        <AccountCorporateEvents
          account={account}
          events={corporateEvents}
          holdings={holdings}
        />
      ) : (
        <>
      {/* Portfolio overview: stats + allocation in one panel */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-y divide-gray-800 border-b border-gray-800 sm:grid-cols-4 sm:divide-y-0">
          <StatCell label="Total Invested" value={`₨ ${fmt(totalInvested)}`} />
          <StatCell
          label="Current Value"
          value={pricedCount > 0 ? `₨ ${fmt(currentValue)}` : '—'}
          sub={pricedCount < holdings.length ? `${pricedCount}/${holdings.length} priced` : undefined}
        />
          <StatCell
          label="Gain / Loss"
          value={pricedCount > 0 ? `₨ ${fmt(gainLoss)}` : '—'}
          color={pricedCount > 0 ? (green ? 'text-emerald-400' : 'text-red-400') : undefined}
        />
          <StatCell
          label="Return"
          value={pricedCount > 0 ? `${green ? '+' : ''}${pct.toFixed(2)}%` : '—'}
          color={pricedCount > 0 ? (green ? 'text-emerald-400' : 'text-red-400') : undefined}
        />
        </div>
        {accountChargeSummary.count > 0 && (
          <p className="border-b border-gray-800 px-5 py-2 text-xs text-gray-500">
            Account charges (net):{' '}
            <span
              className={
                accountChargeSummary.net < 0
                  ? 'text-red-400'
                  : accountChargeSummary.net > 0
                    ? 'text-emerald-400'
                    : 'text-gray-300'
              }
            >
              {accountChargeSummary.net >= 0 ? '+' : ''}₨ {fmt(accountChargeSummary.net)}
            </span>
            {' · '}
            <a
              href={`/account/${account}?tab=charges`}
              className="text-emerald-500/90 hover:text-emerald-400"
            >
              View charges
            </a>
          </p>
        )}
        <AllocationDonut
          variant="compact"
          holdings={holdings}
          subtitle="Share of portfolio by current value (or invested if unpriced)"
        />
      </div>

      {/* Add trade */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end">
          <div className="xl:mr-1 xl:min-w-[11rem]">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Add Buy/Sell Trade</h2>
            <p className="mt-1 text-xs text-gray-500">Rate slip auto-calculates fees, or enter cost per share.</p>
          </div>
          <label className="min-w-[6.5rem] flex-1 xl:flex-none xl:w-28">
            <span className="mb-1 block text-xs text-gray-500">Type</span>
            <select
              value={side}
              onChange={e => setSide(e.target.value === 'sell' ? 'sell' : 'buy')}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={saving}
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>

          <label className="min-w-[6.5rem] flex-1 xl:flex-none xl:w-32">
            <span className="mb-1 block text-xs text-gray-500">Symbol</span>
            <input
              type="text"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="MARI"
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm uppercase text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={saving}
            />
          </label>

          <label className="min-w-[6.5rem] flex-1 xl:flex-none xl:w-28">
            <span className="mb-1 block text-xs text-gray-500">Shares</span>
            <input
              type="number"
              min={1}
              step={1}
              value={shares}
              onChange={e => setShares(e.target.value)}
              placeholder="100"
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={saving}
            />
          </label>

          <label className="min-w-[6.5rem] flex-1 xl:flex-none xl:w-32">
            <span className="mb-1 block text-xs text-gray-500">Rate slip (Rs)</span>
            <input
              type="number"
              min={0}
              step="0.0001"
              value={rateSlip}
              onChange={e => setRateSlip(e.target.value)}
              placeholder="35.97"
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={saving}
            />
          </label>

          <label className="min-w-[6.5rem] flex-1 xl:flex-none xl:w-32">
            <span className="mb-1 block text-xs text-gray-500">CDC charges (Rs)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cdcCharges}
              onChange={e => setCdcCharges(e.target.value)}
              placeholder="optional"
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={saving}
            />
          </label>

          <label className="min-w-[6.5rem] flex-1 xl:flex-none xl:w-32">
            <span className="mb-1 block text-xs text-gray-500">Cost / share (Rs)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={costPerShare}
              onChange={e => setCostPerShare(e.target.value)}
              placeholder="if no rate slip"
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={saving}
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full shrink-0 rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
          >
            {saving ? 'Saving…' : 'Save Trade'}
          </button>
        </form>

        {formError && <p className="mt-3 text-sm text-red-400">{formError}</p>}
        {formSuccess && <p className="mt-3 text-sm text-emerald-400">{formSuccess}</p>}
      </div>

      {/* Holdings table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left whitespace-nowrap">#</th>
                <th
                  onClick={() => handleSort('symbol')}
                  className="px-5 py-3 text-left cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Symbol
                    {sortColumn === 'symbol' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('sector')}
                  className="px-5 py-3 text-left cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Sector
                    {sortColumn === 'sector' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('shares')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    Shares
                    {sortColumn === 'shares' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('invested')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      Invested (₨)
                    </span>
                    {sortColumn === 'invested' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('cost')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    Avg Cost (₨)
                    {sortColumn === 'cost' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('allocation')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    Weight %
                    {sortColumn === 'allocation' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('value')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    Value (₨)
                    {sortColumn === 'value' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('price')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    Curr. Price (₨)
                    {sortColumn === 'price' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('buyRange')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    Good Buy Range
                    {sortColumn === 'buyRange' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('pl')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    P&amp;L (₨)
                    {sortColumn === 'pl' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('return')}
                  className="px-5 py-3 text-right cursor-pointer whitespace-nowrap hover:text-gray-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    Return %
                    {sortColumn === 'return' && (
                      sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    )}
                  </div>
                </th>
                <th className="px-5 py-3 text-left whitespace-nowrap">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {sortedHoldings.map((h, idx) => {
                const currVal = h.latest_price !== null ? h.shares * h.latest_price : null
                const pl = currVal !== null ? currVal - h.total_invested : null
                const plPct = pl !== null && h.total_invested > 0 ? (pl / h.total_invested) * 100 : null
                const allocationPct = totalInvested > 0 ? (h.total_invested / totalInvested) * 100 : null
                const g = pl !== null ? pl >= 0 : null
                const updatedAt = h.latest_fetched_at
                  ? new Date(h.latest_fetched_at).toLocaleString('en-PK', { dateStyle: 'short', timeStyle: 'short' })
                  : null
                return (
                  <tr key={h.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-3 text-xs text-gray-500">{idx + 1}</td>
                    <td className="px-5 py-3 font-semibold">
                      <Link
                        to="/history/$symbol"
                        params={{ symbol: h.symbol }}
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        {h.symbol}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs max-w-[12rem] truncate" title={h.sector ?? undefined}>
                      {h.sector ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-300">{h.shares.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-gray-300">{fmt(h.total_invested)}</td>
                    <td className="px-5 py-3 text-right text-gray-400">{fmt(h.cost_avg)}</td>
                    <td className="px-5 py-3 text-right text-gray-500">
                      {allocationPct !== null ? `${allocationPct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-300">
                      {currVal !== null ? fmt(currVal) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-400">
                      {h.latest_price !== null ? fmt(h.latest_price) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-xs">
                      <GoodBuyPriceCell avgCost={h.cost_avg} currentPrice={h.latest_price} />
                    </td>
                    <td className={`px-5 py-3 text-right font-medium ${g === true ? 'text-emerald-400' : g === false ? 'text-red-400' : 'text-gray-600'}`}>
                      {pl !== null ? `${g ? '+' : ''}${fmt(pl)}` : '—'}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium ${g === true ? 'text-emerald-400' : g === false ? 'text-red-400' : 'text-gray-600'}`}>
                      {plPct !== null ? `${g ? '+' : ''}${plPct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {updatedAt ?? <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  )
}

function TabLink({
  account,
  tab,
  active,
  children,
}: {
  account: string
  tab: AccountTab
  active: boolean
  children: ReactNode
}) {
  const href = tab === 'portfolio' ? `/account/${account}` : `/account/${account}?tab=${tab}`
  return (
    <a
      href={href}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-gray-800 text-white shadow-sm'
          : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      {children}
    </a>
  )
}

function StatCell({
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
    <div className="px-5 py-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-lg font-bold sm:text-xl ${color ?? 'text-white'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}
