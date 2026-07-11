import { describe, expect, it } from 'vitest'
import {
  buildValueResearchReport,
  mergePortfolioHoldings,
  scoreCompanyScreen,
  type ResearchFundamentalsInput,
} from './valueResearch'

const fundamentals: ResearchFundamentalsInput = {
  symbol: 'QUALITY',
  name: 'Quality Limited',
  sector: 'FOOD',
  price: 100,
  priceAsOf: '2026-07-10',
  peRatio: 10,
  annualPeriods: ['2025', '2024', '2023', '2022'],
  annualMetrics: {
    'Profit after Taxation': [160, 140, 120, 100],
    EPS: [16, 14, 12, 10],
  },
  source: 'live',
}

describe('scoreCompanyScreen', () => {
  it('rewards durable profit, reasonable P/E, liquidity and a sector gap', () => {
    const score = scoreCompanyScreen(fundamentals, { kmi30: true, kse100: true }, 0)
    expect(score.quality).toBe(100)
    expect(score.valuation).toBe(85)
    expect(score.portfolioFit).toBe(100)
    expect(score.total).toBeGreaterThanOrEqual(90)
    expect(score.confidence).toBe('high')
    expect(score.profitableYears).toBe(4)
  })

  it('does not turn missing fundamentals into a zero quality score', () => {
    const score = scoreCompanyScreen(null, { kmi30: false, kse100: false }, 12)
    expect(score.quality).toBeNull()
    expect(score.valuation).toBeNull()
    expect(score.total).toBeNull()
    expect(score.confidence).toBe('low')
  })

  it('withholds the composite when valuation evidence is missing', () => {
    const score = scoreCompanyScreen(
      { ...fundamentals, peRatio: null },
      { kmi30: true, kse100: true },
      0,
    )
    expect(score.quality).toBe(100)
    expect(score.valuation).toBeNull()
    expect(score.total).toBeNull()
  })
})

describe('mergePortfolioHoldings', () => {
  it('merges the same symbol across accounts and preserves account shares', () => {
    const merged = mergePortfolioHoldings([
      {
        account: 'jane',
        symbol: 'OGDC',
        shares: 10,
        costAvg: 100,
        totalInvested: 1000,
        latestPrice: 120,
        latestFetchedAt: '2026-07-10',
        sector: 'ENERGY',
      },
      {
        account: 'john',
        symbol: 'ogdc',
        shares: 20,
        costAvg: 110,
        totalInvested: 2200,
        latestPrice: 120,
        latestFetchedAt: '2026-07-10',
        sector: 'ENERGY',
      },
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      symbol: 'OGDC',
      shares: 30,
      invested: 3200,
      currentValue: 3600,
      accountShares: { jane: 10, john: 20 },
    })
  })
})

describe('buildValueResearchReport', () => {
  it('keeps Shariah status separate from KMI30 liquidity membership', () => {
    const report = buildValueResearchReport({
      holdings: [
        {
          account: 'jane',
          symbol: 'GLAXO',
          shares: 10,
          costAvg: 100,
          totalInvested: 1000,
          latestPrice: 110,
          latestFetchedAt: '2026-07-10',
          sector: 'PHARMACEUTICALS',
        },
        {
          account: 'john',
          symbol: 'APL',
          shares: 5,
          costAvg: 100,
          totalInvested: 500,
          latestPrice: 90,
          latestFetchedAt: '2026-07-10',
          sector: 'OIL & GAS MARKETING COMPANIES',
        },
      ],
      listings: [
        {
          symbol: 'GLAXO',
          name: 'GlaxoSmithKline Pakistan Limited',
          sector: 'PHARMACEUTICALS',
          indices: ['ALLSHR', 'KMIALLSHR'],
          shares: 100,
          freeFloat: 20,
          board: 'main',
          counter: 'normal',
        },
        {
          symbol: 'APL',
          name: 'Attock Petroleum Limited',
          sector: 'OIL & GAS MARKETING COMPANIES',
          indices: ['ALLSHR'],
          shares: 100,
          freeFloat: 20,
          board: 'main',
          counter: 'normal',
        },
      ],
      listingSource: 'live',
      listingFetchedAt: '2026-07-11',
      fundamentals: {},
      dividendsBySymbol: {},
      generatedAt: '2026-07-11',
    })

    const glaxo = report.holdings.find(row => row.symbol === 'GLAXO')
    const apl = report.holdings.find(row => row.symbol === 'APL')
    expect(glaxo).toMatchObject({ shariahStatus: 'compliant', kmiAllShare: true, kmi30: false })
    expect(apl).toMatchObject({ shariahStatus: 'non_compliant', kmiAllShare: false })
    expect(report.summary.shariahNonCompliantCount).toBe(1)
  })

  it('uses a fetched quote consistently when the local holding price is missing', () => {
    const report = buildValueResearchReport({
      holdings: [
        {
          account: 'jane',
          symbol: 'UNKNOWN',
          shares: 10,
          costAvg: 100,
          totalInvested: 1000,
          latestPrice: null,
          latestFetchedAt: null,
          sector: 'CHEMICAL',
        },
      ],
      listings: [],
      listingSource: 'live',
      listingFetchedAt: '2026-07-11',
      fundamentals: {
        UNKNOWN: { ...fundamentals, symbol: 'UNKNOWN', price: 125, priceAsOf: '2026-07-10' },
      },
      dividendsBySymbol: {},
      generatedAt: '2026-07-11',
    })

    expect(report.holdings[0]).toMatchObject({
      latestPrice: 125,
      currentValue: 1250,
      gainLoss: 250,
      returnPct: 25,
      shariahStatus: 'unverified',
      screenLabel: 'Data needed',
      shariahReviewLevel: 'unverified',
    })
    expect(report.summary.currentValue).toBe(1250)
  })
})
