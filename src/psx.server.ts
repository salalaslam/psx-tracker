/**
 * PSX price fetcher — scrapes dps.psx.com.pk/company/{SYMBOL}
 * The current price is in: <div class="quote__close">Rs.655.00</div>
 * LDCP (last day closing price) is also available as fallback.
 */

const PSX_BASE = 'https://dps.psx.com.pk'

export async function fetchPsxPrice(symbol: string): Promise<number | null> {
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
    const html = await res.text()

    // Primary: current traded price  <div class="quote__close">Rs.655.00</div>
    const closeMatch = html.match(/class="quote__close"[^>]*>Rs\.([\d,]+\.?\d*)</)
    if (closeMatch) {
      const v = parseFloat(closeMatch[1].replace(/,/g, ''))
      if (!isNaN(v) && v > 0) return v
    }

    // Fallback: LDCP stat value
    const ldcpMatch = html.match(/stats_label">LDCP<\/div>\s*<div[^>]*>([\d,]+\.?\d*)/)
    if (ldcpMatch) {
      const v = parseFloat(ldcpMatch[1].replace(/,/g, ''))
      if (!isNaN(v) && v > 0) return v
    }

    return null
  } catch {
    return null
  }
}

export async function fetchAllPrices(
  symbols: string[],
): Promise<{ symbol: string; price: number | null; error?: string }[]> {
  // Throttle: 4 concurrent requests to be polite
  const results: { symbol: string; price: number | null; error?: string }[] = []
  const CHUNK = 4
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const batch = symbols.slice(i, i + CHUNK)
    const batchResults = await Promise.all(
      batch.map(async sym => {
        try {
          const price = await fetchPsxPrice(sym)
          return { symbol: sym, price }
        } catch (err) {
          return { symbol: sym, price: null, error: String(err) }
        }
      }),
    )
    results.push(...batchResults)
  }
  return results
}
