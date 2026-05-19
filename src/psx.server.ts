/**
 * PSX price fetcher — scrapes dps.psx.com.pk/company/{SYMBOL}
 * The current price is in: <motion.div class="quote__close">Rs.655.00</motion.div>
 * Sector is in: <motion.div class="quote__sector"><span>...</span></motion.div>
 */

const PSX_BASE = 'https://dps.psx.com.pk'

export interface PsxQuote {
  price: number | null
  sector: string | null
}

function parsePsxQuote(html: string): PsxQuote {
  let price: number | null = null

  const closeMatch = html.match(/class="quote__close"[^>]*>Rs\.([\d,]+\.?\d*)</)
  if (closeMatch) {
    const v = parseFloat(closeMatch[1].replace(/,/g, ''))
    if (!isNaN(v) && v > 0) price = v
  }

  if (price === null) {
    const ldcpMatch = html.match(/stats_label">LDCP<\/div>\s*<div[^>]*>([\d,]+\.?\d*)/)
    if (ldcpMatch) {
      const v = parseFloat(ldcpMatch[1].replace(/,/g, ''))
      if (!isNaN(v) && v > 0) price = v
    }
  }

  return { price, sector: parseSector(html) }
}

function parseSector(html: string): string | null {
  const patterns = [
    /class="quote__sector"[^>]*>\s*<span>([^<]+)</i,
    /quote__sector"[^>]*><span>([^<]+)</i,
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) {
      const sector = match[1].replace(/&amp;/g, '&').trim()
      if (sector) return sector
    }
  }
  return null
}

export async function fetchAndStoreSectors(
  symbols: string[],
  onStore: (symbol: string, sector: string) => void,
): Promise<{ stored: string[]; failed: string[] }> {
  const stored: string[] = []
  const failed: string[] = []
  const CHUNK = 4
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const batch = symbols.slice(i, i + CHUNK)
    const results = await Promise.all(
      batch.map(async symbol => {
        const { sector } = await fetchPsxQuote(symbol)
        return { symbol, sector }
      }),
    )
    for (const { symbol, sector } of results) {
      if (sector) {
        onStore(symbol, sector)
        stored.push(symbol)
      } else {
        failed.push(symbol)
      }
    }
  }
  return { stored, failed }
}

async function fetchPsxHtml(symbol: string): Promise<string | null> {
  const url = `${PSX_BASE}/company/${encodeURIComponent(symbol)}`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export async function fetchPsxQuote(symbol: string): Promise<PsxQuote> {
  const html = await fetchPsxHtml(symbol)
  if (!html) return { price: null, sector: null }
  return parsePsxQuote(html)
}

export async function fetchPsxPrice(symbol: string): Promise<number | null> {
  const { price } = await fetchPsxQuote(symbol)
  return price
}

export type PsxEodRow = {
  date: string
  close: number
}

export async function fetchPsxEod(symbol: string, sinceDate?: string): Promise<PsxEodRow[]> {
  const url = `${PSX_BASE}/timeseries/eod/${encodeURIComponent(symbol)}`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return []
    const json = (await res.json()) as { status?: number; data?: [number, number][] }
    if (json.status !== 1 || !Array.isArray(json.data)) return []

    const sinceTs = sinceDate
      ? Math.floor(new Date(`${sinceDate}T00:00:00Z`).getTime() / 1000)
      : 0

    const rows: PsxEodRow[] = []
    for (const [ts, close] of json.data) {
      if (sinceTs && ts < sinceTs) continue
      if (!Number.isFinite(close) || close <= 0) continue
      const date = new Date(ts * 1000).toISOString().slice(0, 10)
      rows.push({ date, close })
    }
    return rows
  } catch {
    return []
  }
}

export async function fetchAllPrices(
  symbols: string[],
): Promise<{ symbol: string; price: number | null; sector: string | null; error?: string }[]> {
  const results: { symbol: string; price: number | null; sector: string | null; error?: string }[] = []
  const CHUNK = 4
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const batch = symbols.slice(i, i + CHUNK)
    const batchResults = await Promise.all(
      batch.map(async sym => {
        try {
          const { price, sector } = await fetchPsxQuote(sym)
          return { symbol: sym, price, sector }
        } catch (err) {
          return { symbol: sym, price: null, sector: null, error: String(err) }
        }
      }),
    )
    results.push(...batchResults)
  }
  return results
}
