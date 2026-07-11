import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parsePsxCompanyHtml, parsePsxListingsHtml } from './psxResearch.server'

const listingFixture = `
  <table><thead><tr><th>Symbol</th><th>Name</th><th>Sector</th><th>Clearing</th><th>Shares</th><th>Free Float</th><th>Listed In</th></tr></thead>
  <tbody>
    <tr>
      <td><a><strong>food</strong></a></td>
      <td>Pak &amp; Sons &#x2013; Foods</td>
      <td>FOOD&nbsp;&amp; PERSONAL CARE</td><td>NC</td>
      <td>1,234,567</td><td>234,567</td>
      <td data-search="ALLSHR,KMIALLSHR,KMI30"><div class="tag">ALLSHR</div></td>
    </tr>
    <tr>
      <td><strong>TEXT</strong></td><td>Textile &#39;Works&#39;</td><td>TEXTILE</td><td>NC</td>
      <td>900</td><td>-</td><td><span>ALLSHR</span> <span>KMIALLSHR</span></td>
    </tr>
  </tbody></table>
`

const companyFixture = `
  <section>
    <div class="quote__name">Example &amp; Company Limited</div>
    <div class="quote__sector"><span>TECHNOLOGY&nbsp;&amp; COMMUNICATION</span></div>
    <div class="quote__close">Rs.1,234.50</div>
    <div class="quote__date">^ As of Fri, Jul 10, 2026 4:49 PM</div>
    <div class="stats_item">
      <div class="stats_label">P/E Ratio (TTM) **</div><div class="stats_value">12.40</div>
    </div>
  </section>
  <div class="tabs__list__item" data-name="Annual">Annual</div>
  <div class="tabs__panel" data-name="Annual"><div><table>
    <thead><tr><th></th><th>2025</th><th>2024</th><th>2023</th></tr></thead>
    <tbody>
      <tr><td>Sales</td><td>1,200</td><td>1,000</td><td>900</td></tr>
      <tr><td>Profit after Taxation</td><td>250</td><td>(50)</td><td>&mdash;</td></tr>
      <tr><td>EPS</td><td>10.5</td><td>-2.25</td><td>N/A</td></tr>
    </tbody>
  </table></div></div>
  <div class="tabs__panel" data-name="Quarterly"><table>
    <tr><th></th><th>Q1 2026</th></tr><tr><td>EPS</td><td>999</td></tr>
  </table></div>
`

