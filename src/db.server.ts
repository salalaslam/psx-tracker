import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAccountChargeCategory } from './accountCharges'
import { resolveTradeFees } from './fees'
import type { ParsedDividendRow } from './dividends'
import { calcSplitAdjustment } from './corporateEvents'
import type {
  LedgerEvent,
  LedgerPosition,
  LedgerReplayResult,
} from './ledger'
import { replayLedger } from './ledger'
import { migrateDatabase } from './dbMigration.server'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.PSX_TRACKER_DB_PATH
  ? path.resolve(process.env.PSX_TRACKER_DB_PATH)
  : path.resolve(__dirname, '../../data/investments.db')

mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
migrateDatabase(db)
db.pragma('foreign_keys = ON')

// ── Schema ──────────────────────────────────────────────────────────────────
export function resolveAccountId(userId: number, name: string): number {
  const account = db.prepare(`
    SELECT id FROM accounts WHERE user_id = ? AND name = ?
  `).get(userId, name.trim().toLowerCase()) as { id: number } | undefined
  if (!account) throw new Error('Account not found')
  return account.id
}

function getLedgerEvents(accountId: number, symbol?: string): LedgerEvent[] {
  const symbolClause = symbol == null ? '' : ' AND symbol = ?'
  const params = symbol == null ? [accountId] : [accountId, symbol]
  const transactions = db.prepare(`
    SELECT id, symbol, side, shares, cost_per_share, traded_at
    FROM transactions
    WHERE account_id = ?${symbolClause}
  `).all(...params) as Array<{
    id: number
    symbol: string
    side: 'buy' | 'sell'
    shares: number
    cost_per_share: number
    traded_at: string
  }>
  const splits = db.prepare(`
    SELECT id, symbol, effective_date, ratio_from, ratio_to
    FROM corporate_events
    WHERE account_id = ? AND event_type = 'split'${symbolClause}
  `).all(...params) as Array<{
    id: number
    symbol: string
    effective_date: string
    ratio_from: number
    ratio_to: number
  }>

  return [
    ...transactions.map(row => ({ kind: 'transaction' as const, ...row })),
    ...splits.map(row => ({ kind: 'split' as const, ...row })),
  ]
}

function replayAccountLedger(accountId: number, symbol?: string): LedgerReplayResult {
  return replayLedger(getLedgerEvents(accountId, symbol))
}

function updateTransactionBalances(
  accountId: number,
  symbol?: string,
): LedgerReplayResult {
  const replay = replayAccountLedger(accountId, symbol)
  const update = db.prepare(`
    UPDATE transactions
    SET shares_after = ?, total_invested_after = ?
    WHERE id = ?
  `)
  for (const [id, balance] of replay.transactionBalances) {
    update.run(balance.shares_after, balance.total_invested_after, id)
  }
  return replay
}

// ── Seed data (public-safe demo values) ─────────────────────────────────────

const SEED: Array<{ symbol: string; sector: string; demoA: number; demoB: number; costAvg: number }> = [
  { symbol: 'OGDC', sector: 'OIL & GAS EXPLORATION COMPANIES', demoA: 120, demoB: 40, costAvg: 100.0 },
  { symbol: 'FFC', sector: 'FERTILIZER', demoA: 80, demoB: 75, costAvg: 42.5 },
  { symbol: 'MARI', sector: 'OIL & GAS EXPLORATION COMPANIES', demoA: 25, demoB: 0, costAvg: 250.0 },
  { symbol: 'EFERT', sector: 'FERTILIZER', demoA: 0, demoB: 160, costAvg: 12.75 },
]

