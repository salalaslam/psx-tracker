export type ShariahStatus = 'compliant' | 'non_compliant' | 'unverified'
export type ShariahReviewLevel =
  | 'standard'
  | 'watch'
  | 'exception'
  | 'non_compliant'
  | 'unverified'

export interface ResearchHoldingInput {
  account: string
  symbol: string
  shares: number
  costAvg: number
  totalInvested: number
  latestPrice: number | null
  latestFetchedAt: string | null
  sector: string | null
}

export interface ResearchListingInput {
  symbol: string
  name: string
  sector: string
  indices: string[]
  shares: number | null
  freeFloat: number | null
  board: 'main' | 'gem'
  counter: 'normal' | 'non_compliant_segment'
}

export interface ResearchFundamentalsInput {
  symbol: string
  name: string | null
  sector: string | null
  price: number | null
  priceAsOf: string | null
  peRatio: number | null
  annualPeriods: string[]
  annualMetrics: Record<string, Array<number | null>>
  source: 'live' | 'unavailable'
}

export interface DividendSymbolInput {
  totalNet: number
  count: number
}

export interface ScreenScore {
  total: number | null
  quality: number | null
  valuation: number | null
  liquidity: number
  portfolioFit: number
  confidence: 'high' | 'medium' | 'low'
  earningsCagrPct: number | null
  profitableYears: number | null
  yearsAnalysed: number
}

/** Lightweight P/E + KMI30 liquidity flags for the dashboard holdings table. */
export interface HoldingMarketMetrics {
  peRatio: number | null
  /** KMI30 = liquid (impact-cost-ranked) subset; otherwise illiquid for screening. */
  liquid: boolean
}

export interface HoldingResearchRow {
  symbol: string
  name: string
  sector: string
  accounts: string[]
  accountShares: Record<string, number>
  shares: number
  avgCost: number
  invested: number
  currentValue: number
  latestPrice: number | null
  priceAsOf: string | null
  gainLoss: number
  returnPct: number | null
  portfolioWeightPct: number
  sectorWeightPct: number
  dividendNet: number
  dividendEvents: number
  shariahStatus: ShariahStatus
  shariahReviewLevel: ShariahReviewLevel
  incomeRatioPct: number | null
  shariahNote: string | null
  kmiAllShare: boolean
  kmi30: boolean
  kse100: boolean
  exchangeRisk: boolean
  peRatio: number | null
  annualPeriods: string[]
  annualEps: Array<number | null>
  annualProfitAfterTax: Array<number | null>
  score: ScreenScore
  screenLabel: 'Shariah review' | 'Priority review' | 'Watch' | 'Caution' | 'Data needed'
  riskFlags: string[]
}

export interface SectorAllocation {
  sector: string
  value: number
  weightPct: number
  positions: number
}

export interface ShariahUniverseRow extends ResearchListingInput {
  held: boolean
  kmiAllShare: boolean
  kmi30: boolean
  kse100: boolean
  freeFloatPct: number | null
}

export interface PortfolioResearchSummary {
  holdingCount: number
  accountCount: number
  invested: number
  currentValue: number
  pricedCount: number
  shariahCompliantCount: number
  shariahNonCompliantCount: number
  shariahUnverifiedCount: number
  compliantValuePct: number
  exceptionValuePct: number
  kmi30ValuePct: number
  energyThemeValuePct: number
  topFiveValuePct: number
  sectorCount: number
}

export interface OpportunityResearchItem {
  symbol: string
  name: string
  sector: string
  stance: string
  asOf: string
  price: number | null
  peRatio: number | null
  earningsYieldPct: number | null
  shariahStatus: ShariahStatus
  kmiAllShare: boolean
  kmi30: boolean
  kse100: boolean
  screenRatios: string
  reasons: string[]
  risks: string[]
  nextChecks: string[]
  filingUrl: string
  companyUrl: string
}

export interface ExcludedResearchItem {
  symbol: string
  name: string
  reason: string
  asOf: string
}

export interface ValueResearchReport {
  generatedAt: string
  listingSource: 'live' | 'partial' | 'unavailable'
  listingFetchedAt: string
  listingError: string | null
  accountsAsOf: string
  kmi30EffectiveDate: string
  kmiAllEffectiveDate: string
  fundamentalsSourceNote: string
  summary: PortfolioResearchSummary
  sectors: SectorAllocation[]
  holdings: HoldingResearchRow[]
  universe: ShariahUniverseRow[]
  opportunities: OpportunityResearchItem[]
  excluded: ExcludedResearchItem[]
}