function oneListingHtml(
  symbol: string,
  indices: string,
  nonCompliantSegment = false,
): string {
  const segmentReason = nonCompliantSegment ? '<td>Regulation 5.11.1</td>' : ''
  return `<table><tr><td><strong>${symbol}</strong></td><td>${symbol} Limited</td><td>SECTOR</td>${segmentReason}<td>NC</td><td>1,000</td><td>100</td><td data-search="${indices}"></td></tr></table>`
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('parsePsxListingsHtml', () => {
  it('parses listings, index membership, numbers, and HTML entities', () => {
    expect(parsePsxListingsHtml(listingFixture)).toEqual([
      {
        symbol: 'FOOD',
        name: 'Pak & Sons – Foods',
        sector: 'FOOD & PERSONAL CARE',
        indices: ['ALLSHR', 'KMIALLSHR', 'KMI30'],
        shares: 1_234_567,
        freeFloat: 234_567,
        board: 'main',
        counter: 'normal',
      },
      {
        symbol: 'TEXT',
        name: "Textile 'Works'",
        sector: 'TEXTILE',
        indices: ['ALLSHR', 'KMIALLSHR'],
        shares: 900,
        freeFloat: null,
        board: 'main',
        counter: 'normal',
      },
    ])
  })

  it('applies explicit board and counter metadata', () => {
    const [listing] = parsePsxListingsHtml(
      oneListingHtml('GEMCO', 'KMIALLSHR', true),
      'gem',
      'non_compliant_segment',
    )
    expect(listing.board).toBe('gem')
    expect(listing.counter).toBe('non_compliant_segment')
  })
})

describe('parsePsxCompanyHtml', () => {
  it('parses the quote, TTM P/E, and Annual table without mixing in Quarterly data', () => {
    expect(parsePsxCompanyHtml('exmp', companyFixture)).toEqual({
      symbol: 'EXMP',
      name: 'Example & Company Limited',
      sector: 'TECHNOLOGY & COMMUNICATION',
      price: 1_234.5,
      priceAsOf: 'Fri, Jul 10, 2026 4:49 PM',
      peRatio: 12.4,
      annualPeriods: ['2025', '2024', '2023'],
      annualMetrics: {
        Sales: [1_200, 1_000, 900],
        'Profit after Taxation': [250, -50, null],
        EPS: [10.5, -2.25, null],
      },
    })
  })

  it('returns nullable fields and empty annual data for sparse markup', () => {
    expect(parsePsxCompanyHtml('none', '<html><body>No quote</body></html>')).toEqual({
      symbol: 'NONE',
      name: null,
      sector: null,
      price: null,
      priceAsOf: null,
      peRatio: null,
      annualPeriods: [],
      annualMetrics: {},
    })
  })
})

describe('cached PSX fetchers', () => {
  it('merges all four listing endpoints, deduplicates symbols, and shares its cache', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/main/nc')) {
        return new Response(oneListingHtml('DUP', 'ALLSHR,KMIALLSHR'))
      }
      if (url.endsWith('/main/dc')) {
        return new Response(oneListingHtml('DUP', 'KMI30', true))
      }
      if (url.endsWith('/gem/nc')) {
        return new Response(oneListingHtml('GEM', 'KMIALLSHR'))
      }
      if (url.endsWith('/gem/dc')) return new Response('<table></table>')
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { fetchPsxListings } = await import('./psxResearch.server')
    const [first, concurrent] = await Promise.all([fetchPsxListings(), fetchPsxListings()])
    const cached = await fetchPsxListings()

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(concurrent).toBe(first)
    expect(cached).toBe(first)
    expect(first.source).toBe('live')
    expect(first.error).toBeUndefined()
    expect(first.listings.map(listing => listing.symbol)).toEqual(['DUP', 'GEM'])
    expect(first.listings[0]).toMatchObject({ board: 'main', counter: 'normal' })
    expect(first.listings[0].indices).toEqual(['ALLSHR', 'KMIALLSHR', 'KMI30'])
    expect(first.memberships).toEqual({ KMIALLSHR: ['DUP', 'GEM'], KMI30: ['DUP'] })
    expect(first.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('shares in-flight company requests and fails soft on network errors', async () => {
    const fetchMock = vi
      .fn<(input: string | URL | Request) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(companyFixture))
      .mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    const { fetchPsxCompanyFundamentals } = await import('./psxResearch.server')
    const [first, concurrent] = await Promise.all([
      fetchPsxCompanyFundamentals('exmp'),
      fetchPsxCompanyFundamentals('EXMP'),
    ])
    const cached = await fetchPsxCompanyFundamentals(' EXMP ')
    const unavailable = await fetchPsxCompanyFundamentals('MISS')

    expect(first).toBe(concurrent)
    expect(cached).toBe(first)
    expect(first).toMatchObject({ symbol: 'EXMP', source: 'live', price: 1_234.5 })
    expect(unavailable).toMatchObject({ symbol: 'MISS', source: 'unavailable' })
    expect(unavailable.error).toContain('offline')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('labels a usable but incomplete listings response as partial', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/main/nc')) {
        return new Response(oneListingHtml('MAIN', 'KMIALLSHR'))
      }
      if (url.endsWith('/main/dc')) return new Response('', { status: 503 })
      if (url.endsWith('/gem/nc')) {
        return new Response(oneListingHtml('GEMCO', 'KMIALLSHR'))
      }
      return new Response('<table></table>')
    })
    vi.stubGlobal('fetch', fetchMock)

    const { fetchPsxListings } = await import('./psxResearch.server')
    const result = await fetchPsxListings()

    expect(result.source).toBe('partial')
    expect(result.error).toContain('HTTP 503')
    expect(result.memberships.KMIALLSHR).toEqual(['GEMCO', 'MAIN'])
  })
})
