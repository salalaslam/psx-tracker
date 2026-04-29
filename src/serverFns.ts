import { createServerFn } from '@tanstack/react-start'
import {
  addTrade,
  createAccount,
  getAllAccounts,
  getAllSymbols,
  getHoldings,
  getLatestPrices,
  getPortfolioValueHistory,
  getPriceHistory,
  storeSnapshot,
} from './db.server'
import { fetchAllPrices } from './psx.server'

export const serverGetHoldings = createServerFn({ method: 'GET' })
  .inputValidator((account: unknown) => String(account))
  .handler(async ({ data }) => getHoldings(data))

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
    }

    const account = String(parsed.account ?? '').trim().toLowerCase()
    const symbol = String(parsed.symbol ?? '').trim().toUpperCase()
    const side = String(parsed.side ?? '').trim().toLowerCase()
    const shares = Number(parsed.shares)
    const costPerShare = Number(parsed.cost_per_share)

    if (!account) throw new Error('Account is required')
    if (!symbol) throw new Error('Symbol is required')
    if (side !== 'buy' && side !== 'sell') throw new Error('Side must be buy or sell')
    if (!Number.isInteger(shares) || shares <= 0) throw new Error('Shares must be a positive integer')
    if (!Number.isFinite(costPerShare) || costPerShare <= 0) {
      throw new Error('Cost per share must be a positive number')
    }

    return {
      account,
      symbol,
      side: side as 'buy' | 'sell',
      shares,
      cost_per_share: costPerShare,
    }
  })
  .handler(async ({ data }) => addTrade(data))

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

export const serverFetchAndStorePrices = createServerFn({ method: 'POST' }).handler(
  async (): Promise<FetchResult[]> => {
    const symbols = getAllSymbols()
    const fetched = await fetchAllPrices(symbols)
    const results: FetchResult[] = []
    for (const { symbol, price, error } of fetched) {
      if (price !== null) {
        storeSnapshot(symbol, price)
        results.push({ symbol, price, stored: true })
      } else {
        results.push({ symbol, price: null, stored: false, error })
      }
    }
    return results
  },
)

export const serverGetPortfolioHistory = createServerFn({ method: 'GET' }).handler(
  async () => getPortfolioValueHistory(),
)
