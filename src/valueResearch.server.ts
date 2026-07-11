import { getAllAccounts, getAllDividendTotals, getHoldings } from './db.server'
import {
  fetchPsxCompanyFundamentals,
  fetchPsxListings,
  type PsxCompanyFundamentalsResult,
} from './psxResearch.server'
import {
  buildValueResearchReport,
  type ResearchFundamentalsInput,
  type ResearchHoldingInput,
  type ValueResearchReport,
} from './valueResearch'

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  deadlineMs?: number,
): Promise<R[]> {
  const results = new Array<R | undefined>(items.length)
  let nextIndex = 0

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index])
    }
  }

  const allWorkers = Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  )
  if (deadlineMs === undefined) {
    await allWorkers
  } else {
    let deadline: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      allWorkers,
      new Promise<void>(resolve => {
        deadline = setTimeout(resolve, deadlineMs)
      }),
    ])
    if (deadline) clearTimeout(deadline)
  }
  return results.filter((result): result is R => result !== undefined)
}

function toFundamentalInput(result: PsxCompanyFundamentalsResult): ResearchFundamentalsInput {
  return {
    symbol: result.symbol,
    name: result.name,
    sector: result.sector,
    price: result.price,
    priceAsOf: result.priceAsOf,
    peRatio: result.peRatio,
    annualPeriods: result.annualPeriods,
    annualMetrics: result.annualMetrics,
    source: result.source,
  }
}

export async function getValueResearchReport(): Promise<ValueResearchReport> {
  const accounts = getAllAccounts()
  const holdings = accounts.flatMap(account => getHoldings(account))
  const holdingInputs: ResearchHoldingInput[] = holdings.map(holding => ({
    account: holding.account,
    symbol: holding.symbol,
    shares: holding.shares,
    costAvg: holding.cost_avg,
    totalInvested: holding.total_invested,
    latestPrice: holding.latest_price,
    latestFetchedAt: holding.latest_fetched_at,
    sector: holding.sector,
  }))

  const symbols = [...new Set(holdings.map(holding => holding.symbol.trim().toUpperCase()))]
  const [listingsResult, companyResults] = await Promise.all([
    fetchPsxListings(),
    mapWithConcurrency(symbols, 8, symbol => fetchPsxCompanyFundamentals(symbol), 18_000),
  ])
  const fundamentals = Object.fromEntries(
    companyResults.map(result => [result.symbol, toFundamentalInput(result)]),
  )

  const dividendTotals = getAllDividendTotals()
  const dividendsBySymbol = Object.fromEntries(
    Object.entries(dividendTotals.by_symbol).map(([symbol, totals]) => [
      symbol,
      { totalNet: totals.total_net, count: totals.count },
    ]),
  )

  return buildValueResearchReport({
    holdings: holdingInputs,
    listings: listingsResult.listings,
    listingSource: listingsResult.source,
    listingFetchedAt: listingsResult.fetchedAt,
    ...(listingsResult.error ? { listingError: listingsResult.error } : {}),
    fundamentals,
    dividendsBySymbol,
  })
}