export const VALUE_RESEARCH_SOURCES = {
  psxListings: 'https://dps.psx.com.pk/listings',
  kmiAllNotice: 'https://www.psx.com.pk/psx/files/?file=277899-1.pdf',
  kmi30Notice: 'https://dps.psx.com.pk/download/attachment/277332-1.pdf',
  kmi30Brochure: 'https://www.psx.com.pk/psx/themes/psx/uploads/brochure-kmi-30-index.pdf',
  kmiAllBrochure:
    'https://www.psx.com.pk/psx/themes/psx/uploads/brochure-all-shares-Islamic-index-of-pakistan-03-06-26.pdf',
  alMeezanMethodology:
    'https://www.almeezangroup.com/investor-education/shariah-methodology/',
  methodologyRevision: 'https://www.psx.com.pk/psx/files?file=271129-1.pdf',
  berkshireOwnerManual: 'https://www.berkshirehathaway.com/ownman.pdf',
  gisAuctionResults: 'https://dps.psx.com.pk/gis-auction-results',
  pbsJuneCpi: 'https://www.pbs.gov.pk/wp-content/uploads/2020/07/Press-Release-June-2026.pdf',
} as const

interface HoldingShariahEvidence {
  finalStatus: Exclude<ShariahStatus, 'unverified'>
  reviewLevel: ShariahReviewLevel
  incomeRatioPct: number | null
  note: string | null
}

const standardEvidence = (incomeRatioPct: number): HoldingShariahEvidence => ({
  finalStatus: 'compliant',
  reviewLevel: 'standard',
  incomeRatioPct,
  note: null,
})

/** Point-in-time evidence from PSX/N-659, based on accounts to 31 December 2025. */
export const HOLDING_SHARIAH_EVIDENCE: Readonly<Record<string, HoldingShariahEvidence>> = {
  ACPL: standardEvidence(0.06),
  AGP: standardEvidence(0.19),
  APL: {
    finalStatus: 'non_compliant',
    reviewLevel: 'non_compliant',
    incomeRatioPct: 1.18,
    note: 'Non-compliant investments were 35.90% of assets, above the 33% limit. New buying should remain blocked pending qualified Shariah guidance.',
  },
  DCR: standardEvidence(0),
  DGKC: standardEvidence(3.36),
  EFERT: standardEvidence(0.4),
  ENGROH: {
    finalStatus: 'compliant',
    reviewLevel: 'exception',
    incomeRatioPct: 1.3,
    note: 'PSX records a merger-related exception; the relevant ratios were compliant on March 2025 financials.',
  },
  FATIMA: standardEvidence(0.93),
  FCCL: standardEvidence(0.57),
  FFC: {
    finalStatus: 'compliant',
    reviewLevel: 'watch',
    incomeRatioPct: 4.97,
    note: 'Close to current screens: non-compliant income was 4.97% versus the 5% limit and non-compliant investments were 30.30% versus 33%.',
  },
  FFL: standardEvidence(1.44),
  GHNI: standardEvidence(0.01),
  GLAXO: standardEvidence(0.76),
  HUBC: {
    finalStatus: 'compliant',
    reviewLevel: 'exception',
    incomeRatioPct: 7.16,
    note: 'Compliant by documented circular-debt exception; non-compliant investments (42.35%) and income (7.16%) exceed standard screens.',
  },
  IMAGE: standardEvidence(0),
  LUCK: standardEvidence(0.27),
  MARI: standardEvidence(0),
  MLCF: standardEvidence(0.46),
  MTL: standardEvidence(0.07),
  NML: standardEvidence(1.92),
  OGDC: {
    finalStatus: 'compliant',
    reviewLevel: 'exception',
    incomeRatioPct: 6.62,
    note: 'Compliant by documented circular-debt/improving-ratio exception; non-compliant income was 6.62%.',
  },
  PAEL: standardEvidence(0.03),
  POWER: standardEvidence(0),
  PPL: {
    finalStatus: 'compliant',
    reviewLevel: 'exception',
    incomeRatioPct: 2.81,
    note: 'Compliant with an AAOIFI Standard No. 59 relaxation over the illiquid-assets and/or net-liquid-assets test.',
  },
  PSO: standardEvidence(0.37),
  SAZEW: standardEvidence(0),
  SEARL: standardEvidence(0.89),
  SNGP: {
    finalStatus: 'compliant',
    reviewLevel: 'exception',
    incomeRatioPct: 1.23,
    note: 'Compliant with an AAOIFI Standard No. 59 relaxation over the illiquid-assets and/or net-liquid-assets test.',
  },
  SSGC: {
    finalStatus: 'compliant',
    reviewLevel: 'exception',
    incomeRatioPct: 1.25,
    note: 'Compliant with an AAOIFI Standard No. 59 relaxation over the illiquid-assets and/or net-liquid-assets test.',
  },
  SYS: standardEvidence(0.09),
  WAFI: standardEvidence(0.28),
}