const localUser = db.prepare(`
  INSERT INTO users (external_id, display_name) VALUES ('local', 'Local User')
  ON CONFLICT(external_id) DO UPDATE SET external_id = excluded.external_id
  RETURNING id
`).get() as { id: number }
const localUserId = localUser.id
const insert = db.prepare(
  `INSERT OR IGNORE INTO holdings (account_id, symbol, shares, cost_avg, total_invested)
   VALUES (?, ?, ?, ?, ?)`
)
const insertAccount = db.prepare(
  `INSERT OR IGNORE INTO accounts (user_id, name) VALUES (?, ?)`
)
const insertStock = db.prepare(
  `INSERT OR IGNORE INTO stocks (symbol, sector) VALUES (?, ?)`
)
const insertAll = db.transaction(() => {
  // Insert accounts first
  insertAccount.run(localUserId, 'demo-a')
  insertAccount.run(localUserId, 'demo-b')
  const demoAId = resolveAccountId(localUserId, 'demo-a')
  const demoBId = resolveAccountId(localUserId, 'demo-b')

  for (const row of SEED) {
    insertStock.run(row.symbol, row.sector)
  }

  // Insert holdings
  for (const row of SEED) {
    if (row.demoA > 0) {
      insert.run(demoAId, row.symbol, row.demoA, row.costAvg, row.costAvg * row.demoA)
    }
    if (row.demoB > 0) {
      insert.run(demoBId, row.symbol, row.demoB, row.costAvg, row.costAvg * row.demoB)
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

export interface CombinedHoldingPricePoint {
  fetched_at: string
  price: number
}

export interface CombinedHoldingPriceSeries {
  symbol: string
  sector: string | null
  shares: number
  account_shares: Record<string, number>
  first_purchase_at: string | null
  latest_price: number | null
  latest_fetched_at: string | null
  points: CombinedHoldingPricePoint[]
}

export interface HoldingWithPrice extends Holding {
  latest_price: number | null
  latest_fetched_at: string | null
  sector: string | null
}

export interface InterestedSymbol {
  symbol: string
  fair_value: number
  notes: string | null
  created_at: string
  updated_at: string
  latest_price: number | null
  latest_fetched_at: string | null
  sector: string | null
}

export interface GainPosition {
  account: string
  symbol: string
  sector: string | null
  shares: number
  cost_avg: number
  total_invested: number
  latest_price: number
  latest_fetched_at: string
  first_invested_at: string | null
  dividend_net: number
  dividend_count: number
}

export function getGainPositions(userId: number): GainPosition[] {
  return db.prepare(`
    SELECT
      a.name AS account,
      h.symbol,
      st.sector,
      h.shares,
      h.cost_avg,
      h.total_invested,
      latest.price AS latest_price,
      latest.fetched_at AS latest_fetched_at,
      first_buy.first_invested_at,
      COALESCE(dividend_totals.dividend_net, 0) AS dividend_net,
      COALESCE(dividend_totals.dividend_count, 0) AS dividend_count
    FROM holdings h
    JOIN accounts a ON a.id = h.account_id
    INNER JOIN price_snapshots latest
      ON latest.symbol = h.symbol
      AND latest.fetched_at = (
        SELECT MAX(fetched_at) FROM price_snapshots WHERE symbol = h.symbol
      )
    LEFT JOIN stocks st ON st.symbol = h.symbol
    LEFT JOIN (
      SELECT account_id, symbol, MIN(traded_at) AS first_invested_at
      FROM transactions
      WHERE side = 'buy'
      GROUP BY account_id, symbol
    ) first_buy
      ON first_buy.account_id = h.account_id AND first_buy.symbol = h.symbol
    LEFT JOIN (
      SELECT account_id, symbol, SUM(net_amount) AS dividend_net, COUNT(1) AS dividend_count
      FROM dividends
      GROUP BY account_id, symbol
    ) dividend_totals
      ON dividend_totals.account_id = h.account_id AND dividend_totals.symbol = h.symbol
    WHERE a.user_id = ? AND ((h.shares * latest.price) - h.total_invested
      + COALESCE(dividend_totals.dividend_net, 0)) > 0
    ORDER BY ((h.shares * latest.price) - h.total_invested
      + COALESCE(dividend_totals.dividend_net, 0)) DESC
  `).all(userId) as GainPosition[]
}

export function upsertStockSector(symbol: string, sector: string): void {
  db.prepare(
    `INSERT INTO stocks (symbol, sector) VALUES (?, ?)
     ON CONFLICT(symbol) DO UPDATE SET sector = excluded.sector`
  ).run(symbol, sector)
}

export function getSymbolsMissingSector(): string[] {
  return (db.prepare(`
    SELECT tracked.symbol
    FROM (
      SELECT symbol FROM holdings
      UNION
      SELECT symbol FROM interested_symbols
    ) tracked
    LEFT JOIN stocks s ON s.symbol = tracked.symbol
    WHERE s.symbol IS NULL
    ORDER BY tracked.symbol
  `).all() as { symbol: string }[]).map(r => r.symbol)
}

export function hasStockSector(symbol: string): boolean {
  return !!db.prepare('SELECT 1 FROM stocks WHERE symbol = ?').get(symbol)
}

export function getHoldings(userId: number, account: string): HoldingWithPrice[] {
  const accountId = resolveAccountId(userId, account)
  return db.prepare(`
    SELECT h.id, a.name AS account, h.symbol, h.shares, h.cost_avg, h.total_invested,
      ps.price          AS latest_price,
      ps.fetched_at     AS latest_fetched_at,
      st.sector         AS sector
    FROM holdings h
    JOIN accounts a ON a.id = h.account_id
    LEFT JOIN price_snapshots ps
      ON ps.symbol = h.symbol
      AND ps.fetched_at = (
        SELECT MAX(fetched_at) FROM price_snapshots WHERE symbol = h.symbol
      )
    LEFT JOIN stocks st ON st.symbol = h.symbol
    WHERE h.account_id = ?
    ORDER BY h.total_invested DESC
  `).all(accountId) as HoldingWithPrice[]
}

export function getAllAccounts(userId: number): string[] {
  return (db.prepare('SELECT name FROM accounts WHERE user_id = ? ORDER BY name').all(userId) as { name: string }[])
    .map(r => r.name)
}

export function createAccount(userId: number, name: string): boolean {
  try {
    db.prepare('INSERT INTO accounts (user_id, name) VALUES (?, ?)')
      .run(userId, name.trim().toLowerCase())
    return true
  } catch {
    return false
  }
}

export function getAllSymbols(userId: number): string[] {
  return (db.prepare(`
    SELECT h.symbol FROM holdings h
    JOIN accounts a ON a.id = h.account_id
    WHERE a.user_id = ?
    UNION
    SELECT symbol FROM interested_symbols WHERE user_id = ?
    ORDER BY symbol
  `).all(userId, userId) as { symbol: string }[])
    .map(r => r.symbol)
}

export function getInterestedSymbols(userId: number): InterestedSymbol[] {
  return db.prepare(`
    SELECT
      interested.symbol,
      interested.fair_value,
      interested.notes,
      interested.created_at,
      interested.updated_at,
      latest.price AS latest_price,
      latest.fetched_at AS latest_fetched_at,
      stocks.sector
    FROM interested_symbols interested
    LEFT JOIN price_snapshots latest
      ON latest.symbol = interested.symbol
      AND latest.fetched_at = (
        SELECT MAX(fetched_at) FROM price_snapshots WHERE symbol = interested.symbol
      )
    LEFT JOIN stocks ON stocks.symbol = interested.symbol
    WHERE interested.user_id = ?
      AND NOT EXISTS (
      SELECT 1 FROM holdings
      JOIN accounts ON accounts.id = holdings.account_id
      WHERE accounts.user_id = interested.user_id
        AND holdings.symbol = interested.symbol
    )
    ORDER BY interested.updated_at DESC, interested.symbol ASC
  `).all(userId) as InterestedSymbol[]
}

export function upsertInterestedSymbol(userId: number, input: {
  symbol: string
  fair_value: number
  notes?: string | null
}): { ok: boolean; error?: string } {
  const symbol = input.symbol.trim().toUpperCase()
  const fairValue = Number(input.fair_value)
  const notes = input.notes?.trim() || null

  if (!symbol) return { ok: false, error: 'Symbol is required' }
  if (!Number.isFinite(fairValue) || fairValue <= 0) {
    return { ok: false, error: 'Fair value must be a positive number' }
  }
  if (db.prepare(`
    SELECT 1 FROM holdings h
    JOIN accounts a ON a.id = h.account_id
    WHERE a.user_id = ? AND h.symbol = ?
  `).get(userId, symbol)) {
    return { ok: false, error: `${symbol} is already in your holdings` }
  }

  db.prepare(`
    INSERT INTO interested_symbols (user_id, symbol, fair_value, notes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, symbol) DO UPDATE SET
      fair_value = excluded.fair_value,
      notes = excluded.notes,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  `).run(userId, symbol, fairValue, notes)

  return { ok: true }
}

export function deleteInterestedSymbol(userId: number, symbol: string): boolean {
  return db.prepare('DELETE FROM interested_symbols WHERE user_id = ? AND symbol = ?')
    .run(userId, symbol.trim().toUpperCase()).changes > 0
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

export function getCombinedSharesAsOf(userId: number, asOfDate: string): Record<string, number> {
  const txs = db.prepare(`
    SELECT t.symbol, t.side, t.shares
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE a.user_id = ? AND date(t.traded_at) <= date(?)
    ORDER BY t.traded_at ASC, t.id ASC
  `).all(userId, asOfDate) as { symbol: string; side: TradeSide; shares: number }[]

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

export function getCombinedHoldingPriceHistory(userId: number): CombinedHoldingPriceSeries[] {
  const rows = db.prepare(`
    SELECT
      h.symbol,
      a.name AS account,
      h.shares,
      st.sector,
      first_buy.first_purchase_at,
      latest.price AS latest_price,
      latest.fetched_at AS latest_fetched_at,
      first_snap.first_snapshot_at
    FROM holdings h
    JOIN accounts a ON a.id = h.account_id
    LEFT JOIN stocks st ON st.symbol = h.symbol
    LEFT JOIN (
      SELECT t.symbol, MIN(t.traded_at) AS first_purchase_at
      FROM transactions t
      JOIN accounts account ON account.id = t.account_id
      WHERE t.side = 'buy' AND account.user_id = ?
      GROUP BY symbol
    ) first_buy ON first_buy.symbol = h.symbol
    LEFT JOIN (
      SELECT symbol, MIN(fetched_at) AS first_snapshot_at
      FROM price_snapshots
      GROUP BY symbol
    ) first_snap ON first_snap.symbol = h.symbol
    LEFT JOIN price_snapshots latest
      ON latest.symbol = h.symbol
      AND latest.fetched_at = (
        SELECT MAX(fetched_at) FROM price_snapshots WHERE symbol = h.symbol
      )
    WHERE a.user_id = ?
    ORDER BY h.symbol, a.name
  `).all(userId, userId) as Array<{
    symbol: string
    account: string
    shares: number
    sector: string | null
    first_purchase_at: string | null
    latest_price: number | null
    latest_fetched_at: string | null
    first_snapshot_at: string | null
  }>

  const grouped = new Map<
    string,
    Omit<CombinedHoldingPriceSeries, 'points'> & { first_snapshot_at: string | null }
  >()

  for (const row of rows) {
    const existing = grouped.get(row.symbol)
    if (existing) {
      existing.shares += row.shares
      existing.account_shares[row.account] = (existing.account_shares[row.account] ?? 0) + row.shares
      if (!existing.sector && row.sector) existing.sector = row.sector
      continue
    }

    grouped.set(row.symbol, {
      symbol: row.symbol,
      sector: row.sector,
      shares: row.shares,
      account_shares: { [row.account]: row.shares },
      first_purchase_at: row.first_purchase_at,
      first_snapshot_at: row.first_snapshot_at,
      latest_price: row.latest_price,
      latest_fetched_at: row.latest_fetched_at,
    })
  }

  const historyStmt = db.prepare(`
    SELECT fetched_at, price
    FROM price_snapshots
    WHERE symbol = ?
      AND date(fetched_at) >= date(?)
    ORDER BY fetched_at ASC
    LIMIT 1000
  `)

  return [...grouped.values()].map(row => {
    const startAt = row.first_purchase_at ?? row.first_snapshot_at
    const points = startAt
      ? (historyStmt.all(row.symbol, startAt) as CombinedHoldingPricePoint[])
      : []
    const { first_snapshot_at: _firstSnapshotAt, ...series } = row
    return { ...series, points }
  })
}

export interface PortfolioValuePoint {
  sess: string
  /** Combined value of holdings actually owned on this date */
  portfolio_value: number
  /** Today's holdings valued at this date's prices */
  current_assets_value: number
}

export function getCurrentCombinedHoldings(userId: number): Record<string, number> {
  const rows = db.prepare(`
    SELECT h.symbol, SUM(h.shares) AS shares
    FROM holdings h
    JOIN accounts a ON a.id = h.account_id
    WHERE a.user_id = ?
    GROUP BY h.symbol
  `).all(userId) as { symbol: string; shares: number }[]
  return Object.fromEntries(rows.map(r => [r.symbol, r.shares]))
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
  shares_after: number | null
  total_invested_after: number | null
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

export interface LedgerMismatch {
  kind: 'row' | 'holding'
  account: string
  symbol: string
  detail: string
}

export interface LedgerVerificationResult {
  ok: boolean
  mismatches: LedgerMismatch[]
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
  accountId: number,
  symbol: string,
  shares: number,
  costPerShare: number,
): void {
  const invested = shares * costPerShare
  const existing = db.prepare(
    `SELECT id, shares, cost_avg, total_invested
     FROM holdings WHERE account_id = ? AND symbol = ?`,
  ).get(accountId, symbol) as Pick<Holding, 'id' | 'shares' | 'cost_avg' | 'total_invested'> | undefined

  if (!existing) {
    db.prepare(
      `INSERT INTO holdings (account_id, symbol, shares, cost_avg, total_invested)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(accountId, symbol, shares, costPerShare, invested)
    return
  }

  const nextShares = existing.shares + shares
  const nextInvested = existing.total_invested + invested
  const nextCostAvg = nextInvested / nextShares
  db.prepare(
    `UPDATE holdings SET shares = ?, cost_avg = ?, total_invested = ? WHERE id = ?`,
  ).run(nextShares, nextCostAvg, nextInvested, existing.id)
}

function applySellToHolding(accountId: number, symbol: string, shares: number): void {
  const existing = db.prepare(
    `SELECT id, shares, cost_avg, total_invested
     FROM holdings WHERE account_id = ? AND symbol = ?`,
  ).get(accountId, symbol) as Pick<Holding, 'id' | 'shares' | 'cost_avg' | 'total_invested'> | undefined

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

function storeReplayPosition(
  accountId: number,
  symbol: string,
  position: LedgerPosition | undefined,
): void {
  if (!position || position.shares === 0) {
    db.prepare('DELETE FROM holdings WHERE account_id = ? AND symbol = ?')
      .run(accountId, symbol)
    return
  }

  const costAvg = position.total_invested / position.shares
  db.prepare(`
    INSERT INTO holdings (account_id, symbol, shares, cost_avg, total_invested)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account_id, symbol) DO UPDATE SET
      shares = excluded.shares,
      cost_avg = excluded.cost_avg,
      total_invested = excluded.total_invested
  `).run(accountId, symbol, position.shares, costAvg, position.total_invested)
}

export function rebuildHoldingsFromTransactions(userId: number, account: string): void {
  const accountId = resolveAccountId(userId, account)
  db.transaction(() => {
    const replay = updateTransactionBalances(accountId)
    db.prepare('DELETE FROM holdings WHERE account_id = ?').run(accountId)
    for (const [symbol, position] of replay.positions) {
      storeReplayPosition(accountId, symbol, position)
    }
  })()
}

export function importPurchaseHistory(
  userId: number,
  account: string,
  rows: PurchaseImportRow[],
  options?: { replace?: boolean },
): { inserted: number } {
  const acct = account.trim().toLowerCase()
  const accountId = resolveAccountId(userId, acct)
  const replace = options?.replace ?? true
  const sorted = [...rows].sort((a, b) => a.traded_at.localeCompare(b.traded_at))

  const insertTx = db.prepare(`
    INSERT INTO transactions (
      account_id, symbol, side, shares, cost_per_share,
      rate_slip, commission, sales_tax, cdc_charges, traded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const run = db.transaction(() => {
    if (replace) {
      db.prepare('DELETE FROM transactions WHERE account_id = ?').run(accountId)
      db.prepare('DELETE FROM holdings WHERE account_id = ?').run(accountId)
    }

    let inserted = 0
    for (const row of sorted) {
      const symbol = row.symbol.trim().toUpperCase()
      const shares = Math.trunc(row.shares)
      const side: TradeSide = row.side === 'sell' ? 'sell' : 'buy'
      const costPerShare = row.amount / shares
      const tradedAt = row.traded_at.includes('T') ? row.traded_at : `${row.traded_at}T12:00:00Z`
      insertTx.run(
        accountId,
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

    rebuildHoldingsFromTransactions(userId, acct)
    return { inserted }
  })

  return run()
}

export function getTransactions(userId: number, account: string, limit = 500): Transaction[] {
  const accountId = resolveAccountId(userId, account)
  return db.prepare(`
    SELECT t.id, a.name AS account, t.symbol, t.side, t.shares, t.cost_per_share,
           rate_slip, commission, sales_tax, cdc_charges,
           shares_after, total_invested_after, traded_at
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.account_id = ?
    ORDER BY t.traded_at DESC, t.id DESC
    LIMIT ?
  `).all(accountId, limit) as Transaction[]
}

function realMatches(actual: number, expected: number): boolean {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= 0.01
}

export function verifyLedger(): LedgerVerificationResult {
  const mismatches: LedgerMismatch[] = []
  const accounts = db.prepare(`
    SELECT DISTINCT a.id, a.name
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    ORDER BY a.user_id, a.name
  `).all() as { id: number; name: string }[]

  for (const { id: accountId, name: account } of accounts) {
    const transactionRows = db.prepare(`
      SELECT id, symbol, shares_after, total_invested_after
      FROM transactions
      WHERE account_id = ?
      ORDER BY symbol, traded_at, id
    `).all(accountId) as Array<{
      id: number
      symbol: string
      shares_after: number | null
      total_invested_after: number | null
    }>
    const symbols = [...new Set(transactionRows.map(row => row.symbol))]
    const finalPositions = new Map<string, LedgerPosition>()
    const failedSymbols = new Set<string>()

    for (const symbol of symbols) {
      let replay: LedgerReplayResult
      try {
        replay = replayAccountLedger(accountId, symbol)
      } catch (e) {
        failedSymbols.add(symbol)
        mismatches.push({
          kind: 'row',
          account,
          symbol,
          detail: `Replay failed: ${e instanceof Error ? e.message : String(e)}`,
        })
        continue
      }

      const position = replay.positions.get(symbol)
      if (position) finalPositions.set(symbol, position)

      for (const row of transactionRows.filter(item => item.symbol === symbol)) {
        const expected = replay.transactionBalances.get(row.id)
        if (!expected) {
          mismatches.push({
            kind: 'row',
            account,
            symbol,
            detail: `Transaction ${row.id} has no replayed balance`,
          })
          continue
        }
        if (
          row.shares_after !== expected.shares_after
          || row.total_invested_after == null
          || !realMatches(
            row.total_invested_after,
            expected.total_invested_after,
          )
        ) {
          mismatches.push({
            kind: 'row',
            account,
            symbol,
            detail:
              `Transaction ${row.id}: stored balance `
              + `${row.shares_after ?? 'NULL'} shares / `
              + `${row.total_invested_after ?? 'NULL'} invested; expected `
              + `${expected.shares_after} shares / `
              + `${expected.total_invested_after} invested`,
          })
        }
      }
    }

    const holdings = db.prepare(`
      SELECT symbol, shares, cost_avg, total_invested
      FROM holdings
      WHERE account_id = ?
    `).all(accountId) as Array<Pick<
      Holding,
      'symbol' | 'shares' | 'cost_avg' | 'total_invested'
    >>
    const holdingsBySymbol = new Map(holdings.map(row => [row.symbol, row]))
    const holdingSymbols = new Set([
      ...finalPositions.keys(),
      ...holdingsBySymbol.keys(),
    ])

    for (const symbol of holdingSymbols) {
      if (failedSymbols.has(symbol)) continue
      const expected = finalPositions.get(symbol)
      const actual = holdingsBySymbol.get(symbol)
      if (!expected && actual) {
        mismatches.push({
          kind: 'holding',
          account,
          symbol,
          detail: `Unexpected holding row with ${actual.shares} shares`,
        })
        continue
      }
      if (expected && !actual) {
        mismatches.push({
          kind: 'holding',
          account,
          symbol,
          detail: `Missing holding row; replay ends with ${expected.shares} shares`,
        })
        continue
      }
      if (!expected || !actual) continue

      const expectedCostAvg = expected.total_invested / expected.shares
      if (
        actual.shares !== expected.shares
        || !realMatches(actual.total_invested, expected.total_invested)
        || !realMatches(actual.cost_avg, expectedCostAvg)
      ) {
        mismatches.push({
          kind: 'holding',
          account,
          symbol,
          detail:
            `Stored holding is ${actual.shares} shares / `
            + `${actual.cost_avg} average / ${actual.total_invested} invested; `
            + `expected ${expected.shares} shares / ${expectedCostAvg} average / `
            + `${expected.total_invested} invested`,
        })
      }
    }
  }

  return { ok: mismatches.length === 0, mismatches }
}

export function addTrade(userId: number, input: AddTradeInput): AddTradeResult {
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

  const accountId = resolveAccountId(userId, account)

  const tx = db.transaction((): AddTradeResult => {
    const existing = db.prepare(
      `SELECT id, shares, cost_avg, total_invested
       FROM holdings
       WHERE account_id = ? AND symbol = ?`
    ).get(accountId, symbol) as Pick<Holding, 'id' | 'shares' | 'cost_avg' | 'total_invested'> | undefined

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

    const insertResult = db.prepare(
      `INSERT INTO transactions (
         account_id, symbol, side, shares, cost_per_share,
         rate_slip, commission, sales_tax, cdc_charges,
         shares_after, total_invested_after, traded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`
    ).run(
      accountId,
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
    const transactionId = Number(insertResult.lastInsertRowid)

    const hasLaterTransaction = !!db.prepare(`
      SELECT 1 FROM transactions
      WHERE account_id = ? AND symbol = ?
        AND (traded_at > ? OR (traded_at = ? AND id > ?))
      LIMIT 1
    `).get(accountId, symbol, tradedAt, tradedAt, transactionId)
    // A same-date split follows every transaction on that date, so it also
    // makes this trade non-terminal in the interleaved replay.
    const hasLaterSplit = !!db.prepare(`
      SELECT 1 FROM corporate_events
      WHERE account_id = ? AND symbol = ? AND event_type = 'split'
        AND effective_date >= ?
      LIMIT 1
    `).get(accountId, symbol, tradedAt.slice(0, 10))

    if (hasLaterTransaction || hasLaterSplit) {
      const replay = updateTransactionBalances(accountId, symbol)
      storeReplayPosition(accountId, symbol, replay.positions.get(symbol))
      if (side === 'buy') {
        db.prepare('DELETE FROM interested_symbols WHERE user_id = ? AND symbol = ?')
          .run(userId, symbol)
      }
      return { ok: true }
    }

    const nextShares = side === 'buy'
      ? (existing?.shares ?? 0) + shares
      : existing!.shares - shares
    const nextInvested = side === 'buy'
      ? (existing?.total_invested ?? 0) + shares * costPerShare
      : nextShares === 0 ? 0 : existing!.cost_avg * nextShares
    db.prepare(`
      UPDATE transactions
      SET shares_after = ?, total_invested_after = ?
      WHERE id = ?
    `).run(nextShares, nextInvested, transactionId)

    if (side === 'buy') {
      applyBuyToHolding(accountId, symbol, shares, costPerShare)
      db.prepare('DELETE FROM interested_symbols WHERE user_id = ? AND symbol = ?')
        .run(userId, symbol)
      return { ok: true }
    }

    applySellToHolding(accountId, symbol, shares)
    return { ok: true }
  })

  try {
    return tx()
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not record trade',
    }
  }
}

// ── Dividends ───────────────────────────────────────────────────────────────

export interface Dividend {
  id: number
  account: string
  event_id: string
  symbol: string
  security_name: string | null
  financial_year: string
  gross_amount: number
  net_amount: number
  status: string
  payment_date: string
  shares: number | null
}

export interface DividendSummary {
  count: number
  total_gross: number
  total_net: number
  /** Sum of shares entitled across dividend events (CDC "No. of Securities"). */
  total_shares: number | null
}

export interface AddDividendInput {
  account: string
  event_id: string
  symbol: string
  security_name?: string | null
  financial_year: string
  gross_amount: number
  net_amount: number
  status?: string
  payment_date: string
  shares?: number | null
}

export interface ImportDividendsResult {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
}

export function getDividends(userId: number, account: string): Dividend[] {
  const accountId = resolveAccountId(userId, account)
  return db.prepare(`
    SELECT d.id, a.name AS account, d.event_id, d.symbol, d.security_name, d.financial_year,
           d.gross_amount, d.net_amount, d.status, d.payment_date, d.shares
    FROM dividends d
    JOIN accounts a ON a.id = d.account_id
    WHERE d.account_id = ?
    ORDER BY d.payment_date DESC, d.id DESC
  `).all(accountId) as Dividend[]
}

export function getAllDividends(userId: number): Dividend[] {
  return db.prepare(`
    SELECT d.id, a.name AS account, d.event_id, d.symbol, d.security_name, d.financial_year,
           d.gross_amount, d.net_amount, d.status, d.payment_date, d.shares
    FROM dividends d
    JOIN accounts a ON a.id = d.account_id
    WHERE a.user_id = ?
    ORDER BY d.payment_date DESC, a.name ASC, d.symbol ASC, d.id DESC
  `).all(userId) as Dividend[]
}

export function getDividendSummary(userId: number, account: string): DividendSummary {
  const accountId = resolveAccountId(userId, account)
  const row = db.prepare(`
    SELECT COUNT(1) AS count,
           COALESCE(SUM(gross_amount), 0) AS total_gross,
           COALESCE(SUM(net_amount), 0) AS total_net,
           SUM(shares) AS total_shares
    FROM dividends
    WHERE account_id = ?
  `).get(accountId) as {
    count: number
    total_gross: number
    total_net: number
    total_shares: number | null
  }
  return {
    count: row.count,
    total_gross: row.total_gross,
    total_net: row.total_net,
    total_shares: row.total_shares,
  }
}

export interface DividendAccountTotals {
  total_net: number
  count: number
  total_shares: number | null
}

export function getAllDividendTotals(userId: number): DividendAccountTotals & {
  by_account: Record<string, DividendAccountTotals>
  by_symbol: Record<string, DividendAccountTotals>
} {
  const accountRows = db.prepare(`
    SELECT a.name AS account,
           COUNT(1) AS count,
           COALESCE(SUM(net_amount), 0) AS total_net,
           SUM(shares) AS total_shares
    FROM dividends d
    JOIN accounts a ON a.id = d.account_id
    WHERE a.user_id = ?
    GROUP BY d.account_id, a.name
  `).all(userId) as { account: string; count: number; total_net: number; total_shares: number | null }[]

  const symbolRows = db.prepare(`
    SELECT symbol,
           COUNT(1) AS count,
           COALESCE(SUM(net_amount), 0) AS total_net,
           SUM(shares) AS total_shares
    FROM dividends d
    JOIN accounts a ON a.id = d.account_id
    WHERE a.user_id = ?
    GROUP BY d.symbol
  `).all(userId) as { symbol: string; count: number; total_net: number; total_shares: number | null }[]

  const by_account: Record<string, DividendAccountTotals> = {}
  let total_net = 0
  let count = 0
  let total_shares: number | null = 0
  for (const row of accountRows) {
    by_account[row.account] = {
      count: row.count,
      total_net: row.total_net,
      total_shares: row.total_shares,
    }
    total_net += row.total_net
    count += row.count
    if (row.total_shares != null) total_shares = (total_shares ?? 0) + row.total_shares
  }
  if (total_shares === 0) total_shares = null

  const by_symbol: Record<string, DividendAccountTotals> = {}
  for (const row of symbolRows) {
    by_symbol[row.symbol] = {
      count: row.count,
      total_net: row.total_net,
      total_shares: row.total_shares,
    }
  }

  return { count, total_net, total_shares, by_account, by_symbol }
}

function validateDividendInput(userId: number, input: AddDividendInput): string | null {
  const account = input.account.trim().toLowerCase()
  const event_id = input.event_id.trim()
  const symbol = input.symbol.trim().toUpperCase()
  const financial_year = input.financial_year.trim()

  if (!account) return 'Account is required'
  if (!event_id) return 'Event ID is required'
  if (!symbol) return 'Symbol is required'
  if (!financial_year) return 'Financial year is required'
  if (!Number.isFinite(input.gross_amount) || input.gross_amount <= 0) {
    return 'Gross amount must be a positive number'
  }
  if (!Number.isFinite(input.net_amount) || input.net_amount <= 0) {
    return 'Net amount must be a positive number'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.payment_date.trim())) {
    return 'Payment date must be YYYY-MM-DD'
  }
  if (input.shares != null) {
    const shares = Math.trunc(input.shares)
    if (!Number.isInteger(shares) || shares <= 0) {
      return 'Shares must be a positive integer'
    }
  }

  const accountExists = db.prepare('SELECT 1 FROM accounts WHERE user_id = ? AND name = ?')
    .get(userId, account)
  if (!accountExists) return 'Account does not exist'

  return null
}

export function addDividend(userId: number, input: AddDividendInput): { ok: boolean; error?: string; id?: number } {
  const accountId = resolveAccountId(userId, input.account)
  const err = validateDividendInput(userId, input)
  if (err) return { ok: false, error: err }

  const event_id = input.event_id.trim()
  const symbol = input.symbol.trim().toUpperCase()

  try {
    const shares =
      input.shares != null && Number.isFinite(input.shares)
        ? Math.trunc(input.shares)
        : null
    const result = db.prepare(`
      INSERT INTO dividends (
        account_id, event_id, symbol, security_name, financial_year,
        gross_amount, net_amount, status, payment_date, shares
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      accountId,
      event_id,
      symbol,
      input.security_name?.trim() || null,
      input.financial_year.trim(),
      input.gross_amount,
      input.net_amount,
      (input.status ?? 'paid').trim().toLowerCase() || 'paid',
      input.payment_date.trim(),
      shares,
    )
    return { ok: true, id: Number(result.lastInsertRowid) }
  } catch {
    return { ok: false, error: 'Duplicate event ID for this account' }
  }
}

export function importDividends(
  userId: number,
  account: string,
  rows: ParsedDividendRow[],
): ImportDividendsResult {
  const acct = account.trim().toLowerCase()
  const accountId = resolveAccountId(userId, acct)

  const upsert = db.prepare(`
    INSERT INTO dividends (
      account_id, event_id, symbol, security_name, financial_year,
      gross_amount, net_amount, status, payment_date, shares
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, event_id) DO UPDATE SET
      symbol = excluded.symbol,
      security_name = COALESCE(excluded.security_name, security_name),
      financial_year = excluded.financial_year,
      gross_amount = excluded.gross_amount,
      net_amount = excluded.net_amount,
      status = excluded.status,
      payment_date = excluded.payment_date,
      shares = COALESCE(excluded.shares, shares)
  `)
  const updateByMatch = db.prepare(`
    UPDATE dividends SET shares = ?
    WHERE account_id = ? AND symbol = ? AND payment_date = ?
      AND ABS(net_amount - ?) < 0.01
      AND (shares IS NULL OR shares != ?)
  `)
  const findByMatch = db.prepare(`
    SELECT id FROM dividends
    WHERE account_id = ? AND symbol = ? AND payment_date = ?
      AND ABS(net_amount - ?) < 0.01
    LIMIT 1
  `)

  const run = db.transaction(() => {
    let inserted = 0
    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (const row of rows) {
      const shares =
        row.shares != null && Number.isFinite(row.shares) ? Math.trunc(row.shares) : null

      if (row.event_id) {
        const before = db.prepare(
          'SELECT id FROM dividends WHERE account_id = ? AND event_id = ?',
        ).get(accountId, row.event_id)
        try {
          upsert.run(
            accountId,
            row.event_id,
            row.symbol,
            row.security_name,
            row.financial_year,
            row.gross_amount,
            row.net_amount,
            row.status,
            row.payment_date,
            shares,
          )
          if (before) updated++
          else inserted++
        } catch {
          errors.push(`Failed to upsert ${row.event_id}`)
        }
        continue
      }

      if (!row.symbol || !row.payment_date || row.net_amount == null) {
        errors.push(`Line skipped: need symbol, payment date, and net amount to match`)
        continue
      }

      const match = findByMatch.get(accountId, row.symbol, row.payment_date, row.net_amount) as
        | { id: number }
        | undefined
      if (!match) {
        skipped++
        continue
      }
      if (shares == null) {
        skipped++
        continue
      }
      const result = updateByMatch.run(
        shares,
        accountId,
        row.symbol,
        row.payment_date,
        row.net_amount,
        shares,
      )
      if (result.changes > 0) updated++
      else skipped++
    }

    return { inserted, updated, skipped, errors }
  })

  return run()
}

export function deleteDividend(userId: number, id: number, account: string): boolean {
  const accountId = resolveAccountId(userId, account)
  const result = db.prepare(
    'DELETE FROM dividends WHERE id = ? AND account_id = ?',
  ).run(id, accountId)
  return result.changes > 0
}

// ── Corporate events (splits, etc.) ─────────────────────────────────────────

export interface CorporateEvent {
  id: number
  account: string
  symbol: string
  event_type: 'split'
  effective_date: string
  ratio_from: number
  ratio_to: number
  shares_before: number
  shares_after: number
  cost_avg_before: number
  cost_avg_after: number
  notes: string | null
}

export interface AddCorporateEventInput {
  account: string
  symbol: string
  event_type: 'split'
  effective_date: string
  ratio_from: number
  ratio_to: number
  notes?: string | null
}

function getHoldingForEvent(
  accountId: number,
  symbol: string,
): Pick<Holding, 'id' | 'shares' | 'cost_avg' | 'total_invested'> | undefined {
  return db.prepare(
    `SELECT id, shares, cost_avg, total_invested
     FROM holdings WHERE account_id = ? AND symbol = ?`,
  ).get(accountId, symbol) as Pick<Holding, 'id' | 'shares' | 'cost_avg' | 'total_invested'> | undefined
}

export function getCorporateEvents(userId: number, account: string): CorporateEvent[] {
  const accountId = resolveAccountId(userId, account)
  return db.prepare(`
    SELECT e.id, a.name AS account, e.symbol, e.event_type, e.effective_date,
           e.ratio_from, e.ratio_to, e.shares_before, e.shares_after,
           e.cost_avg_before, e.cost_avg_after, e.notes
    FROM corporate_events e
    JOIN accounts a ON a.id = e.account_id
    WHERE e.account_id = ?
    ORDER BY e.effective_date DESC, e.id DESC
  `).all(accountId) as CorporateEvent[]
}

function validateCorporateEventInput(userId: number, input: AddCorporateEventInput): string | null {
  const account = input.account.trim().toLowerCase()
  const symbol = input.symbol.trim().toUpperCase()
  const effectiveDate = input.effective_date.trim()

  if (!account) return 'Account is required'
  if (!symbol) return 'Symbol is required'
  if (input.event_type !== 'split') return 'Only split events are supported'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    return 'Effective date must be YYYY-MM-DD'
  }
  if (!Number.isInteger(input.ratio_from) || input.ratio_from <= 0) {
    return 'Ratio "from" must be a positive integer'
  }
  if (!Number.isInteger(input.ratio_to) || input.ratio_to <= 0) {
    return 'Ratio "to" must be a positive integer'
  }

  const accountRow = db.prepare('SELECT id FROM accounts WHERE user_id = ? AND name = ?')
    .get(userId, account) as { id: number } | undefined
  if (!accountRow) {
    return 'Account does not exist'
  }

  const holding = getHoldingForEvent(accountRow.id, symbol)
  if (!holding || holding.shares <= 0) {
    return `No holding for ${symbol} in this account`
  }

  return null
}

export function addCorporateEvent(
  userId: number,
  input: AddCorporateEventInput,
): { ok: boolean; error?: string; id?: number } {
  const accountId = resolveAccountId(userId, input.account)
  const err = validateCorporateEventInput(userId, input)
  if (err) return { ok: false, error: err }

  const symbol = input.symbol.trim().toUpperCase()
  const holding = getHoldingForEvent(accountId, symbol)!
  const notes = input.notes?.trim() || null

  let adjustment
  try {
    adjustment = calcSplitAdjustment(
      holding.shares,
      holding.cost_avg,
      input.ratio_from,
      input.ratio_to,
    )
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid split ratio' }
  }

  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO corporate_events (
        account_id, symbol, event_type, effective_date,
        ratio_from, ratio_to, shares_before, shares_after,
        cost_avg_before, cost_avg_after, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      accountId,
      symbol,
      'split',
      input.effective_date.trim(),
      input.ratio_from,
      input.ratio_to,
      adjustment.sharesBefore,
      adjustment.sharesAfter,
      adjustment.costAvgBefore,
      adjustment.costAvgAfter,
      notes,
    )

    db.prepare(
      `UPDATE holdings SET shares = ?, cost_avg = ?, total_invested = ? WHERE id = ?`,
    ).run(
      adjustment.sharesAfter,
      adjustment.costAvgAfter,
      adjustment.totalInvested,
      holding.id,
    )

    updateTransactionBalances(accountId, symbol)

    return Number(result.lastInsertRowid)
  })

  try {
    const id = tx()
    return { ok: true, id }
  } catch {
    return { ok: false, error: 'Could not record corporate event' }
  }
}

export function deleteCorporateEvent(
  userId: number,
  id: number,
  account: string,
): { ok: boolean; error?: string } {
  const acct = account.trim().toLowerCase()
  const accountId = resolveAccountId(userId, acct)
  const event = db.prepare(`
    SELECT e.id, a.name AS account, e.symbol, e.shares_before, e.shares_after,
           e.cost_avg_before, e.cost_avg_after
    FROM corporate_events e
    JOIN accounts a ON a.id = e.account_id
    WHERE e.id = ? AND e.account_id = ?
  `).get(id, accountId) as
    | Pick<
        CorporateEvent,
        | 'id'
        | 'account'
        | 'symbol'
        | 'shares_before'
        | 'shares_after'
        | 'cost_avg_before'
        | 'cost_avg_after'
      >
    | undefined

  if (!event) return { ok: false, error: 'Event not found' }

  const holding = getHoldingForEvent(accountId, event.symbol)
  if (!holding) {
    return { ok: false, error: 'Holding no longer exists; cannot reverse event' }
  }
  if (holding.shares !== event.shares_after) {
    return {
      ok: false,
      error: `Current holding (${holding.shares} shares) no longer matches post-event count (${event.shares_after}); adjust manually`,
    }
  }

  const totalInvested = event.shares_before * event.cost_avg_before
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE holdings SET shares = ?, cost_avg = ?, total_invested = ? WHERE id = ?`,
    ).run(event.shares_before, event.cost_avg_before, totalInvested, holding.id)
    db.prepare('DELETE FROM corporate_events WHERE id = ? AND account_id = ?').run(id, accountId)
    updateTransactionBalances(accountId, event.symbol)
  })

  try {
    tx()
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not delete corporate event' }
  }
}

// ── Account charges (non-trade cash) ────────────────────────────────────────

export interface AccountCharge {
  id: number
  account: string
  category: string
  label: string
  amount: number
  charged_at: string
  voucher_no: string | null
  notes: string | null
}

export interface AccountChargeSummary {
  count: number
  total_debits: number
  total_credits: number
  net: number
}

export interface AddAccountChargeInput {
  account: string
  category: string
  label: string
  amount: number
  charged_at: string
  voucher_no?: string | null
  notes?: string | null
}

function validateAccountChargeInput(userId: number, input: AddAccountChargeInput): string | null {
  const account = input.account.trim().toLowerCase()
  if (!account) return 'Account is required'
  const accountRow = db.prepare('SELECT id FROM accounts WHERE user_id = ? AND name = ?')
    .get(userId, account) as { id: number } | undefined
  if (!accountRow) {
    return 'Account does not exist'
  }
  if (!isAccountChargeCategory(input.category)) return 'Invalid category'
  const label = input.label.trim()
  if (!label) return 'Label is required'
  if (!Number.isFinite(input.amount) || input.amount === 0) {
    return 'Amount must be a non-zero number (negative = debit, positive = credit)'
  }
  const chargedAt = input.charged_at.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(chargedAt)) {
    return 'Date is required (YYYY-MM-DD)'
  }
  const voucher = input.voucher_no?.trim() || null
  if (voucher) {
    const dup = db.prepare(
      'SELECT 1 FROM account_charges WHERE account_id = ? AND voucher_no = ?',
    ).get(accountRow.id, voucher)
    if (dup) return `Voucher ${voucher} already exists for this account`
  }
  return null
}

export function getAccountCharges(userId: number, account: string): AccountCharge[] {
  const accountId = resolveAccountId(userId, account)
  return db.prepare(`
    SELECT c.id, a.name AS account, c.category, c.label, c.amount, c.charged_at,
           c.voucher_no, c.notes
    FROM account_charges c
    JOIN accounts a ON a.id = c.account_id
    WHERE c.account_id = ?
    ORDER BY c.charged_at DESC, c.id DESC
  `).all(accountId) as AccountCharge[]
}

export function getAccountChargeSummary(userId: number, account: string): AccountChargeSummary {
  const accountId = resolveAccountId(userId, account)
  const rows = db.prepare(`
    SELECT amount FROM account_charges WHERE account_id = ?
  `).all(accountId) as { amount: number }[]

  let total_debits = 0
  let total_credits = 0
  for (const { amount } of rows) {
    if (amount < 0) total_debits += amount
    else total_credits += amount
  }
  return {
    count: rows.length,
    total_debits,
    total_credits,
    net: total_debits + total_credits,
  }
}

export function addAccountCharge(
  userId: number,
  input: AddAccountChargeInput,
): { ok: boolean; error?: string; id?: number } {
  const accountId = resolveAccountId(userId, input.account)
  const err = validateAccountChargeInput(userId, input)
  if (err) return { ok: false, error: err }

  const voucher = input.voucher_no?.trim() || null
  const notes = input.notes?.trim() || null

  try {
    const result = db.prepare(`
      INSERT INTO account_charges (account_id, category, label, amount, charged_at, voucher_no, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      accountId,
      input.category,
      input.label.trim(),
      Math.round(input.amount * 100) / 100,
      input.charged_at.trim(),
      voucher,
      notes,
    )
    return { ok: true, id: Number(result.lastInsertRowid) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('UNIQUE')) return { ok: false, error: 'Duplicate voucher number for this account' }
    return { ok: false, error: msg }
  }
}

export function deleteAccountCharge(userId: number, id: number, account: string): boolean {
  const accountId = resolveAccountId(userId, account)
  const result = db.prepare(
    'DELETE FROM account_charges WHERE id = ? AND account_id = ?',
  ).run(id, accountId)
  return result.changes > 0
}

export interface AccountChargeSeedRow {
  category: string
  label: string
  amount: number
  charged_at: string
  voucher_no: string
  notes?: string | null
}

export function importAccountCharges(
  userId: number,
  account: string,
  rows: AccountChargeSeedRow[],
): { inserted: number; skipped: number; errors: string[] } {
  const acct = account.trim().toLowerCase()
  const accountId = resolveAccountId(userId, acct)

  const existsStmt = db.prepare(
    'SELECT 1 FROM account_charges WHERE account_id = ? AND voucher_no = ?',
  )
  let inserted = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of rows) {
    const voucher = row.voucher_no.trim()
    if (existsStmt.get(accountId, voucher)) {
      skipped++
      continue
    }
    const result = addAccountCharge(userId, {
      account: acct,
      category: row.category,
      label: row.label,
      amount: row.amount,
      charged_at: row.charged_at,
      voucher_no: voucher,
      notes: row.notes ?? null,
    })
    if (result.ok) inserted++
    else errors.push(`${voucher}: ${result.error ?? 'failed'}`)
  }

  return { inserted, skipped, errors }
}

export function getPortfolioValueHistory(userId: number): PortfolioValuePoint[] {
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

  const currentHoldings = getCurrentCombinedHoldings(userId)

  return days.map(({ d }) => {
    const holdings = getCombinedSharesAsOf(userId, d)
    let portfolio_value = 0
    for (const [symbol, qty] of Object.entries(holdings)) {
      const row = priceStmt.get(symbol, d) as { price: number } | undefined
      if (row) portfolio_value += row.price * qty
    }

    let current_assets_value = 0
    for (const [symbol, qty] of Object.entries(currentHoldings)) {
      const row = priceStmt.get(symbol, d) as { price: number } | undefined
      if (row) current_assets_value += row.price * qty
    }

    return { sess: `${d}T12:00`, portfolio_value, current_assets_value }
  })
}

const startupLedgerVerification = verifyLedger()
if (!startupLedgerVerification.ok) {
  console.error([
    '!!! LEDGER VERIFICATION FAILED !!!',
    ...startupLedgerVerification.mismatches.map(
      mismatch =>
        `[${mismatch.kind}] ${mismatch.account}/${mismatch.symbol}: ${mismatch.detail}`,
    ),
  ].join('\n'))
}

export default db
