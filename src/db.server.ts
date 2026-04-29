import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../../data/investments.db')

mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT    NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS holdings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    account       TEXT    NOT NULL,
    symbol        TEXT    NOT NULL,
    shares        INTEGER NOT NULL,
    cost_avg      REAL    NOT NULL,
    total_invested REAL   NOT NULL,
    UNIQUE(account, symbol),
    FOREIGN KEY(account) REFERENCES accounts(name)
  );

  CREATE TABLE IF NOT EXISTS price_snapshots (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol     TEXT    NOT NULL,
    price      REAL    NOT NULL,
    fetched_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_symbol_time
    ON price_snapshots(symbol, fetched_at DESC);

  CREATE TABLE IF NOT EXISTS transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    account         TEXT    NOT NULL,
    symbol          TEXT    NOT NULL,
    side            TEXT    NOT NULL CHECK (side IN ('buy', 'sell')),
    shares          INTEGER NOT NULL,
    cost_per_share  REAL    NOT NULL,
    traded_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY(account) REFERENCES accounts(name)
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_account_time
    ON transactions(account, traded_at DESC);
`)

// ── Seed data (public-safe demo values) ─────────────────────────────────────

const SEED: Array<{ symbol: string; demoA: number; demoB: number; costAvg: number }> = [
  { symbol: 'OGDC', demoA: 120, demoB: 40, costAvg: 100.0 },
  { symbol: 'FFC', demoA: 80, demoB: 75, costAvg: 42.5 },
  { symbol: 'MARI', demoA: 25, demoB: 0, costAvg: 250.0 },
  { symbol: 'EFERT', demoA: 0, demoB: 160, costAvg: 12.75 },
]

const insert = db.prepare(
  `INSERT OR IGNORE INTO holdings (account, symbol, shares, cost_avg, total_invested)
   VALUES (?, ?, ?, ?, ?)`
)
const insertAccount = db.prepare(
  `INSERT OR IGNORE INTO accounts (name) VALUES (?)`
)
const insertAll = db.transaction(() => {
  // Insert accounts first
  insertAccount.run('demo-a')
  insertAccount.run('demo-b')

  // Insert holdings
  for (const row of SEED) {
    if (row.demoA > 0) {
      insert.run('demo-a', row.symbol, row.demoA, row.costAvg, row.costAvg * row.demoA)
    }
    if (row.demoB > 0) {
      insert.run('demo-b', row.symbol, row.demoB, row.costAvg, row.costAvg * row.demoB)
    }
  }
})

const hasAccounts = (db.prepare('SELECT COUNT(1) AS c FROM accounts').get() as { c: number }).c > 0
const hasHoldings = (db.prepare('SELECT COUNT(1) AS c FROM holdings').get() as { c: number }).c > 0

// Seed demo data only for a brand-new empty database.
if (!hasAccounts && !hasHoldings) {
  insertAll()
}

// ── Typed query helpers ──────────────────────────────────────────────────────

export interface Holding {
  id: number
  account: string
  symbol: string
  shares: number
  cost_avg: number
  total_invested: number
}

export interface PriceSnapshot {
  id: number
  symbol: string
  price: number
  fetched_at: string
}

export interface HoldingWithPrice extends Holding {
  latest_price: number | null
  latest_fetched_at: string | null
}

export function getHoldings(account: string): HoldingWithPrice[] {
  return db.prepare(`
    SELECT h.*,
      s.price          AS latest_price,
      s.fetched_at     AS latest_fetched_at
    FROM holdings h
    LEFT JOIN price_snapshots s
      ON s.symbol = h.symbol
      AND s.fetched_at = (
        SELECT MAX(fetched_at) FROM price_snapshots WHERE symbol = h.symbol
      )
    WHERE h.account = ?
    ORDER BY h.total_invested DESC
  `).all(account) as HoldingWithPrice[]
}

export function getAllAccounts(): string[] {
  return (db.prepare('SELECT name FROM accounts ORDER BY name').all() as { name: string }[])
    .map(r => r.name)
}

export function createAccount(name: string): boolean {
  try {
    db.prepare('INSERT INTO accounts (name) VALUES (?)').run(name)
    return true
  } catch {
    return false
  }
}

export function getAllSymbols(): string[] {
  return (db.prepare('SELECT DISTINCT symbol FROM holdings ORDER BY symbol').all() as { symbol: string }[])
    .map(r => r.symbol)
}

export function storeSnapshot(symbol: string, price: number): void {
  db.prepare(
    `INSERT INTO price_snapshots (symbol, price) VALUES (?, ?)`
  ).run(symbol, price)
}

export function getPriceHistory(symbol: string): PriceSnapshot[] {
  return db.prepare(`
    SELECT * FROM price_snapshots
    WHERE symbol = ?
    ORDER BY fetched_at DESC
    LIMIT 200
  `).all(symbol) as PriceSnapshot[]
}

export function getLatestPrices(): Record<string, { price: number; fetched_at: string }> {
  const rows = db.prepare(`
    SELECT s.symbol, s.price, s.fetched_at
    FROM price_snapshots s
    INNER JOIN (
      SELECT symbol, MAX(fetched_at) AS max_at
      FROM price_snapshots
      GROUP BY symbol
    ) latest ON s.symbol = latest.symbol AND s.fetched_at = latest.max_at
  `).all() as { symbol: string; price: number; fetched_at: string }[]

  return Object.fromEntries(rows.map(r => [r.symbol, { price: r.price, fetched_at: r.fetched_at }]))
}

export interface PortfolioValuePoint {
  sess: string
  portfolio_value: number
}

export type TradeSide = 'buy' | 'sell'

export interface AddTradeInput {
  account: string
  symbol: string
  side: TradeSide
  shares: number
  cost_per_share: number
}

export interface AddTradeResult {
  ok: boolean
  error?: string
}

export function addTrade(input: AddTradeInput): AddTradeResult {
  const account = input.account.trim().toLowerCase()
  const symbol = input.symbol.trim().toUpperCase()
  const side = input.side
  const shares = Math.trunc(input.shares)
  const costPerShare = Number(input.cost_per_share)

  if (!account) return { ok: false, error: 'Account is required' }
  if (!symbol) return { ok: false, error: 'Symbol is required' }
  if (side !== 'buy' && side !== 'sell') return { ok: false, error: 'Invalid side' }
  if (!Number.isInteger(shares) || shares <= 0) return { ok: false, error: 'Shares must be a positive integer' }
  if (!Number.isFinite(costPerShare) || costPerShare <= 0) {
    return { ok: false, error: 'Cost per share must be a positive number' }
  }

  const accountExists = db.prepare('SELECT 1 FROM accounts WHERE name = ?').get(account)
  if (!accountExists) return { ok: false, error: 'Account does not exist' }

  const tx = db.transaction((): AddTradeResult => {
    const existing = db.prepare(
      `SELECT id, shares, cost_avg, total_invested
       FROM holdings
       WHERE account = ? AND symbol = ?`
    ).get(account, symbol) as Pick<Holding, 'id' | 'shares' | 'cost_avg' | 'total_invested'> | undefined

    if (side === 'sell') {
      if (!existing) {
        return { ok: false, error: `Cannot sell ${symbol}: no shares in this account` }
      }
      if (shares > existing.shares) {
        return {
          ok: false,
          error: `Cannot sell ${shares.toLocaleString()} ${symbol} shares: only ${existing.shares.toLocaleString()} available`,
        }
      }
    }

    db.prepare(
      `INSERT INTO transactions (account, symbol, side, shares, cost_per_share)
       VALUES (?, ?, ?, ?, ?)`
    ).run(account, symbol, side, shares, costPerShare)

    if (side === 'buy') {
      if (!existing) {
        const invested = shares * costPerShare
        db.prepare(
          `INSERT INTO holdings (account, symbol, shares, cost_avg, total_invested)
           VALUES (?, ?, ?, ?, ?)`
        ).run(account, symbol, shares, costPerShare, invested)
        return { ok: true }
      }

      const nextShares = existing.shares + shares
      const nextInvested = existing.total_invested + (shares * costPerShare)
      const nextCostAvg = nextInvested / nextShares

      db.prepare(
        `UPDATE holdings
         SET shares = ?, cost_avg = ?, total_invested = ?
         WHERE id = ?`
      ).run(nextShares, nextCostAvg, nextInvested, existing.id)
      return { ok: true }
    }

    const nextShares = existing.shares - shares
    if (nextShares === 0) {
      db.prepare('DELETE FROM holdings WHERE id = ?').run(existing.id)
      return { ok: true }
    }

    const nextInvested = existing.cost_avg * nextShares
    db.prepare(
      `UPDATE holdings
       SET shares = ?, total_invested = ?
       WHERE id = ?`
    ).run(nextShares, nextInvested, existing.id)

    return { ok: true }
  })

  return tx()
}

export function getPortfolioValueHistory(): PortfolioValuePoint[] {
  const sessions = (db.prepare(`
    SELECT DISTINCT strftime('%Y-%m-%dT%H:%M', fetched_at) AS sess
    FROM price_snapshots
    ORDER BY sess
  `).all() as { sess: string }[])

  if (sessions.length === 0) return []

  const symbolShares = db.prepare(`
    SELECT symbol, SUM(shares) AS total_shares FROM holdings GROUP BY symbol
  `).all() as { symbol: string; total_shares: number }[]

  const priceStmt = db.prepare(`
    SELECT price FROM price_snapshots
    WHERE symbol = ? AND strftime('%Y-%m-%dT%H:%M', fetched_at) <= ?
    ORDER BY fetched_at DESC LIMIT 1
  `)

  return sessions.map(({ sess }) => {
    let portfolio_value = 0
    for (const { symbol, total_shares } of symbolShares) {
      const row = priceStmt.get(symbol, sess) as { price: number } | undefined
      if (row) portfolio_value += row.price * total_shares
    }
    return { sess, portfolio_value }
  })
}

export default db