interface CuratedOpportunity extends Omit<OpportunityResearchItem, 'shariahStatus' | 'kmiAllShare' | 'kmi30' | 'kse100'> {}

const CURATED_OPPORTUNITIES: readonly CuratedOpportunity[] = [
  {
    symbol: 'MEBL',
    name: 'Meezan Bank Limited',
    sector: 'COMMERCIAL BANKS',
    stance: 'Franchise study',
    asOf: '2026-07-10',
    price: 557.7,
    peRatio: 11.12,
    earningsYieldPct: 8.99,
    screenRatios: 'Shariah-compliant Islamic financial institution',
    reasons: [
      'Adds a currently absent risk driver: Islamic banking rather than energy, fertilizer, auto or cement.',
      'Q1 2026 filing reported 34% ROE, capital adequacy above 19%, 2.0% NPFs and 151% coverage.',
    ],
    risks: [
      'Earnings are rate-cycle sensitive and the balance sheet has material sovereign-investment exposure.',
      'The snapshot earnings yield is below the latest one-year GIS hurdle; this is not a margin-of-safety conclusion.',
    ],
    nextChecks: ['Normalize earnings across a rate cycle', 'Stress CAR, asset quality, taxation and sovereign concentration'],
    filingUrl: 'https://dps.psx.com.pk/download/document/275643.pdf',
    companyUrl: 'https://dps.psx.com.pk/company/MEBL',
  },
  {
    symbol: 'COLG',
    name: 'Colgate-Palmolive (Pakistan) Limited',
    sector: 'FOOD & PERSONAL CARE PRODUCTS',
    stance: 'Quality watch',
    asOf: '2026-07-10',
    price: 1255.96,
    peRatio: 17.15,
    earningsYieldPct: 5.83,
    screenRatios: 'Debt 1.87% · NC investments 31.22% · NC income 0.19%',
    reasons: [
      'Brand, distribution and recurring household demand fit a classic durable-business research case.',
      'Adds consumer exposure to a portfolio where food and personal care is below 1%.',
    ],
    risks: [
      'Only a 1.78 percentage-point buffer remains below the 33% non-compliant-investment screen.',
      'Low free float and thin daily trading can make the quoted price a poor execution reference.',
    ],
    nextChecks: ['Verify pricing power and real volume growth', 'Build a normalized owner-earnings valuation before entry'],
    filingUrl: 'https://dps.psx.com.pk/download/document/276247.pdf',
    companyUrl: 'https://dps.psx.com.pk/company/COLG',
  },
  {
    symbol: 'TGL',
    name: 'Tariq Glass Industries Limited',
    sector: 'GLASS & CERAMICS',
    stance: 'Normalized earnings study',
    asOf: '2026-07-10',
    price: 202,
    peRatio: 8.25,
    earningsYieldPct: 12.12,
    screenRatios: 'Debt 2.75% · NC investments 0.70% · NC income 0.27%',
    reasons: [
      'Adds a new manufacturing exposure and passes the current Shariah screen with wide ratio buffers.',
      'The headline earnings yield clears the latest one-year GIS anchor before an equity risk premium.',
    ],
    risks: [
      'Nine-month FY2026 sales and profit declined; low P/E may reflect peak or falling earnings.',
      'Energy cost, replacement capex and furnace campaign closures can make reported profit unlike owner earnings.',
    ],
    nextChecks: ['Estimate maintenance and furnace replacement capex', 'Value mid-cycle earnings, not the latest P/E alone'],
    filingUrl: 'https://dps.psx.com.pk/download/document/275857.pdf',
    companyUrl: 'https://dps.psx.com.pk/company/TGL',
  },
  {
    symbol: 'RMPL',
    name: 'Rafhan Maize Products Company Limited',
    sector: 'FOOD & PERSONAL CARE PRODUCTS',
    stance: 'Quality / liquidity watch',
    asOf: '2026-07-10',
    price: 9481,
    peRatio: 13.24,
    earningsYieldPct: 7.55,
    screenRatios: 'Debt 1.44% · NC investments 14.19% · NC income 1.07%',
    reasons: [
      'Industrial-food ingredients offer a differentiated, repeat-demand niche with conservative reported debt.',
      'Consumer and industrial demand diversify the portfolio away from its largest policy-linked blocks.',
    ],
    risks: [
      'Extremely low trading volume makes position sizing and exit assumptions critical.',
      'Imports, crop inputs and regional trade disruption can pressure margins and demand.',
    ],
    nextChecks: ['Use a strict liquidity budget and limit order assumption', 'Study ten-year margins, volumes and reinvestment'],
    filingUrl: 'https://dps.psx.com.pk/download/document/276476.pdf',
    companyUrl: 'https://dps.psx.com.pk/company/RMPL',
  },
  {
    symbol: 'FCEPL',
    name: 'FrieslandCampina Engro Pakistan Limited',
    sector: 'FOOD & PERSONAL CARE PRODUCTS',
    stance: 'Growth at a price',
    asOf: '2026-07-10',
    price: null,
    peRatio: 28.64,
    earningsYieldPct: 3.49,
    screenRatios: 'Debt 5.92% · NC investments 0.37% · NC income 0.11%',
    reasons: [
      'Dairy formalization and brand distribution offer a long-run category-growth thesis.',
      'Recent operating-profit growth was stronger than sales, making margin durability worth studying.',
    ],
    risks: [
      'The valuation snapshot offers little obvious margin of safety versus current local return hurdles.',
      'Raw milk, sales tax, cold-chain execution and structurally thin margins can absorb growth.',
    ],
    nextChecks: ['Wait for a price that compensates for execution risk', 'Separate one-off margin recovery from durable unit economics'],
    filingUrl: 'https://dps.psx.com.pk/download/document/276780.pdf',
    companyUrl: 'https://dps.psx.com.pk/company/FCEPL',
  },
  {
    symbol: 'DOL',
    name: 'Descon Oxychem Limited',
    sector: 'CHEMICAL',
    stance: 'Turnaround monitor',
    asOf: '2026-07-10',
    price: null,
    peRatio: 15.4,
    earningsYieldPct: 6.49,
    screenRatios: 'Debt 18.55% · NC investments 15.95% · NC income 0.42%',
    reasons: [
      'Creates a new chemicals exposure and the solar project may structurally reduce power cost.',
      'Current Shariah ratios have meaningful buffers versus the published screens.',
    ],
    risks: [
      'Nine-month FY2026 profit fell sharply, so recent annual growth is not a dependable run rate.',
      'Commodity pricing, imported inputs and plant economics make owner earnings volatile.',
    ],
    nextChecks: ['Require evidence that earnings have stabilized', 'Model power savings, FX sensitivity and maintenance capex'],
    filingUrl: 'https://dps.psx.com.pk/download/document/275729.pdf',
    companyUrl: 'https://dps.psx.com.pk/company/DOL',
  },
]

