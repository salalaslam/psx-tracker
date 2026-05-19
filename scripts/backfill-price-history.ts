import db, {
  getAllSymbols,
  hasSnapshotOnDate,
  storeSnapshotAt,
} from '../src/db.server.ts'
import { fetchPsxEod } from '../src/psx.server.ts'

const SINCE = process.argv[2] ?? '2026-01-01'

const txSymbols = (db.prepare('SELECT DISTINCT symbol FROM transactions').all() as { symbol: string }[])
  .map(r => r.symbol)
const holdingSymbols = getAllSymbols()
const symbols = [...new Set([...txSymbols, ...holdingSymbols])].sort()

let stored = 0
let skipped = 0
let failed: string[] = []

for (const symbol of symbols) {
  const rows = await fetchPsxEod(symbol, SINCE)
  if (rows.length === 0) {
    failed.push(symbol)
    continue
  }
  for (const { date, close } of rows) {
    if (hasSnapshotOnDate(symbol, date)) {
      skipped++
      continue
    }
    storeSnapshotAt(symbol, close, `${date}T12:00:00Z`)
    stored++
  }
  await new Promise(r => setTimeout(r, 200))
}

console.log(
  JSON.stringify(
    {
      since: SINCE,
      symbols: symbols.length,
      stored,
      skipped,
      failed,
      chartDays: (
        db.prepare('SELECT COUNT(DISTINCT date(fetched_at)) c FROM price_snapshots').get() as { c: number }
      ).c,
    },
    null,
    2,
  ),
)
