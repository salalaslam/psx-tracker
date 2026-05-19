import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveTradeFees } from './fees'

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
    rate_slip       REAL,
    commission      REAL,
    sales_tax       REAL,
    cdc_charges     REAL,
    traded_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY(account) REFERENCES accounts(name)
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_account_time
    ON transactions(account, traded_at DESC);

  CREATE TABLE IF NOT EXISTS stocks (
    symbol  TEXT PRIMARY KEY,
    sector  TEXT NOT NULL
  );
`)

function migrateTransactionsFeeColumns(): void {
  const cols = new Set(
    (db.prepare('PRAGMA table_info(transactions)').all() as { name: string }[]).map(c => c.name),
  )
  if (!cols.has('rate_slip')) db.exec('ALTER TABLE transactions ADD COLUMN rate_slip REAL')
  if (!cols.has('commission')) db.exec('ALTER TABLE transactions ADD COLUMN commission REAL')
  if (!cols.has('sales_tax')) db.exec('ALTER TABLE transactions ADD COLUMN sales_tax REAL')
  if (!cols.has('cdc_charges')) db.exec('ALTER TABLE transactions ADD COLUMN cdc_charges REAL')
}

migrateTransactionsFeeColumns()

// ── Seed data (public-safe demo values) ─────────────────────────────────────

const SEED: Array<{ symbol: string; sector: string; demoA: number; demoB: number; costAvg: number }> = [
  { symbol: 'OGDC', sector: 'OIL & GAS EXPLORATION COMPANIES', demoA: 120, demoB: 40, costAvg: 100.0 },
  { symbol: 'FFC', sector: 'FERTILIZER', demoA: 80, demoB: 75, costAvg: 42.5 },
  { symbol: 'MARI', sector: 'OIL & GAS EXPLORATION COMPANIES', demoA: 25, demoB: 0, costAvg: 250.0 },
  { symbol: 'EFERT', sector: 'FERTILIZER', demoA: 0, demoB: 160, costAvg: 12.75 },
]

const insert = db.prepare(
  `INSERT OR IGNORE INTO holdings (account, symbol, shares, cost_avg, total_invested)
   VALUES (?, ?, ?, ?, ?)`
)
const insertAccount = db.prepare(
  `INSERT OR IGNORE INTO accounts (name) VALUES (?)`
)
const insertStock = db.prepare(
  `INSERT OR IGNORE INTO stocks (symbol, sector) VALUES (?, ?)`
)
const insertAll = db.transaction(() => {
  // Insert accounts first
  insertAccount.run('demo-a')
  insertAccount.run('demo-b')

  for (const row of SEED) {
    insertStock.run(row.symbol, row.sector)
  }

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

for (const row of SEED) {
  insertStock.run(row.symbol, row.sector)
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
  sector: string | null
}

export function upsertStockSector(symbol: string, sector: string): void {
  db.prepare(
    `INSERT INTO stocks (symbol, sector) VALUES (?, ?)
     ON CONFLICT(symbol) DO UPDATE SET sector = excluded.sector`
  ).run(symbol, sector)
}

export function getSymbolsMissingSector(): string[] {
  return (db.prepare(`
    SELECT DISTINCT h.symbol
    FROM holdings h
    LEFT JOIN stocks s ON s.symbol = h.symbol
    WHERE s.symbol IS NULL
    ORDER BY h.symbol
  `).all() as { symbol: string }[]).map(r => r.symbol)
}

export function hasStockSector(symbol: string): boolean {
  return !!db.prepare('SELECT 1 FROM stocks WHERE symbol = ?').get(symbol)
}

export function getHoldings(account: string): HoldingWithPrice[] {
  return db.prepare(`
    SELECT h.*,
      ps.price          AS latest_price,
      ps.fetched_at     AS latest_fetched_at,
      st.sector         AS sector
    FROM holdings h
    LEFT JOIN price_snapshots ps
      ON ps.symbol = h.symbol
      AND ps.fetched_at = (
        SELECT MAX(fetched_at) FROM price_snapshots WHERE symbol = h.symbol
      )
    LEFT JOIN stocks st ON st.symbol = h.symbol
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

export function storeSnapshotAt(symbol: string, price: number, fetchedAt: string): void {
  db.prepare(
    `INSERT INTO price_snapshots (symbol, price, fetched_at) VALUES (?, ?, ?)`
  ).run(symbol, price, fetchedAt)
}

