const PSX_BASE_URL = 'https://dps.psx.com.pk'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000

const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  Referer: `${PSX_BASE_URL}/`,
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
} as const

export type PsxBoard = 'main' | 'gem'
export type PsxCounter = 'normal' | 'non_compliant_segment'

export interface PsxListing {
  symbol: string
  name: string
  sector: string
  indices: string[]
  shares: number | null
  freeFloat: number | null
  board: PsxBoard
  counter: PsxCounter
}

export interface PsxListingsResult {
  listings: PsxListing[]
  memberships: {
    KMIALLSHR: string[]
    KMI30: string[]
  }
  source: 'live' | 'partial' | 'unavailable'
  fetchedAt: string
  error?: string
}

export interface PsxCompanyFundamentals {
  symbol: string
  name: string | null
  sector: string | null
  price: number | null
  priceAsOf: string | null
  peRatio: number | null
  annualPeriods: string[]
  annualMetrics: Record<string, Array<number | null>>
}

export interface PsxCompanyFundamentalsResult extends PsxCompanyFundamentals {
  source: 'live' | 'unavailable'
  fetchedAt: string
  error?: string
}

interface HtmlCell {
  attributes: string
  text: string
  kind: 'td' | 'th'
}

interface ElementContent {
  content: string
  end: number
}

interface ListingsCacheEntry {
  expiresAt: number
  value: PsxListingsResult
}

interface CompanyCacheEntry {
  expiresAt: number
  value: PsxCompanyFundamentalsResult
}

interface ListingsEndpoint {
  board: PsxBoard
  counter: PsxCounter
  pathCounter: 'nc' | 'dc'
}

interface EndpointResult {
  endpoint: ListingsEndpoint
  listings: PsxListing[]
  error?: string
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  copy: '©',
  emsp: ' ',
  ensp: ' ',
  gt: '>',
  hellip: '…',
  laquo: '«',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  middot: '·',
  nbsp: ' ',
  ndash: '–',
  quot: '"',
  raquo: '»',
  rdquo: '”',
  reg: '®',
  rsquo: '’',
  thinsp: ' ',
} as const

const LISTINGS_ENDPOINTS: readonly ListingsEndpoint[] = [
  { board: 'main', counter: 'normal', pathCounter: 'nc' },
  { board: 'main', counter: 'non_compliant_segment', pathCounter: 'dc' },
  { board: 'gem', counter: 'normal', pathCounter: 'nc' },
  { board: 'gem', counter: 'non_compliant_segment', pathCounter: 'dc' },
]

let listingsCache: ListingsCacheEntry | null = null
let listingsInFlight: Promise<PsxListingsResult> | null = null
const companyCache = new Map<string, CompanyCacheEntry>()
const companyInFlight = new Map<string, Promise<PsxCompanyFundamentalsResult>>()

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeHtmlEntitiesOnce(value: string): string {
  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/gi, (entity, body: string) => {
    if (body[0] !== '#') return NAMED_ENTITIES[body.toLowerCase()] ?? entity

    const isHex = body[1]?.toLowerCase() === 'x'
    const digits = body.slice(isHex ? 2 : 1)
    const codePoint = Number.parseInt(digits, isHex ? 16 : 10)
    if (
      !Number.isInteger(codePoint) ||
      codePoint <= 0 ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return '�'
    }

    return String.fromCodePoint(codePoint)
  })
}

function decodeHtmlEntities(value: string): string {
  let decoded = value
  for (let pass = 0; pass < 2; pass += 1) {
    const next = decodeHtmlEntitiesOnce(decoded)
    if (next === decoded) break
    decoded = next
  }
  return decoded
}

function textFromHtml(fragment: string): string {
  return decodeHtmlEntities(
    fragment
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/[\s\u00a0]+/g, ' ')
    .trim()
}

