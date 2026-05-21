import { createServerFn } from '@tanstack/react-start'
import {
  addDividend,
  addTrade,
  createAccount,
  deleteDividend,
  getAllAccounts,
  getAllDividendTotals,
  getAllSymbols,
  getDividendSummary,
  getDividends,
  getHoldings,
  getLatestPrices,
  getPortfolioValueHistory,
  getPriceHistory,
  getSymbolsMissingSector,
  getTransactions,
  hasStockSector,
  importDividends,
  storeSnapshot,
  upsertStockSector,
} from './db.server'
import { parseDividendPaste, parsePaymentDate } from './dividends'
import { fetchAllPrices, fetchAndStoreSectors, fetchPsxQuote } from './psx.server'

async function ensureMissingSectors(): Promise<{ fetched: number; failed: string[] }> {
  const missing = getSymbolsMissingSector()
  if (missing.length === 0) return { fetched: 0, failed: [] }
  const { stored, failed } = await fetchAndStoreSectors(missing, upsertStockSector)
  return { fetched: stored.length, failed }
}

export const serverGetHoldings = createServerFn({ method: 'GET' })
  .inputValidator((account: unknown) => String(account))
  .handler(async ({ data }) => getHoldings(data))

export const serverGetTransactions = createServerFn({ method: 'GET' })
  .inputValidator((account: unknown) => String(account))
  .handler(async ({ data }) => getTransactions(data))

export const serverGetAllAccounts = createServerFn({ method: 'GET' }).handler(
  async () => getAllAccounts(),
)

export const serverCreateAccount = createServerFn({ method: 'POST' })
  .inputValidator((name: unknown) => {
    const str = String(name).trim()
    if (str.length < 1 || str.length > 50) throw new Error('Account name must be 1-50 characters')
    return str
  })
  .handler(async ({ data }) => createAccount(data))

export const serverAddTrade = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => {
    const parsed = (input ?? {}) as {
      account?: unknown
      symbol?: unknown
      side?: unknown
      shares?: unknown
      cost_per_share?: unknown
      rate_slip?: unknown
      commission?: unknown
      sales_tax?: unknown
      cdc_charges?: unknown
    }

    const account = String(parsed.account ?? '').trim().toLowerCase()
    const symbol = String(parsed.symbol ?? '').trim().toUpperCase()
    const side = String(parsed.side ?? '').trim().toLowerCase()
    const shares = Number(parsed.shares)
    const costPerShare =
      parsed.cost_per_share != null && String(parsed.cost_per_share).trim() !== ''
        ? Number(parsed.cost_per_share)
        : undefined
    const rateSlip =
      parsed.rate_slip != null && String(parsed.rate_slip).trim() !== ''
        ? Number(parsed.rate_slip)
        : undefined
    const commission =
      parsed.commission != null && String(parsed.commission).trim() !== ''
        ? Number(parsed.commission)
        : undefined
    const salesTax =
      parsed.sales_tax != null && String(parsed.sales_tax).trim() !== ''
        ? Number(parsed.sales_tax)
        : undefined
    const cdcCharges =
      parsed.cdc_charges != null && String(parsed.cdc_charges).trim() !== ''
        ? Number(parsed.cdc_charges)
        : undefined

    if (!account) throw new Error('Account is required')
    if (!symbol) throw new Error('Symbol is required')
    if (side !== 'buy' && side !== 'sell') throw new Error('Side must be buy or sell')
    if (!Number.isInteger(shares) || shares <= 0) throw new Error('Shares must be a positive integer')

    const hasRate = rateSlip != null && Number.isFinite(rateSlip) && rateSlip > 0
    const hasCost = costPerShare != null && Number.isFinite(costPerShare) && costPerShare > 0
    if (!hasRate && !hasCost) {
      throw new Error('Provide either rate slip or cost per share')
    }
    if (hasRate && rateSlip! <= 0) throw new Error('Rate slip must be positive')
    if (hasCost && costPerShare! <= 0) throw new Error('Cost per share must be positive')

    return {
      account,
      symbol,
      side: side as 'buy' | 'sell',
      shares,
      ...(hasCost ? { cost_per_share: costPerShare } : {}),
      ...(hasRate ? { rate_slip: rateSlip } : {}),
      ...(commission != null && Number.isFinite(commission) ? { commission } : {}),
      ...(salesTax != null && Number.isFinite(salesTax) ? { sales_tax: salesTax } : {}),
      ...(cdcCharges != null && Number.isFinite(cdcCharges) ? { cdc_charges: cdcCharges } : {}),
    }
  })
  .handler(async ({ data }) => {
    const result = addTrade(data)
    if (result.ok && !hasStockSector(data.symbol)) {
      const { sector } = await fetchPsxQuote(data.symbol)
      if (sector) upsertStockSector(data.symbol, sector)
    }
    return result
  })