export function hasSnapshotOnDate(symbol: string, date: string): boolean {
  return !!db.prepare(
    `SELECT 1 FROM price_snapshots WHERE symbol = ? AND date(fetched_at) = date(?)`
  ).get(symbol, date)
}

export function getCombinedSharesAsOf(asOfDate: string): Record<string, number> {
  const txs = db.prepare(`
    SELECT symbol, side, shares
    FROM transactions
    WHERE date(traded_at) <= date(?)
    ORDER BY traded_at ASC, id ASC
  `).all(asOfDate) as { symbol: string; side: TradeSide; shares: number }[]

  const shares: Record<string, number> = {}
  for (const t of txs) {
    if (t.side === 'buy') {
      shares[t.symbol] = (shares[t.symbol] ?? 0) + t.shares
    } else {
      const next = (shares[t.symbol] ?? 0) - t.shares
      if (next <= 0) delete shares[t.symbol]
      else shares[t.symbol] = next
    }
  }
  return shares
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

export interface Transaction {
  id: number
  account: string
  symbol: string
  side: TradeSide
  shares: number
  cost_per_share: number
  rate_slip: number | null
  commission: number | null
  sales_tax: number | null
  cdc_charges: number | null
  traded_at: string
}

export interface AddTradeInput {
  account: string
  symbol: string
  side: TradeSide
  shares: number
  cost_per_share?: number
  rate_slip?: number | null
  commission?: number | null
  sales_tax?: number | null
  cdc_charges?: number | null
  traded_at?: string
}

export interface AddTradeResult {
  ok: boolean
  error?: string
}

export interface PurchaseImportRow {
  traded_at: string
  symbol: string
  side?: TradeSide
  shares: number
  rate_slip: number
  commission: number
  sales_tax: number
  cdc_charges: number
  amount: number
}

function applyBuyToHolding(
  account: string,
  symbol: string,
  shares: number,
  costPerShare: number,
): void {
  const invested = shares * costPerShare
  const existing = db.prepare(
    `SELECT id, shares, cost_avg, total_invested
     FROM holdings WHERE account = ? AND symbol = ?`,
  ).get(account, symbol) as Pick<Holding, 'id' | 'shares' | 'cost_avg' | 'total_invested'> | undefined

  if (!existing) {
    db.prepare(
      `INSERT INTO holdings (account, symbol, shares, cost_avg, total_invested)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(account, symbol, shares, costPerShare, invested)
    return
  }

  const nextShares = existing.shares + shares
  const nextInvested = existing.total_invested + invested
  const nextCostAvg = nextInvested / nextShares
  db.prepare(
    `UPDATE holdings SET shares = ?, cost_avg = ?, total_invested = ? WHERE id = ?`,
  ).run(nextShares, nextCostAvg, nextInvested, existing.id)
}

function applySellToHolding(account: string, symbol: string, shares: number): void {
  const existing = db.prepare(
    `SELECT id, shares, cost_avg, total_invested
     FROM holdings WHERE account = ? AND symbol = ?`,
  ).get(account, symbol) as Pick<Holding, 'id' | 'shares' | 'cost_avg' | 'total_invested'> | undefined

  if (!existing || shares > existing.shares) {
    throw new Error(
      `Cannot sell ${shares} ${symbol}: only ${existing?.shares ?? 0} shares held`,
    )
  }

  const nextShares = existing.shares - shares
  if (nextShares === 0) {
    db.prepare('DELETE FROM holdings WHERE id = ?').run(existing.id)
    return
  }

  const nextInvested = existing.cost_avg * nextShares
  db.prepare(
    `UPDATE holdings SET shares = ?, total_invested = ? WHERE id = ?`,
  ).run(nextShares, nextInvested, existing.id)
}

export function rebuildHoldingsFromTransactions(account: string): void {
  db.prepare('DELETE FROM holdings WHERE account = ?').run(account)
  const txs = db.prepare(`
    SELECT symbol, side, shares, cost_per_share
    FROM transactions
    WHERE account = ?
    ORDER BY traded_at ASC, id ASC
  `).all(account) as { symbol: string; side: TradeSide; shares: number; cost_per_share: number }[]

  for (const row of txs) {
    if (row.side === 'buy') {
      applyBuyToHolding(account, row.symbol, row.shares, row.cost_per_share)
    } else {
      applySellToHolding(account, row.symbol, row.shares)
    }
  }
}

export function importPurchaseHistory(
  account: string,
  rows: PurchaseImportRow[],
  options?: { replace?: boolean },
): { inserted: number } {
  const acct = account.trim().toLowerCase()
  const replace = options?.replace ?? true
  const sorted = [...rows].sort((a, b) => a.traded_at.localeCompare(b.traded_at))

  const insertTx = db.prepare(`
    INSERT INTO transactions (
      account, symbol, side, shares, cost_per_share,
      rate_slip, commission, sales_tax, cdc_charges, traded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const run = db.transaction(() => {
    if (replace) {
      db.prepare('DELETE FROM transactions WHERE account = ?').run(acct)
      db.prepare('DELETE FROM holdings WHERE account = ?').run(acct)
    }

    let inserted = 0
    for (const row of sorted) {
      const symbol = row.symbol.trim().toUpperCase()
      const shares = Math.trunc(row.shares)
      const side: TradeSide = row.side === 'sell' ? 'sell' : 'buy'
      const costPerShare = row.amount / shares
      const tradedAt = row.traded_at.includes('T') ? row.traded_at : `${row.traded_at}T12:00:00Z`
      insertTx.run(
        acct,
        symbol,
        side,
        shares,
        costPerShare,
        row.rate_slip,
        row.commission,
        row.sales_tax,
        row.cdc_charges,
        tradedAt,
      )
      inserted++
    }

    rebuildHoldingsFromTransactions(acct)
    return { inserted }
  })

  return run()
}

export function getTransactions(account: string, limit = 500): Transaction[] {
  return db.prepare(`
    SELECT id, account, symbol, side, shares, cost_per_share,
           rate_slip, commission, sales_tax, cdc_charges, traded_at
    FROM transactions
    WHERE account = ?
    ORDER BY traded_at DESC, id DESC
    LIMIT ?
  `).all(account, limit) as Transaction[]
}

export function addTrade(input: AddTradeInput): AddTradeResult {
  const account = input.account.trim().toLowerCase()
  const symbol = input.symbol.trim().toUpperCase()
  const side = input.side
  const shares = Math.trunc(input.shares)

  const feeResolution = resolveTradeFees(shares, {
    rate_slip: input.rate_slip,
    commission: input.commission,
    sales_tax: input.sales_tax,
    cdc_charges: input.cdc_charges,
  })

  let costPerShare = input.cost_per_share != null ? Number(input.cost_per_share) : NaN
  if (feeResolution.costPerShare != null) {
    costPerShare = feeResolution.costPerShare
  }

  if (!account) return { ok: false, error: 'Account is required' }
  if (!symbol) return { ok: false, error: 'Symbol is required' }
  if (side !== 'buy' && side !== 'sell') return { ok: false, error: 'Invalid side' }
  if (!Number.isInteger(shares) || shares <= 0) return { ok: false, error: 'Shares must be a positive integer' }
  if (!Number.isFinite(costPerShare) || costPerShare <= 0) {
    return { ok: false, error: 'Cost per share must be a positive number (or provide rate slip to calculate it)' }
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

    const { fees } = feeResolution
    const tradedAt =
      input.traded_at?.trim() ||
      new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

    db.prepare(
      `INSERT INTO transactions (
         account, symbol, side, shares, cost_per_share,
         rate_slip, commission, sales_tax, cdc_charges, traded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      account,
      symbol,
      side,
      shares,
      costPerShare,
      fees.rate_slip,
      fees.commission,
      fees.sales_tax,
      fees.cdc_charges,
      tradedAt,
    )

    if (side === 'buy') {
      applyBuyToHolding(account, symbol, shares, costPerShare)
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
  const days = (db.prepare(`
    SELECT DISTINCT date(fetched_at) AS d
    FROM price_snapshots
    ORDER BY d
  `).all() as { d: string }[])

  if (days.length === 0) return []

  const priceStmt = db.prepare(`
    SELECT price FROM price_snapshots
    WHERE symbol = ? AND date(fetched_at) <= date(?)
    ORDER BY fetched_at DESC LIMIT 1
  `)

  return days.map(({ d }) => {
    const holdings = getCombinedSharesAsOf(d)
    let portfolio_value = 0
    for (const [symbol, qty] of Object.entries(holdings)) {
      const row = priceStmt.get(symbol, d) as { price: number } | undefined
      if (row) portfolio_value += row.price * qty
    }
    return { sess: `${d}T12:00`, portfolio_value }
  })
}

export default db