const EXCLUDED_RESEARCH: readonly ExcludedResearchItem[] = [
  {
    symbol: 'PABC',
    name: 'Pakistan Aluminium Beverage Cans Limited',
    reason: 'Excluded by the current Shariah gate: non-compliant investments were 52.84% and non-compliant income was 5.57%.',
    asOf: 'Accounts to 2025-12-31',
  },
]

const ENERGY_SECTORS = new Set([
  'OIL & GAS EXPLORATION COMPANIES',
  'OIL & GAS MARKETING COMPANIES',
  'POWER GENERATION & DISTRIBUTION',
])

/** PSX/N-610 constituents, effective 25 May 2026. Used only when live membership is unavailable. */
export const CURRENT_KMI30_SYMBOLS = new Set([
  'AIRLINK',
  'ATRL',
  'CPHL',
  'DGKC',
  'EFERT',
  'ENGROH',
  'FCCL',
  'FFC',
  'FFL',
  'GAL',
  'GHNI',
  'HCAR',
  'HUBC',
  'LUCK',
  'MARI',
  'MEBL',
  'MLCF',
  'NML',
  'NRL',
  'OGDC',
  'PAEL',
  'PPL',
  'PRL',
  'PSO',
  'SAZEW',
  'SEARL',
  'SNGP',
  'SSGC',
  'SYS',
  'TREET',
])

