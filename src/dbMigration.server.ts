import type Database from 'better-sqlite3'

export const SCHEMA_VERSION = 1

const V1_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id  TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name    TEXT NOT NULL,
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS holdings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id     INTEGER NOT NULL REFERENCES accounts(id),
    symbol         TEXT NOT NULL,
    shares         INTEGER NOT NULL,
    cost_avg       REAL NOT NULL,
    total_invested REAL NOT NULL,
    UNIQUE(account_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS price_snapshots (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol     TEXT NOT NULL,
    price      REAL NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_symbol_time
    ON price_snapshots(symbol, fetched_at DESC);

  CREATE TABLE IF NOT EXISTS transactions (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id           INTEGER NOT NULL REFERENCES accounts(id),
    symbol               TEXT NOT NULL,
    side                 TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    shares               INTEGER NOT NULL,
    cost_per_share       REAL NOT NULL,
    rate_slip            REAL,
    commission           REAL,
    sales_tax            REAL,
    cdc_charges          REAL,
    shares_after         INTEGER,
    total_invested_after REAL,
    traded_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_account_time
    ON transactions(account_id, traded_at DESC);

  CREATE TABLE IF NOT EXISTS stocks (
    symbol TEXT PRIMARY KEY,
    sector TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS interested_symbols (
    user_id     INTEGER NOT NULL REFERENCES users(id),
    symbol      TEXT NOT NULL,
    fair_value  REAL NOT NULL CHECK (fair_value > 0),
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(user_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS dividends (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id     INTEGER NOT NULL REFERENCES accounts(id),
    event_id       TEXT NOT NULL,
    symbol         TEXT NOT NULL,
    security_name  TEXT,
    financial_year TEXT NOT NULL,
    gross_amount   REAL NOT NULL,
    net_amount     REAL NOT NULL,
    status         TEXT NOT NULL DEFAULT 'paid',
    payment_date   TEXT NOT NULL,
    shares         INTEGER,
    UNIQUE(account_id, event_id)
  );

  CREATE INDEX IF NOT EXISTS idx_dividends_account_date
    ON dividends(account_id, payment_date DESC);

  CREATE TABLE IF NOT EXISTS account_charges (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    category   TEXT NOT NULL,
    label      TEXT NOT NULL,
    amount     REAL NOT NULL,
    charged_at TEXT NOT NULL,
    voucher_no TEXT,
    notes      TEXT,
    UNIQUE(account_id, voucher_no)
  );

  CREATE INDEX IF NOT EXISTS idx_account_charges_account_date
    ON account_charges(account_id, charged_at DESC);

  CREATE TABLE IF NOT EXISTS corporate_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id      INTEGER NOT NULL REFERENCES accounts(id),
    symbol          TEXT NOT NULL,
    event_type      TEXT NOT NULL CHECK (event_type IN ('split')),
    effective_date  TEXT NOT NULL,
    ratio_from      INTEGER NOT NULL,
    ratio_to        INTEGER NOT NULL,
    shares_before   INTEGER NOT NULL,
    shares_after    INTEGER NOT NULL,
    cost_avg_before REAL NOT NULL,
    cost_avg_after  REAL NOT NULL,
    notes           TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_corporate_events_account_date
    ON corporate_events(account_id, effective_date DESC);
`

function tableExists(db: Database.Database, table: string): boolean {
  return !!db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
  ).get(table)
}

function assertCountPreserved(
  db: Database.Database,
  oldTable: string,
  newTable: string,
): void {
  const oldCount = (db.prepare(`SELECT COUNT(1) AS count FROM ${oldTable}`).get() as {
    count: number
  }).count
  const newCount = (db.prepare(`SELECT COUNT(1) AS count FROM ${newTable}`).get() as {
    count: number
  }).count
  if (oldCount !== newCount) {
    throw new Error(`Migration would lose rows from ${oldTable}: ${oldCount} -> ${newCount}`)
  }
}

function migrateV0ToV1(db: Database.Database): void {
  db.exec(`
    CREATE TABLE users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id  TEXT NOT NULL UNIQUE,
      display_name TEXT,
      created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    INSERT INTO users (external_id, display_name) VALUES ('local', 'Local User');

    ALTER TABLE accounts RENAME TO accounts_old;
    CREATE TABLE accounts (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name    TEXT NOT NULL,
      UNIQUE(user_id, name)
    );
    INSERT INTO accounts (id, user_id, name)
      SELECT old.id, users.id, old.name
      FROM accounts_old old
      CROSS JOIN users
      WHERE users.external_id = 'local';

    CREATE TABLE holdings_new (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id     INTEGER NOT NULL REFERENCES accounts(id),
      symbol         TEXT NOT NULL,
      shares         INTEGER NOT NULL,
      cost_avg       REAL NOT NULL,
      total_invested REAL NOT NULL,
      UNIQUE(account_id, symbol)
    );
    INSERT INTO holdings_new (id, account_id, symbol, shares, cost_avg, total_invested)
      SELECT child.id, account.id, child.symbol, child.shares, child.cost_avg, child.total_invested
      FROM holdings child
      JOIN accounts_old old ON old.name = child.account
      JOIN accounts account ON account.id = old.id;

    CREATE TABLE transactions_new (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id           INTEGER NOT NULL REFERENCES accounts(id),
      symbol               TEXT NOT NULL,
      side                 TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
      shares               INTEGER NOT NULL,
      cost_per_share       REAL NOT NULL,
      rate_slip            REAL,
      commission           REAL,
      sales_tax            REAL,
      cdc_charges          REAL,
      shares_after         INTEGER,
      total_invested_after REAL,
      traded_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    INSERT INTO transactions_new (
      id, account_id, symbol, side, shares, cost_per_share, rate_slip,
      commission, sales_tax, cdc_charges, shares_after, total_invested_after, traded_at
    )
      SELECT child.id, account.id, child.symbol, child.side, child.shares,
        child.cost_per_share, child.rate_slip, child.commission, child.sales_tax,
        child.cdc_charges, child.shares_after, child.total_invested_after, child.traded_at
      FROM transactions child
      JOIN accounts_old old ON old.name = child.account
      JOIN accounts account ON account.id = old.id;

    CREATE TABLE dividends_new (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id     INTEGER NOT NULL REFERENCES accounts(id),
      event_id       TEXT NOT NULL,
      symbol         TEXT NOT NULL,
      security_name  TEXT,
      financial_year TEXT NOT NULL,
      gross_amount   REAL NOT NULL,
      net_amount     REAL NOT NULL,
      status         TEXT NOT NULL DEFAULT 'paid',
      payment_date   TEXT NOT NULL,
      shares         INTEGER,
      UNIQUE(account_id, event_id)
    );
    INSERT INTO dividends_new (
      id, account_id, event_id, symbol, security_name, financial_year,
      gross_amount, net_amount, status, payment_date, shares
    )
      SELECT child.id, account.id, child.event_id, child.symbol, child.security_name,
        child.financial_year, child.gross_amount, child.net_amount, child.status,
        child.payment_date, child.shares
      FROM dividends child
      JOIN accounts_old old ON old.name = child.account
      JOIN accounts account ON account.id = old.id;

    CREATE TABLE account_charges_new (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      category   TEXT NOT NULL,
      label      TEXT NOT NULL,
      amount     REAL NOT NULL,
      charged_at TEXT NOT NULL,
      voucher_no TEXT,
      notes      TEXT,
      UNIQUE(account_id, voucher_no)
    );
    INSERT INTO account_charges_new (
      id, account_id, category, label, amount, charged_at, voucher_no, notes
    )
      SELECT child.id, account.id, child.category, child.label, child.amount,
        child.charged_at, child.voucher_no, child.notes
      FROM account_charges child
      JOIN accounts_old old ON old.name = child.account
      JOIN accounts account ON account.id = old.id;

    CREATE TABLE corporate_events_new (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id      INTEGER NOT NULL REFERENCES accounts(id),
      symbol          TEXT NOT NULL,
      event_type      TEXT NOT NULL CHECK (event_type IN ('split')),
      effective_date  TEXT NOT NULL,
      ratio_from      INTEGER NOT NULL,
      ratio_to        INTEGER NOT NULL,
      shares_before   INTEGER NOT NULL,
      shares_after    INTEGER NOT NULL,
      cost_avg_before REAL NOT NULL,
      cost_avg_after  REAL NOT NULL,
      notes           TEXT
    );
    INSERT INTO corporate_events_new (
      id, account_id, symbol, event_type, effective_date, ratio_from, ratio_to,
      shares_before, shares_after, cost_avg_before, cost_avg_after, notes
    )
      SELECT child.id, account.id, child.symbol, child.event_type,
        child.effective_date, child.ratio_from, child.ratio_to, child.shares_before,
        child.shares_after, child.cost_avg_before, child.cost_avg_after, child.notes
      FROM corporate_events child
      JOIN accounts_old old ON old.name = child.account
      JOIN accounts account ON account.id = old.id;

    CREATE TABLE interested_symbols_new (
      user_id     INTEGER NOT NULL REFERENCES users(id),
      symbol      TEXT NOT NULL,
      fair_value  REAL NOT NULL CHECK (fair_value > 0),
      notes       TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(user_id, symbol)
    );
    INSERT INTO interested_symbols_new (
      user_id, symbol, fair_value, notes, created_at, updated_at
    )
      SELECT users.id, interested.symbol, interested.fair_value, interested.notes,
        interested.created_at, interested.updated_at
      FROM interested_symbols interested
      CROSS JOIN users
      WHERE users.external_id = 'local';
  `)

  for (const table of [
    'holdings',
    'transactions',
    'dividends',
    'account_charges',
    'corporate_events',
    'interested_symbols',
  ]) {
    assertCountPreserved(db, table, `${table}_new`)
  }

  db.exec(`
    DROP TABLE holdings;
    DROP TABLE transactions;
    DROP TABLE dividends;
    DROP TABLE account_charges;
    DROP TABLE corporate_events;
    DROP TABLE interested_symbols;
    DROP TABLE accounts_old;

    ALTER TABLE holdings_new RENAME TO holdings;
    ALTER TABLE transactions_new RENAME TO transactions;
    ALTER TABLE dividends_new RENAME TO dividends;
    ALTER TABLE account_charges_new RENAME TO account_charges;
    ALTER TABLE corporate_events_new RENAME TO corporate_events;
    ALTER TABLE interested_symbols_new RENAME TO interested_symbols;

    CREATE INDEX idx_transactions_account_time
      ON transactions(account_id, traded_at DESC);
    CREATE INDEX idx_dividends_account_date
      ON dividends(account_id, payment_date DESC);
    CREATE INDEX idx_account_charges_account_date
      ON account_charges(account_id, charged_at DESC);
    CREATE INDEX idx_corporate_events_account_date
      ON corporate_events(account_id, effective_date DESC);
    PRAGMA user_version = 1;
  `)
}

export function migrateDatabase(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number
  if (version > SCHEMA_VERSION) {
    throw new Error(`Database schema version ${version} is newer than supported version ${SCHEMA_VERSION}`)
  }

  if (version === SCHEMA_VERSION) {
    db.exec(V1_SCHEMA)
    return
  }

  const foreignKeysEnabled = db.pragma('foreign_keys', { simple: true }) === 1
  db.pragma('foreign_keys = OFF')
  try {
    if (!tableExists(db, 'accounts')) {
      db.transaction(() => {
        db.exec(V1_SCHEMA)
        db.pragma(`user_version = ${SCHEMA_VERSION}`)
      })()
    } else {
      db.transaction(() => migrateV0ToV1(db))()
      db.exec(V1_SCHEMA)
    }
  } finally {
    db.pragma(`foreign_keys = ${foreignKeysEnabled ? 'ON' : 'OFF'}`)
  }
}
