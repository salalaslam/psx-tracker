import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { serverCreateAccount, serverGetAllAccounts } from '../serverFns'

export const Route = createFileRoute('/accounts')({
  loader: async () => {
    const accounts = await serverGetAllAccounts()
    return { accounts }
  },
  component: AccountsPage,
})

function accountLabel(account: string): string {
  return account.charAt(0).toUpperCase() + account.slice(1)
}

function AccountsPage() {
  const { accounts } = Route.useLoaderData()
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
