import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { AccountSummaryCard } from '../components/AccountSummaryCard'
import { AllocationDonut, slicesFromAccounts } from '../components/AllocationDonut'
import { CombinedPortfolioSummary } from '../components/CombinedPortfolioSummary'
import {
  serverCreateAccount,
  serverGetAllAccounts,
  serverGetAllDividendTotals,
  serverGetHoldings,
} from '../serverFns'

export const Route = createFileRoute('/accounts')({
  loader: async () => {
    const accounts = await serverGetAllAccounts()
    const holdings: Record<string, Awaited<ReturnType<typeof serverGetHoldings>>> = {}

    await Promise.all(
      accounts.map(async account => {
        holdings[account] = await serverGetHoldings({ data: account })
      }),
    )

    const dividendTotals = await serverGetAllDividendTotals()

    return { accounts, holdings, dividendTotals }
  },
  component: AccountsPage,
})

function accountLabel(account: string): string {
  return account.charAt(0).toUpperCase() + account.slice(1)
}

function AccountsPage() {
  const { accounts, holdings, dividendTotals } = Route.useLoaderData()
  const router = useRouter()
  const [newAccountName, setNewAccountName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    const name = newAccountName.trim()
    if (!name) return

    setCreating(true)
    setError(null)
    try {
      const success = await serverCreateAccount({ data: name })
      if (!success) {
        setError('Could not create account. It may already exist.')
        return
      }
      setNewAccountName('')
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Accounts</h1>
        <p className="mt-1 text-sm text-gray-400">
          Manage portfolio accounts — each account tracks its own holdings and transactions.
        </p>
      </div>

      {accounts.length > 0 && (
        <>
          <CombinedPortfolioSummary
            accounts={accounts}
            holdings={holdings}
            dividendTotals={dividendTotals}
          />

          {accounts.length > 1 && (
            <AllocationDonut
              title="Allocation by Account"
              subtitle="Share of combined portfolio per account"
              slices={slicesFromAccounts(accounts, holdings)}
            />
          )}

          <div
            className={`grid gap-6 ${accounts.length === 1 ? '' : accounts.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3 lg:grid-cols-4'}`}
          >
            {accounts.map(account => {
              const div = dividendTotals.by_account[account] ?? {
                total_net: 0,
                count: 0,
                total_shares: null,
              }
              return (
                <AccountSummaryCard
                  key={account}
                  label={`${accountLabel(account)}'s Portfolio`}
                  account={account}
                  holdings={holdings[account] || []}
                  dividendNet={div.total_net}
                  dividendCount={div.count}
                  dividendShares={div.total_shares}
                />
              )
            })}
          </div>
        </>
      )}

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Add account</h2>
        <form onSubmit={handleCreateAccount} className="mt-4 flex flex-wrap gap-3">
          <input
            type="text"
            value={newAccountName}
            onChange={e => {
              setNewAccountName(e.target.value)
              setError(null)
            }}
            placeholder="Account name (e.g. alice)"
            className="min-w-[200px] flex-1 rounded-md bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            disabled={creating}
          />
          <button
            type="submit"
            disabled={creating || !newAccountName.trim()}
            className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create account'}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          Your accounts
        </h2>
        {accounts.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No accounts yet. Create one above to get started.</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-800">
            {accounts.map(account => (
              <li key={account}>
                <Link
                  to="/account/$name"
                  params={{ name: account }}
                  className="flex items-center justify-between py-4 transition-colors hover:text-emerald-400"
                >
                  <span className="font-medium text-white">{accountLabel(account)}</span>
                  <span className="text-sm text-gray-500">View portfolio →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