const CYCLICAL_SECTORS = new Set([
  ...ENERGY_SECTORS,
  'AUTOMOBILE ASSEMBLER',
  'CEMENT',
  'FERTILIZER',
  'TEXTILE COMPOSITE',
  'TEXTILE SPINNING',
])

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function metricValues(
  metrics: Record<string, Array<number | null>>,
  candidates: string[],
): Array<number | null> {
  const entries = Object.entries(metrics)
  for (const candidate of candidates) {
    const exact = metrics[candidate]
    if (exact) return exact
    const match = entries.find(([key]) => key.toLowerCase().includes(candidate.toLowerCase()))
    if (match) return match[1]
  }
  return []
}

function valuationScore(peRatio: number | null): number | null {
  if (peRatio === null || !Number.isFinite(peRatio) || peRatio <= 0) return null
  if (peRatio <= 8) return 100
  if (peRatio <= 12) return 85
  if (peRatio <= 16) return 70
  if (peRatio <= 20) return 55
  if (peRatio <= 25) return 35
  if (peRatio <= 35) return 15
  return 5
}

function trendScore(latest: number, oldest: number): number {
  if (latest <= 0 || oldest <= 0) return 0
  const ratio = latest / oldest
  if (ratio >= 1.25) return 1
  if (ratio >= 1) return 0.8
  if (ratio >= 0.75) return 0.55
  return 0.25
}

export function scoreCompanyScreen(
  fundamentals: ResearchFundamentalsInput | null,
  membership: { kmi30: boolean; kse100: boolean },
  sectorWeightPct: number,
): ScreenScore {
  const metrics = fundamentals?.annualMetrics ?? {}
  const profits = metricValues(metrics, ['Profit after Taxation', 'Profit after Tax'])
  const eps = metricValues(metrics, ['EPS'])
  // Per-share progress is the owner-oriented signal; PAT is only a fallback
  // when the PSX summary does not expose an EPS series.
  const qualitySeries = eps.length > 0 ? eps : profits
  const available = qualitySeries.filter((value): value is number => value !== null && Number.isFinite(value))
  const positiveCount = available.filter(value => value > 0).length
  let quality: number | null = null
  let cagr: number | null = null

  if (available.length >= 2) {
    const latest = available[0]
    const oldest = available[available.length - 1]
    const chronological = [...available].reverse()
    const increases = chronological.slice(1).filter((value, index) => value >= chronological[index]).length
    const consistency = increases / Math.max(1, chronological.length - 1)
    const positivity = positiveCount / available.length
    quality = Math.round(positivity * 55 + trendScore(latest, oldest) * 30 + consistency * 15)
    if (latest > 0 && oldest > 0) {
      cagr = (latest / oldest) ** (1 / (available.length - 1)) - 1
    }
  } else if (available.length === 1) {
    quality = available[0] > 0 ? 55 : 0
  }

  const valuation = valuationScore(fundamentals?.peRatio ?? null)
  const liquidity = membership.kmi30 ? 100 : membership.kse100 ? 70 : 35
  const portfolioFit =
    sectorWeightPct === 0 ? 100 : sectorWeightPct <= 3 ? 80 : sectorWeightPct <= 7.5 ? 55 : sectorWeightPct <= 12 ? 25 : 5

  let total: number | null = null
  if (quality !== null && valuation !== null) {
    const weighted: Array<[number, number]> = [
      [quality, 45],
      [valuation, 25],
      [liquidity, 15],
      [portfolioFit, 15],
    ]
    const maxWeight = weighted.reduce((sum, [, weight]) => sum + weight, 0)
    total = Math.round(weighted.reduce((sum, [score, weight]) => sum + score * weight, 0) / maxWeight)
  }

  const confidence =
    quality !== null && valuation !== null && available.length >= 4
      ? 'high'
      : quality !== null && available.length >= 2
        ? 'medium'
        : 'low'

  return {
    total,
    quality,
    valuation,
    liquidity,
    portfolioFit,
    confidence,
    earningsCagrPct: cagr === null ? null : round(cagr * 100),
    profitableYears: available.length > 0 ? positiveCount : null,
    yearsAnalysed: available.length,
  }
}

