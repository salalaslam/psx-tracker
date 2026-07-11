import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
  Outlet,
} from '@tanstack/react-router'

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
      <body className="min-h-screen overflow-x-hidden bg-gray-950 text-gray-100 antialiased">
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
  return (
    <header className="border-b border-gray-800 bg-gray-900">
      <nav className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4">
        <Link to="/" className="flex shrink-0 items-center gap-2 text-lg font-bold text-white">
          <span className="text-emerald-400">PSX</span> Tracker
        </Link>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto whitespace-nowrap text-sm sm:gap-2">
          <Link
            to="/"
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-gray-800 [&.active]:bg-gray-800 [&.active]:text-emerald-400"
          >
            Dashboard
          </Link>
          <Link
            to="/combined-history"
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-gray-800 [&.active]:bg-gray-800 [&.active]:text-emerald-400"
          >
            Combined History
          </Link>
          <Link
            to="/accounts"
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-gray-800 [&.active]:bg-gray-800 [&.active]:text-emerald-400"
          >
            Accounts
          </Link>
          <Link
            to="/gains"
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-gray-800 [&.active]:bg-gray-800 [&.active]:text-emerald-400"
          >
            Gains
          </Link>
          <Link
            to="/tax-report"
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-gray-800 [&.active]:bg-gray-800 [&.active]:text-emerald-400"
          >
            Tax Report
          </Link>
          <Link
            to="/research"
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-gray-800 [&.active]:bg-gray-800 [&.active]:text-emerald-400"
          >
            Value Research
          </Link>
        </div>
      </nav>
    </header>
  )
}
