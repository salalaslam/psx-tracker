import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
  Outlet,
} from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { serverGetAllAccounts, serverCreateAccount } from '../serverFns'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'PSX Investment Tracker' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootLayout,
})

function RootLayout() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        <Header />
        <main className="mx-auto max-w-7xl px-6 py-8">
          <Outlet />
        </main>
        <Scripts />
      </body>
    </html>
  )
}

function Header() {
  const [accounts, setAccounts] = useState<string[]>([])
  const [showNewAccountForm, setShowNewAccountForm] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAccounts() {
      try {
        const accts = await serverGetAllAccounts()
        setAccounts(accts)
      } finally {
        setLoading(false)
      }
    }
    loadAccounts()
  }, [])

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!newAccountName.trim()) return

    setCreating(true)
    try {
      const success = await serverCreateAccount({ data: newAccountName })
      if (success) {
        setNewAccountName('')
        setShowNewAccountForm(false)
        // Reload accounts list
        const accts = await serverGetAllAccounts()
        setAccounts(accts)
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <header className="border-b border-gray-800 bg-gray-900">
      <nav className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold text-white">
          <span className="text-emerald-400">PSX</span> Tracker
        </Link>
        <div className="flex gap-4 text-sm">
          <Link
            to="/"
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-gray-800 [&.active]:bg-gray-800 [&.active]:text-emerald-400"
          >
            Dashboard
          </Link>
          {!loading &&
            accounts.map(account => (
              <Link
                key={account}
                to="/account/$name"
                params={{ name: account }}
                className="rounded-md px-3 py-1.5 transition-colors hover:bg-gray-800 [&.active]:bg-gray-800 [&.active]:text-emerald-400"
              >
                {account.charAt(0).toUpperCase() + account.slice(1)}
              </Link>
            ))}
          <button
            onClick={() => setShowNewAccountForm(!showNewAccountForm)}
            className="rounded-md px-3 py-1.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            + New Account
          </button>
        </div>
      </nav>

      {showNewAccountForm && (
        <div className="border-t border-gray-800 bg-gray-800/50 px-6 py-4">
          <form onSubmit={handleCreateAccount} className="flex gap-2">
            <input
              type="text"
              value={newAccountName}
              onChange={e => setNewAccountName(e.target.value)}
              placeholder="Account name (e.g. alice)"
              className="rounded-md bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={creating}
            />
            <button
              type="submit"
              disabled={creating || !newAccountName.trim()}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewAccountForm(false)
                setNewAccountName('')
              }}
              className="rounded-md bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </form>
        </div>
      )}
    </header>
  )
}
