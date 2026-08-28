import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

const tempDir = mkdtempSync(path.join(tmpdir(), 'psx-tracker-scope-'))
const databasePath = path.join(tempDir, 'scope.db')

afterAll(() => {
  delete process.env.PSX_TRACKER_DB_PATH
  rmSync(tempDir, { recursive: true, force: true })
})

describe('user-scoped database API', () => {
  it('cannot read or write an account owned by another user', async () => {
    process.env.PSX_TRACKER_DB_PATH = databasePath
    vi.resetModules()
    const databaseModule = await import('./db.server')
    const db = databaseModule.default
    const userA = (db.prepare(`
      INSERT INTO users (external_id) VALUES ('user-a') RETURNING id
    `).get() as { id: number }).id
    const userB = (db.prepare(`
      INSERT INTO users (external_id) VALUES ('user-b') RETURNING id
    `).get() as { id: number }).id

    expect(databaseModule.createAccount(userB, 'private')).toBe(true)
    expect(() => databaseModule.getHoldings(userA, 'private')).toThrow('Account not found')
    expect(() => databaseModule.addTrade(userA, {
      account: 'private',
      symbol: 'ABC',
      side: 'buy',
      shares: 1,
      cost_per_share: 100,
    })).toThrow('Account not found')
    expect(db.prepare(`SELECT COUNT(1) AS count FROM transactions`).get()).toEqual({ count: 0 })

    expect(databaseModule.createAccount(userA, 'private')).toBe(true)
    expect(databaseModule.addTrade(userA, {
      account: 'private',
      symbol: 'ABC',
      side: 'buy',
      shares: 1,
      cost_per_share: 100,
    })).toEqual({ ok: true })
    expect(databaseModule.getHoldings(userA, 'private')).toHaveLength(1)
    expect(databaseModule.getHoldings(userB, 'private')).toHaveLength(0)
    db.close()
  })
})
