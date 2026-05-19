import type { Transaction } from '../db.server'

export type TransactionRow = Transaction & {
  trade_value: number | null
  total_amount: number
}

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtRate(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

export function AccountTransactions({ transactions }: { transactions: TransactionRow[] }) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-12 text-center text-sm text-gray-500">
        No transactions recorded yet.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="border-b border-gray-800 px-5 py-3 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Transactions</h2>
        <span className="text-xs text-gray-500">{transactions.length} trades</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left whitespace-nowrap">Date</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Symbol</th>
              <th className="px-4 py-3 text-center whitespace-nowrap">Side</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Shares</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Rate slip</th>
              <th className="px-4 py-3 text-right whitespace-nowrap min-w-[7rem]">Trade value</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Commission</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">SST</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">CDC</th>
              <th className="px-4 py-3 text-right whitespace-nowrap min-w-[7rem]">Total</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Eff. cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {transactions.map(t => {
              const tradedDate = new Date(t.traded_at).toLocaleDateString('en-PK', {
                dateStyle: 'medium',
              })
              return (
                <tr key={t.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{tradedDate}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-400 whitespace-nowrap">{t.symbol}</td>
                  <td className="px-4 py-3 text-center text-xs uppercase text-gray-400">{t.side}</td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums">
                    {t.shares.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums">
                    {t.rate_slip != null ? fmtRate(t.rate_slip) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums">
                    {t.trade_value != null ? fmt(t.trade_value) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 tabular-nums">
                    {t.commission != null ? fmt(t.commission) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 tabular-nums">
                    {t.sales_tax != null ? fmt(t.sales_tax) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 tabular-nums">
                    {t.cdc_charges != null ? fmt(t.cdc_charges) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-200 tabular-nums">
                    {fmt(t.total_amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 tabular-nums">
                    {fmtRate(t.cost_per_share)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