function getAttribute(attributes: string, name: string): string | null {
  const pattern = new RegExp(
    `(?:^|\\s)${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  )
  const match = attributes.match(pattern)
  return match ? decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? '') : null
}

function hasClass(attributes: string, className: string): boolean {
  return (getAttribute(attributes, 'class') ?? '').split(/\s+/).includes(className)
}

function parseCells(rowHtml: string): HtmlCell[] {
  const cells: HtmlCell[] = []
  const cellPattern = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi
  let match: RegExpExecArray | null

  while ((match = cellPattern.exec(rowHtml)) !== null) {
    cells.push({
      attributes: match[2],
      text: textFromHtml(match[3]),
      kind: match[1].toLowerCase() === 'th' ? 'th' : 'td',
    })
  }

  return cells
}

function parseWholeNumber(value: string): number | null {
  const normalized = value.replace(/[\s,]/g, '')
  if (!/^\d+$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function parseFinancialNumber(value: string): number | null {
  const normalized = value.replace(/[\u2212–—]/g, '-').trim()
  if (!normalized || /^(?:-|n\/?a|n\.a\.|nm|null)$/i.test(normalized)) return null

  const parenthesized = /^\s*\(.*\)\s*$/.test(normalized)
  // The PSX renders prices as `Rs.334.13`, without a separator between the
  // currency abbreviation and value. Remove that prefix before number parsing.
  const numericSource = normalized.replace(/\b(?:rs|pkr)\.?\s*/gi, '')
  const numericMatch = numericSource.match(/[+-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?![\d.])/)
  if (!numericMatch) return null

  const parsed = Number(numericMatch[0].replace(/,/g, ''))
  if (!Number.isFinite(parsed)) return null
  return parenthesized ? -Math.abs(parsed) : parsed
}

function readElementContent(html: string, tagName: string, contentStart: number): ElementContent | null {
  const escapedTag = escapeRegExp(tagName)
  const tagPattern = new RegExp(`<\\/?${escapedTag}\\b[^>]*>`, 'gi')
  tagPattern.lastIndex = contentStart
  let depth = 1
  let match: RegExpExecArray | null

  while ((match = tagPattern.exec(html)) !== null) {
    if (/^<\s*\//.test(match[0])) {
      depth -= 1
      if (depth === 0) {
        return { content: html.slice(contentStart, match.index), end: tagPattern.lastIndex }
      }
    } else if (!/\/\s*>$/.test(match[0])) {
      depth += 1
    }
  }

  return null
}

function findFirstElementContentByClass(html: string, className: string): string | null {
  const openingTagPattern = /<([a-z][\w:.-]*)\b([^>]*)>/gi
  let match: RegExpExecArray | null

  while ((match = openingTagPattern.exec(html)) !== null) {
    if (!hasClass(match[2], className)) continue
    return readElementContent(html, match[1], openingTagPattern.lastIndex)?.content ?? null
  }

  return null
}

function findAnnualTable(html: string): string | null {
  const openingTagPattern = /<([a-z][\w:.-]*)\b([^>]*)>/gi
  let match: RegExpExecArray | null

  while ((match = openingTagPattern.exec(html)) !== null) {
    if (getAttribute(match[2], 'data-name')?.toLowerCase() !== 'annual') continue
    const annualElement = readElementContent(html, match[1], openingTagPattern.lastIndex)
    if (!annualElement || !/<table\b/i.test(annualElement.content)) continue

    const tableOpeningPattern = /<table\b[^>]*>/i
    const tableOpening = tableOpeningPattern.exec(annualElement.content)
    if (!tableOpening) continue
    return (
      readElementContent(
        annualElement.content,
        'table',
        tableOpening.index + tableOpening[0].length,
      )?.content ?? null
    )
  }

  return null
}

function findLabeledStat(html: string, labelPattern: RegExp): string | null {
  const openingTagPattern = /<([a-z][\w:.-]*)\b([^>]*)>/gi
  let match: RegExpExecArray | null

  while ((match = openingTagPattern.exec(html)) !== null) {
    if (!hasClass(match[2], 'stats_label')) continue
    const labelElement = readElementContent(html, match[1], openingTagPattern.lastIndex)
    if (!labelElement || !labelPattern.test(textFromHtml(labelElement.content))) continue

    const followingMarkup = html.slice(labelElement.end, labelElement.end + 2_000)
    const value = findFirstElementContentByClass(followingMarkup, 'stats_value')
    return value === null ? null : textFromHtml(value)
  }

  return null
}

function emptyCompanyFundamentals(symbol: string): PsxCompanyFundamentals {
  return {
    symbol,
    name: null,
    sector: null,
    price: null,
    priceAsOf: null,
    peRatio: null,
    annualPeriods: [],
    annualMetrics: {},
  }
}

export function parsePsxListingsHtml(
  html: string,
  board: PsxBoard = 'main',
  counter: PsxCounter = 'normal',
): PsxListing[] {
  const listings: PsxListing[] = []
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const cells = parseCells(rowMatch[1])
    if (cells.length < 7 || cells[0].kind !== 'td') continue

    const symbol = cells[0].text.trim().toUpperCase()
    if (!symbol) continue

    // The PSX non-compliant-segment table inserts a regulations-reason column
    // between Sector and Clearing Type. Some historical fixtures omit it, so
    // use the shifted layout only when the eighth cell is actually present.
    const segmentColumnOffset = counter === 'non_compliant_segment' && cells.length >= 8 ? 1 : 0
    const indexCell = cells[6 + segmentColumnOffset]
    const indexAttribute = getAttribute(indexCell.attributes, 'data-search')
    const indexText = indexAttribute ?? indexCell.text
    const indices = [
      ...new Set(
        indexText
          .split(/[\s,|]+/)
          .map(index => index.trim().toUpperCase())
          .filter(Boolean),
      ),
    ]

    listings.push({
      symbol,
      name: cells[1].text,
      sector: cells[2].text,
      indices,
      shares: parseWholeNumber(cells[4 + segmentColumnOffset].text),
      freeFloat: parseWholeNumber(cells[5 + segmentColumnOffset].text),
      board,
      counter,
    })
  }

  return listings
}

export function parsePsxCompanyHtml(symbol: string, html: string): PsxCompanyFundamentals {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const fundamentals = emptyCompanyFundamentals(normalizedSymbol)
  const nameMarkup = findFirstElementContentByClass(html, 'quote__name')
  const sectorMarkup = findFirstElementContentByClass(html, 'quote__sector')
  const priceMarkup = findFirstElementContentByClass(html, 'quote__close')
  const dateMarkup = findFirstElementContentByClass(html, 'quote__date')
  const peText = findLabeledStat(html, /^P\/E\s+Ratio\s*\(TTM\)/i)

  fundamentals.name = nameMarkup === null ? null : textFromHtml(nameMarkup) || null
  fundamentals.sector = sectorMarkup === null ? null : textFromHtml(sectorMarkup) || null
  fundamentals.price = priceMarkup === null ? null : parseFinancialNumber(textFromHtml(priceMarkup))
  fundamentals.peRatio = peText === null ? null : parseFinancialNumber(peText)

  if (dateMarkup !== null) {
    const quoteDate = textFromHtml(dateMarkup)
      .replace(/^\^\s*/, '')
      .replace(/^As\s+of\s+/i, '')
      .trim()
    fundamentals.priceAsOf = quoteDate || null
  }

  const annualTable = findAnnualTable(html)
  if (annualTable === null) return fundamentals

  const rows: HtmlCell[][] = []
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowPattern.exec(annualTable)) !== null) {
    rows.push(parseCells(rowMatch[1]))
  }

  const periodRow = rows.find(
    row => row.length > 1 && row.some(cell => cell.kind === 'th') && row.slice(1).some(cell => cell.text),
  )
  fundamentals.annualPeriods = periodRow?.slice(1).map(cell => cell.text) ?? []

  for (const row of rows) {
    if (row.length < 2 || row[0].kind !== 'td') continue
    const metricName = row[0].text
    if (!metricName) continue

    const values = row.slice(1).map(cell => parseFinancialNumber(cell.text))
    const periodCount = fundamentals.annualPeriods.length
    fundamentals.annualMetrics[metricName] = periodCount
      ? [...values.slice(0, periodCount), ...Array(Math.max(0, periodCount - values.length)).fill(null)]
      : values
  }

  return fundamentals
}

function endpointUrl(endpoint: ListingsEndpoint): string {
  return `${PSX_BASE_URL}/listings-table/${endpoint.board}/${endpoint.pathCounter}`
}

async function fetchListingsEndpoint(endpoint: ListingsEndpoint): Promise<EndpointResult> {
  const url = endpointUrl(endpoint)
  try {
    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { endpoint, listings: [], error: `${url} returned HTTP ${response.status}` }
    }

    const listings = parsePsxListingsHtml(await response.text(), endpoint.board, endpoint.counter)
    if (!listings.length && endpoint.pathCounter !== 'dc') {
      return { endpoint, listings, error: `${url} returned no listing rows` }
    }
    return { endpoint, listings }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { endpoint, listings: [], error: `${url} could not be loaded: ${message}` }
  }
}

function listingPriority(listing: PsxListing): number {
  return (listing.counter === 'normal' ? 2 : 0) + (listing.board === 'main' ? 1 : 0)
}

function mergeListings(results: readonly EndpointResult[]): PsxListing[] {
  const bySymbol = new Map<string, PsxListing>()

  for (const result of results) {
    for (const listing of result.listings) {
      const existing = bySymbol.get(listing.symbol)
      if (!existing) {
        bySymbol.set(listing.symbol, listing)
        continue
      }

      const preferred = listingPriority(listing) > listingPriority(existing) ? listing : existing
      bySymbol.set(listing.symbol, {
        ...preferred,
        indices: [...new Set([...existing.indices, ...listing.indices])],
      })
    }
  }

  return [...bySymbol.values()].sort((left, right) => left.symbol.localeCompare(right.symbol))
}

async function loadPsxListings(): Promise<PsxListingsResult> {
  const endpointResults = await Promise.all(LISTINGS_ENDPOINTS.map(fetchListingsEndpoint))
  const listings = mergeListings(endpointResults)
  const errors = endpointResults.flatMap(result => (result.error ? [result.error] : []))
  const fetchedAt = new Date().toISOString()

  return {
    listings,
    memberships: {
      KMIALLSHR: listings
        .filter(listing => listing.indices.includes('KMIALLSHR'))
        .map(listing => listing.symbol),
      KMI30: listings.filter(listing => listing.indices.includes('KMI30')).map(listing => listing.symbol),
    },
    source: listings.length > 0 ? (errors.length > 0 ? 'partial' : 'live') : 'unavailable',
    fetchedAt,
    ...(errors.length ? { error: errors.join('; ') } : {}),
  }
}

export function fetchPsxListings(): Promise<PsxListingsResult> {
  const now = Date.now()
  if (listingsCache && listingsCache.expiresAt > now) return Promise.resolve(listingsCache.value)
  if (listingsInFlight) return listingsInFlight

  const request = loadPsxListings()
    .then(result => {
      if (result.source === 'live') {
        listingsCache = { value: result, expiresAt: Date.now() + CACHE_TTL_MS }
      }
      return result
    })
    .finally(() => {
      if (listingsInFlight === request) listingsInFlight = null
    })

  listingsInFlight = request
  return request
}

async function loadPsxCompanyFundamentals(
  symbol: string,
): Promise<PsxCompanyFundamentalsResult> {
  const fetchedAt = new Date().toISOString()
  const url = `${PSX_BASE_URL}/company/${encodeURIComponent(symbol)}`

  try {
    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      return {
        ...emptyCompanyFundamentals(symbol),
        source: 'unavailable',
        fetchedAt,
        error: `${url} returned HTTP ${response.status}`,
      }
    }

    const fundamentals = parsePsxCompanyHtml(symbol, await response.text())
    const hasCompanyData =
      fundamentals.name !== null ||
      fundamentals.price !== null ||
      fundamentals.annualPeriods.length > 0
    if (!hasCompanyData) {
      return {
        ...fundamentals,
        source: 'unavailable',
        fetchedAt,
        error: `${url} returned no company data`,
      }
    }

    return { ...fundamentals, source: 'live', fetchedAt }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ...emptyCompanyFundamentals(symbol),
      source: 'unavailable',
      fetchedAt,
      error: `${url} could not be loaded: ${message}`,
    }
  }
}

export function fetchPsxCompanyFundamentals(
  symbol: string,
): Promise<PsxCompanyFundamentalsResult> {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const now = Date.now()
  const cached = companyCache.get(normalizedSymbol)
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.value)

  const inFlight = companyInFlight.get(normalizedSymbol)
  if (inFlight) return inFlight

  const request = loadPsxCompanyFundamentals(normalizedSymbol)
    .then(result => {
      companyCache.set(normalizedSymbol, {
        value: result,
        expiresAt:
          Date.now() + (result.source === 'live' ? CACHE_TTL_MS : 5 * 60 * 1000),
      })
      return result
    })
    .finally(() => {
      if (companyInFlight.get(normalizedSymbol) === request) {
        companyInFlight.delete(normalizedSymbol)
      }
    })

  companyInFlight.set(normalizedSymbol, request)
  return request
}