export const serverGetLatestPrices = createServerFn({ method: 'GET' }).handler(
  async () => getLatestPrices(),
)

export const serverGetPriceHistory = createServerFn({ method: 'GET' })
  .inputValidator((symbol: unknown) => String(symbol))
  .handler(async ({ data }) => getPriceHistory(data))

export type FetchResult = {
  symbol: string
  price: number | null
  stored: boolean
  error?: string
}

export const serverEnsureSectors = createServerFn({ method: 'GET' }).handler(
  async () => ensureMissingSectors(),
)

export const serverFetchAndStorePrices = createServerFn({ method: 'POST' }).handler(
  async (): Promise<FetchResult[]> => {
    const symbols = getAllSymbols()
    const fetched = await fetchAllPrices(symbols)
    const results: FetchResult[] = []
    for (const { symbol, price, sector, error } of fetched) {
      if (sector) upsertStockSector(symbol, sector)
      if (price !== null) {
        storeSnapshot(symbol, price)
        results.push({ symbol, price, stored: true })
      } else {
        results.push({ symbol, price: null, stored: false, error })
      }
    }
    await ensureMissingSectors()
    return results
  },
)

export const serverGetPortfolioHistory = createServerFn({ method: 'GET' }).handler(
  async () => getPortfolioValueHistory(),
)

export const serverGetDividends = createServerFn({ method: 'GET' })
  .inputValidator((account: unknown) => String(account))
  .handler(async ({ data }) => ({
    dividends: getDividends(data),
    summary: getDividendSummary(data),
  }))

export const serverGetAllDividendTotals = createServerFn({ method: 'GET' }).handler(
  async () => getAllDividendTotals(),
)

export const serverAddDividend = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => {
    const parsed = (input ?? {}) as Record<string, unknown>
    const account = String(parsed.account ?? '').trim().toLowerCase()
    const event_id = String(parsed.event_id ?? '').trim()
    const symbol = String(parsed.symbol ?? '').trim().toUpperCase()
    const security_name =
      parsed.security_name != null && String(parsed.security_name).trim() !== ''
        ? String(parsed.security_name).trim()
        : null
    const financial_year = String(parsed.financial_year ?? '').trim()
    const gross_amount = Number(parsed.gross_amount)
    const net_amount = Number(parsed.net_amount)
    const status = String(parsed.status ?? 'paid').trim()
    const payment_dateRaw = String(parsed.payment_date ?? '').trim()
    const payment_date =
      /^\d{4}-\d{2}-\d{2}$/.test(payment_dateRaw)
        ? payment_dateRaw
        : parsePaymentDate(payment_dateRaw) ?? ''

    if (!account) throw new Error('Account is required')
    if (!event_id) throw new Error('Event ID is required')
    if (!symbol) throw new Error('Symbol is required')
    if (!financial_year) throw new Error('Financial year is required')
    if (!Number.isFinite(gross_amount) || gross_amount <= 0) {
      throw new Error('Gross amount must be a positive number')
    }
    if (!Number.isFinite(net_amount) || net_amount <= 0) {
      throw new Error('Net amount must be a positive number')
    }
    if (!payment_date) throw new Error('Payment date is required (DD/MM/YYYY or YYYY-MM-DD)')

    const sharesRaw = parsed.shares
    const shares =
      sharesRaw != null && String(sharesRaw).trim() !== '' ? Number(sharesRaw) : null

    return {
      account,
      event_id,
      symbol,
      security_name,
      financial_year,
      gross_amount,
      net_amount,
      status,
      payment_date,
      ...(shares != null && Number.isFinite(shares) ? { shares } : {}),
    }
  })
  .handler(async ({ data }) => addDividend(data))

export const serverImportDividends = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => {
    const parsed = (input ?? {}) as { account?: unknown; text?: unknown }
    const account = String(parsed.account ?? '').trim().toLowerCase()
    const text = String(parsed.text ?? '').trim()
    if (!account) throw new Error('Account is required')
    if (!text) throw new Error('Paste text is required')
    return { account, text }
  })
  .handler(async ({ data }) => {
    const { rows, errors: parseErrors } = parseDividendPaste(data.text)
    if (rows.length === 0) {
      return {
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: parseErrors.length > 0 ? parseErrors : ['No valid rows to import'],
      }
    }
    const result = importDividends(data.account, rows)
    return {
      ...result,
      errors: [...parseErrors, ...result.errors],
    }
  })

export const serverDeleteDividend = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => {
    const parsed = (input ?? {}) as { id?: unknown; account?: unknown }
    const id = Number(parsed.id)
    const account = String(parsed.account ?? '').trim().toLowerCase()
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid dividend id')
    if (!account) throw new Error('Account is required')
    return { id, account }
  })
  .handler(async ({ data }) => {
    const ok = deleteDividend(data.id, data.account)
    if (!ok) throw new Error('Dividend not found')
    return { ok: true }
  })