export function mergePortfolioHoldings(holdings: ResearchHoldingInput[]): Array<{
  symbol: string
  accounts: string[]
  accountShares: Record<string, number>
  shares: number
  invested: number
  avgCost: number
  currentValue: number
  latestPrice: number | null
  latestFetchedAt: string | null
  sector: string
}> {
  const grouped = new Map<
    string,
    {
      symbol: string
      accounts: Set<string>
      accountShares: Record<string, number>
      shares: number
      invested: number
      latestPrice: number | null
      latestFetchedAt: string | null
      sector: string
    }
  >()

  for (const holding of holdings) {
    const symbol = holding.symbol.trim().toUpperCase()
    const existing = grouped.get(symbol)
    if (existing) {
      existing.accounts.add(holding.account)
      existing.accountShares[holding.account] =
        (existing.accountShares[holding.account] ?? 0) + holding.shares
      existing.shares += holding.shares
      existing.invested += holding.totalInvested
      if (holding.latestPrice !== null) existing.latestPrice = holding.latestPrice
      if (
        holding.latestFetchedAt &&
        (!existing.latestFetchedAt || holding.latestFetchedAt > existing.latestFetchedAt)
      ) {
        existing.latestFetchedAt = holding.latestFetchedAt
      }
      if (existing.sector === 'UNCLASSIFIED' && holding.sector) existing.sector = holding.sector
      continue
    }

    grouped.set(symbol, {
      symbol,
      accounts: new Set([holding.account]),
      accountShares: { [holding.account]: holding.shares },
      shares: holding.shares,
      invested: holding.totalInvested,
      latestPrice: holding.latestPrice,
      latestFetchedAt: holding.latestFetchedAt,
      sector: holding.sector ?? 'UNCLASSIFIED',
    })
  }

  return [...grouped.values()].map(group => ({
    symbol: group.symbol,
    accounts: [...group.accounts].sort(),
    accountShares: group.accountShares,
    shares: group.shares,
    invested: group.invested,
    avgCost: group.shares > 0 ? group.invested / group.shares : 0,
    currentValue:
      group.latestPrice !== null ? group.latestPrice * group.shares : group.invested,
    latestPrice: group.latestPrice,
    latestFetchedAt: group.latestFetchedAt,
    sector: group.sector,
  }))
}

function screenLabel(
  status: ShariahStatus,
  score: ScreenScore,
): HoldingResearchRow['screenLabel'] {
  if (status === 'non_compliant') return 'Shariah review'
  if (status === 'unverified') return 'Data needed'
  if (score.total === null) return 'Data needed'
  if (score.total >= 75 && score.valuation !== null && score.valuation >= 55) {
    return 'Priority review'
  }
  if (score.total >= 60) return 'Watch'
  return 'Caution'
}

