import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from './dbMigration.server'

function createV0Database(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL REFERENCES accounts(name),
      symbol TEXT NOT NULL,
      shares INTEGER NOT NULL,
      cost_avg REAL NOT NULL,
      total_invested REAL NOT NULL,
      UNIQUE(account, symbol)
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL REFERENCES accounts(name),
      symbol TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
      shares INTEGER NOT NULL,
      cost_per_share REAL NOT NULL,
      rate_slip REAL,
      commission REAL,
      sales_tax REAL,
      cdc_charges REAL,
      shares_after INTEGER,
      total_invested_after REAL,
      traded_at TEXT NOT NULL
    );
    CREATE INDEX idx_transactions_account_time ON transactions(account, traded_at DESC);
    CREATE TABLE dividends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL REFERENCES accounts(name),
      event_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      security_name TEXT,
      financial_year TEXT NOT NULL,
      gross_amount REAL NOT NULL,
      net_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid',
      payment_date TEXT NOT NULL,
      shares INTEGER,
      UNIQUE(account, event_id)
    );
    CREATE INDEX idx_dividends_account_date ON dividends(account, payment_date DESC);
    CREATE TABLE account_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL REFERENCES accounts(name),
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      amount REAL NOT NULL,
      charged_at TEXT NOT NULL,
      voucher_no TEXT,
      notes TEXT,
      UNIQUE(account, voucher_no)
    );
    CREATE INDEX idx_account_charges_account_date ON account_charges(account, charged_at DESC);
    CREATE TABLE corporate_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL REFERENCES accounts(name),
      symbol TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('split')),
      effective_date TEXT NOT NULL,
      ratio_from INTEGER NOT NULL,
      ratio_to INTEGER NOT NULL,
      shares_before INTEGER NOT NULL,
      shares_after INTEGER NOT NULL,
      cost_avg_before REAL NOT NULL,
      cost_avg_after REAL NOT NULL,
      notes TEXT
    );
    CREATE INDEX idx_corporate_events_account_date ON corporate_events(account, effective_date DESC);
    CREATE TABLE interested_symbols (
      symbol TEXT PRIMARY KEY,
      fair_value REAL NOT NULL CHECK (fair_value > 0),
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE stocks (symbol TEXT PRIMARY KEY, sector TEXT NOT NULL);
    CREATE TABLE price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      price REAL NOT NULL,
      fetched_at TEXT NOT NULL
    );
    CREATE INDEX idx_snapshots_symbol_time ON price_snapshots(symbol, fetched_at DESC);

    INSERT INTO accounts (name) VALUES ('jane'), ('john');
    INSERT INTO holdings (account, symbol, shares, cost_avg, total_invested)
      VALUES ('jane', 'ABC', 10, 100, 1000), ('john', 'XYZ', 5, 200, 1000);
    INSERT INTO transactions (
      account, symbol, side, shares, cost_per_share, shares_after,
      total_invested_after, traded_at
    ) VALUES
      ('jane', 'ABC', 'buy', 10, 100, 10, 1000, '2025-01-01T00:00:00Z'),
      ('john', 'XYZ', 'buy', 5, 200, 5, 1000, '2025-01-02T00:00:00Z');
    INSERT INTO dividends (
      account, event_id, symbol, financial_year, gross_amount, net_amount,
      payment_date, shares
    ) VALUES ('jane', 'D1', 'ABC', '2025', 100, 85, '2025-02-01', 10);
    INSERT INTO account_charges (
      account, category, label, amount, charged_at, voucher_no
    ) VALUES ('john', 'other', 'Fee', -10, '2025-02-01', 'V1');
    INSERT INTO corporate_events (
      account, symbol, event_type, effective_date, ratio_from, ratio_to,
      shares_before, shares_after, cost_avg_before, cost_avg_after
    ) VALUES ('jane', 'ABC', 'split', '2025-03-01', 1, 2, 10, 20, 100, 50);
    INSERT INTO interested_symbols (symbol, fair_value, created_at, updated_at)
      VALUES ('WATCH', 42, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
    INSERT INTO stocks (symbol, sector) VALUES ('ABC', 'TEST');
    INSERT INTO price_snapshots (symbol, price, fetched_at)
      VALUES ('ABC', 110, '2025-01-03T00:00:00Z');
  `)
  return db
}

describe('v0 to v1 database migration', () => {
  it('preserves rows, assigns local ownership, and leaves foreign keys valid', () => {
    const db = createV0Database()
    const tables = [
      'accounts',
      'holdings',
      'transactions',
      'dividends',
      'account_charges',
      'corporate_events',
      'interested_symbols',
      'stocks',
      'price_snapshots',
    ]
    const before = Object.fromEntries(tables.map(table => [
      table,
      (db.prepare(`SELECT COUNT(1) AS count FROM ${table}`).get() as { count: number }).count,
    ]))

    migrateDatabase(db)

    expect(db.pragma('user_version', { simple: true })).toBe(1)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.prepare(`SELECT external_id FROM users`).all()).toEqual([
      { external_id: 'local' },
    ])
    expect(db.prepare(`
      SELECT a.name, u.external_id
      FROM accounts a JOIN users u ON u.id = a.user_id
      ORDER BY a.name
    `).all()).toEqual([
      { name: 'jane', external_id: 'local' },
      { name: 'john', external_id: 'local' },
    ])
    for (const table of tables) {
      const after = (db.prepare(`SELECT COUNT(1) AS count FROM ${table}`).get() as {
        count: number
      }).count
      expect(after, table).toBe(before[table])
    }
    expect(db.prepare(`
      SELECT a.name AS account, h.symbol
      FROM holdings h JOIN accounts a ON a.id = h.account_id
      ORDER BY a.name
    `).all()).toEqual([
      { account: 'jane', symbol: 'ABC' },
      { account: 'john', symbol: 'XYZ' },
    ])
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })

  it('rolls the entire migration back when a child account cannot be resolved', () => {
    const db = createV0Database()
    db.pragma('foreign_keys = OFF')
    db.prepare(`
      INSERT INTO holdings (account, symbol, shares, cost_avg, total_invested)
      VALUES ('missing', 'BAD', 1, 1, 1)
    `).run()
    db.pragma('foreign_keys = ON')

    expect(() => migrateDatabase(db)).toThrow('Migration would lose rows from holdings')
    expect(db.pragma('user_version', { simple: true })).toBe(0)
    expect(db.prepare(`SELECT COUNT(1) AS count FROM holdings`).get()).toEqual({ count: 3 })
    expect(db.prepare(`
      SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'
    `).get()).toBeUndefined()
    expect((db.prepare(`PRAGMA table_info(holdings)`).all() as { name: string }[])
      .map(column => column.name)).toContain('account')
    db.close()
  })
})
