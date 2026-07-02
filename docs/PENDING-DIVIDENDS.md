# Pending dividends tab (deferred)

This feature was prototyped and removed from psx-tracker. Use this document to re-implement it later without hitting PSX directly.

## Goal

On each account page (`/account/:name`), add a **Pending** tab that shows dividend announcements from [kmiallshr-dividend-board](https://github.com/salalaslam/kmiallshr-dividend-board) that:

- Match symbols in **that account’s holdings** (shares > 0)
- Are **not yet recorded** in the local SQLite `dividends` table for that account
- Come from **Convex only** (no PSX scraping in psx-tracker)

**Scope chosen:** account-level tab (not global nav); rows only for held symbols; estimated gross = `shares × dividendPerShare`.

## Data source

| Item | Detail |
|------|--------|
| Repo | [salalaslam/kmiallshr-dividend-board](https://github.com/salalaslam/kmiallshr-dividend-board) — clone for schema and sample data |
| Convex query | `stocks.list` — public read |
| HTTP | `POST {CONVEX_URL}/api/query` with `{"path":"stocks:list","args":{}}` |
| Env | `KMIALLSHR_CONVEX_URL` = kmiallshr’s `NEXT_PUBLIC_CONVEX_URL` |
| Coverage | KMIALLSHR index constituents only |

Per-payout fields on each `stock.payouts[]` entry: `announcedAt`, `periodLabel`, `bookClosure`, `dividendPerShare`, `dividendPercent`, `fiscalYear`, etc. See `convex/schema.ts` in kmiallshr.

## Pending payout rules

1. Parse book-closure end from PSX string `"DD/MM/YYYY - DD/MM/YYYY"` (handle `"-"` / invalid).
2. Include payout if symbol is held and **not received**: no `dividends` row for that account where `symbol` matches and `payment_date` is within **±14 days** of book-closure end (or `announcedAt` if closure missing).
3. Sort by book-closure end ascending, then `announcedAt`.

Optional date filters (were added then removed):

- Strictly after **today** (book-closure end)
- Strictly after **1st of current month**

## Files to add

| File | Purpose |
|------|---------|
| `src/kmiallshr.types.ts` | `KmiallshrStockDoc`, `KmiallshrPayout`, `PendingDividendRow`, `PendingDividendsResult` |
| `src/kmiallshr.server.ts` | `fetchKmiallshrStocks()` via Convex HTTP |
| `src/pendingDividends.ts` | `parseBookClosureEnd`, `buildPendingDividendsForAccount` |
| `src/pendingDividends.test.ts` | Unit tests for parse + build + dedup |
| `src/components/AccountPendingDividends.tsx` | Summary cards + sortable table |
| `.env.example` | `KMIALLSHR_CONVEX_URL=https://your-deployment.convex.cloud` |

## Server integration

In `src/serverFns.ts`:

```typescript
export const serverGetPendingDividends = createServerFn({ method: 'GET' })
  .validator((account: unknown) => String(account))
  .handler(async ({ data }) => {
    const account = String(data).trim().toLowerCase()
    try {
      const [holdings, dividends, stocks] = await Promise.all([
        getHoldings(account),
        getDividends(account),
        fetchKmiallshrStocks(),
      ])
      return buildPendingDividendsForAccount(holdings, dividends, stocks)
    } catch (err) {
      return {
        rows: [],
        summary: { count: 0, totalEstimatedGross: 0 },
        indexSymbols: [],
        error: err instanceof Error ? err.message : 'Could not load pending dividends',
      }
    }
  })
```

No extra npm package required if using raw `fetch` to Convex.

## UI integration

In `src/routes/account.$name.tsx`:

- Extend `AccountTab` with `'pending'`.
- Loader: add `serverGetPendingDividends({ data: params.name })` to `Promise.all`.
- Tab button **Pending** with badge `pendingDividends.summary.count`.
- Render `<AccountPendingDividends holdings={holdings} pending={pendingDividends} />` when active.
- Match styling of `AccountDividends.tsx` (panels, `fmt`, sortable columns).

Read-only tab; reload account route after CDC import on **Dividends** tab.

## Convex fetch (reference)

```typescript
export async function fetchKmiallshrStocks(): Promise<KmiallshrStockDoc[]> {
  const base = process.env.KMIALLSHR_CONVEX_URL!.replace(/\/$/, '')
  const res = await fetch(`${base}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'stocks:list', args: {} }),
  })
  const body = await res.json()
  if (body.status === 'error') throw new Error(body.errorMessage)
  return body.value ?? []
}
```

## Book-closure parser (reference)

```typescript
export function parseBookClosureEnd(bookClosure: string): Date | null {
  if (!bookClosure || bookClosure === '-') return null
  const end = bookClosure.split('-').pop()?.trim()
  if (!end) return null
  const [d, m, y] = end.split('/').map(Number)
  if (!d || !m || !y) return null
  return new Date(y, m - 1, d)
}
```

## Manual test checklist

1. Set `KMIALLSHR_CONVEX_URL` in `.env`.
2. Open an account with a KMIALLSHR holding and an unrecorded payout in Convex.
3. Confirm `est. gross = shares × dividendPerShare`.
4. Import matching CDC row on **Dividends** → pending row disappears after reload.
5. Non-index holding (e.g. `OGDC`) → footnote only, no error.

## Out of scope (v1)

- Global dashboard widget
- Full index without holdings
- Write-back to Convex
- WHT/zakat net estimates