export function buildValueResearchReport(input: {
  holdings: ResearchHoldingInput[]
  listings: ResearchListingInput[]
  listingSource: 'live' | 'partial' | 'unavailable'
  listingFetchedAt: string
  listingError?: string
  fundamentals: Record<string, ResearchFundamentalsInput>
  dividendsBySymbol: Record<string, DividendSymbolInput>
  generatedAt?: string
}): ValueResearchReport {
  const merged = mergePortfolioHoldings(input.holdings)
  // Use the standardized PSX quote only when the local portfolio has no stored
  // quote. Keep price, value, allocation and return on the same price basis.
  const grouped = merged.map(group => {
    const fundamentals = input.fundamentals[group.symbol]
    const effectivePrice = group.latestPrice ?? fundamentals?.price ?? null
    return {
      ...group,
      latestPrice: effectivePrice,
      latestFetchedAt:
        group.latestFetchedAt ?? (effectivePrice !== null ? fundamentals?.priceAsOf ?? null : null),
      currentValue: effectivePrice !== null ? effectivePrice * group.shares : group.invested,
    }
  })
  const listingMap = new Map(input.listings.map(listing => [listing.symbol, listing]))
  const currentTotal = grouped.reduce((sum, row) => sum + row.currentValue, 0)
  const investedTotal = grouped.reduce((sum, row) => sum + row.invested, 0)

  const sectorMap = new Map<string, { value: number; positions: number }>()
  for (const row of grouped) {
    const current = sectorMap.get(row.sector) ?? { value: 0, positions: 0 }
    current.value += row.currentValue
    current.positions += 1
    sectorMap.set(row.sector, current)
  }
  const sectors: SectorAllocation[] = [...sectorMap.entries()]
    .map(([sector, values]) => ({
      sector,
      value: values.value,
      positions: values.positions,
      weightPct: currentTotal > 0 ? round((values.value / currentTotal) * 100) : 0,
    }))
    .sort((left, right) => right.value - left.value)
  const sectorWeights = new Map(sectors.map(sector => [sector.sector, sector.weightPct]))

  const rows: HoldingResearchRow[] = grouped.map(group => {
    const listing = listingMap.get(group.symbol)
    const evidence = HOLDING_SHARIAH_EVIDENCE[group.symbol]
    const kmiAllShare = listing?.indices.includes('KMIALLSHR') ?? evidence?.finalStatus === 'compliant'
    const kmi30 = listing?.indices.includes('KMI30') ?? CURRENT_KMI30_SYMBOLS.has(group.symbol)
    const kse100 = listing?.indices.includes('KSE100') ?? false
    const liveStatus: ShariahStatus = listing
      ? kmiAllShare || kmi30
        ? 'compliant'
        : 'non_compliant'
      : 'unverified'
    const shariahStatus: ShariahStatus =
      input.listingSource !== 'unavailable' && listing
        ? liveStatus
        : evidence?.finalStatus ?? 'unverified'
    const shariahReviewLevel: ShariahReviewLevel =
      shariahStatus === 'non_compliant'
        ? 'non_compliant'
        : shariahStatus === 'unverified'
          ? 'unverified'
          : evidence?.reviewLevel ?? 'standard'
    const fundamentals = input.fundamentals[group.symbol] ?? null
    const sectorWeightPct = sectorWeights.get(group.sector) ?? 0
    const score = scoreCompanyScreen(fundamentals, { kmi30, kse100 }, sectorWeightPct)
    const gainLoss = group.currentValue - group.invested
    const dividend = input.dividendsBySymbol[group.symbol]
    const riskFlags: string[] = []
    const portfolioWeightPct = currentTotal > 0 ? (group.currentValue / currentTotal) * 100 : 0

    if (shariahStatus === 'non_compliant') riskFlags.push('Fails current Shariah screen')
    if (shariahReviewLevel === 'exception') riskFlags.push('Compliance relies on exception / relaxation')
    if (shariahStatus === 'compliant' && shariahReviewLevel === 'watch') {
      riskFlags.push('Close to a Shariah threshold')
    }
    if (portfolioWeightPct >= 8) riskFlags.push('Large single-company weight')
    if (sectorWeightPct >= 20) riskFlags.push('Concentrated sector')
    if (CYCLICAL_SECTORS.has(group.sector)) riskFlags.push('Cyclical or policy-linked earnings')
    if (!fundamentals || fundamentals.source === 'unavailable') riskFlags.push('Fundamental summary unavailable')
    if (listing?.counter === 'non_compliant_segment') riskFlags.push('PSX regulatory / winding-up segment')

    const annualEps = fundamentals ? metricValues(fundamentals.annualMetrics, ['EPS']) : []
    const annualProfitAfterTax = fundamentals
      ? metricValues(fundamentals.annualMetrics, ['Profit after Taxation', 'Profit after Tax'])
      : []

    return {
      symbol: group.symbol,
      name: listing?.name ?? fundamentals?.name ?? group.symbol,
      sector: listing?.sector || group.sector,
      accounts: group.accounts,
      accountShares: group.accountShares,
      shares: group.shares,
      avgCost: group.avgCost,
      invested: group.invested,
      currentValue: group.currentValue,
      latestPrice: group.latestPrice ?? fundamentals?.price ?? null,
      priceAsOf: group.latestFetchedAt ?? fundamentals?.priceAsOf ?? null,
      gainLoss,
      returnPct: group.invested > 0 ? round((gainLoss / group.invested) * 100) : null,
      portfolioWeightPct: round(portfolioWeightPct),
      sectorWeightPct,
      dividendNet: dividend?.totalNet ?? 0,
      dividendEvents: dividend?.count ?? 0,
      shariahStatus,
      shariahReviewLevel,
      incomeRatioPct: evidence?.incomeRatioPct ?? null,
      shariahNote: evidence?.note ?? null,
      kmiAllShare,
      kmi30,
      kse100,
      exchangeRisk: listing?.counter === 'non_compliant_segment',
      peRatio: fundamentals?.peRatio ?? null,
      annualPeriods: fundamentals?.annualPeriods ?? [],
      annualEps,
      annualProfitAfterTax,
      score,
      screenLabel: screenLabel(shariahStatus, score),
      riskFlags,
    }
  }).sort((left, right) => right.currentValue - left.currentValue)

  const topFiveValue = rows.slice(0, 5).reduce((sum, row) => sum + row.currentValue, 0)
  const compliantValue = rows
    .filter(row => row.shariahStatus === 'compliant')
    .reduce((sum, row) => sum + row.currentValue, 0)
  const exceptionValue = rows
    .filter(row => row.shariahReviewLevel === 'exception')
    .reduce((sum, row) => sum + row.currentValue, 0)
  const kmi30Value = rows.filter(row => row.kmi30).reduce((sum, row) => sum + row.currentValue, 0)
  const energyValue = rows
    .filter(row => ENERGY_SECTORS.has(row.sector))
    .reduce((sum, row) => sum + row.currentValue, 0)

  const heldSymbols = new Set(rows.map(row => row.symbol))
  const universe = input.listings
    .filter(listing => listing.indices.includes('KMIALLSHR') || listing.indices.includes('KMI30'))
    .map<ShariahUniverseRow>(listing => ({
      ...listing,
      held: heldSymbols.has(listing.symbol),
      kmiAllShare: listing.indices.includes('KMIALLSHR'),
      kmi30: listing.indices.includes('KMI30'),
      kse100: listing.indices.includes('KSE100'),
      freeFloatPct:
        listing.shares && listing.freeFloat !== null
          ? round((listing.freeFloat / listing.shares) * 100)
          : null,
    }))
    .sort((left, right) => Number(right.kmi30) - Number(left.kmi30) || left.symbol.localeCompare(right.symbol))

  const opportunities = CURATED_OPPORTUNITIES.map<OpportunityResearchItem>(opportunity => {
    const listing = listingMap.get(opportunity.symbol)
    const liveCompliant = listing?.indices.includes('KMIALLSHR') || listing?.indices.includes('KMI30')
    return {
      ...opportunity,
      shariahStatus:
        input.listingSource !== 'unavailable' && listing
          ? liveCompliant
            ? 'compliant'
            : 'non_compliant'
          : 'unverified',
      kmiAllShare: listing?.indices.includes('KMIALLSHR') ?? false,
      kmi30: listing?.indices.includes('KMI30') ?? false,
      kse100: listing?.indices.includes('KSE100') ?? false,
    }
  })

  const accounts = new Set(input.holdings.map(holding => holding.account))
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    listingSource: input.listingSource,
    listingFetchedAt: input.listingFetchedAt,
    listingError: input.listingError ?? null,
    accountsAsOf: '2025-12-31',
    kmi30EffectiveDate: '2026-05-25',
    kmiAllEffectiveDate: '2026-06-05',
    fundamentalsSourceNote:
      'PSX company-page summaries are a screening aid and may differ from issuer filings. Scores omit moat, management, cash flow, exact leverage and intrinsic value until those are reviewed.',
    summary: {
      holdingCount: rows.length,
      accountCount: accounts.size,
      invested: investedTotal,
      currentValue: currentTotal,
      pricedCount: grouped.filter(group => group.latestPrice !== null).length,
      shariahCompliantCount: rows.filter(row => row.shariahStatus === 'compliant').length,
      shariahNonCompliantCount: rows.filter(row => row.shariahStatus === 'non_compliant').length,
      shariahUnverifiedCount: rows.filter(row => row.shariahStatus === 'unverified').length,
      compliantValuePct: currentTotal > 0 ? round((compliantValue / currentTotal) * 100) : 0,
      exceptionValuePct: currentTotal > 0 ? round((exceptionValue / currentTotal) * 100) : 0,
      kmi30ValuePct: currentTotal > 0 ? round((kmi30Value / currentTotal) * 100) : 0,
      energyThemeValuePct: currentTotal > 0 ? round((energyValue / currentTotal) * 100) : 0,
      topFiveValuePct: currentTotal > 0 ? round((topFiveValue / currentTotal) * 100) : 0,
      sectorCount: sectors.length,
    },
    sectors,
    holdings: rows,
    universe,
    opportunities,
    excluded: [...EXCLUDED_RESEARCH],
  }
}
