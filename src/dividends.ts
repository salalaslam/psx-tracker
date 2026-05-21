export interface ParsedDividendRow {
  event_id?: string
  symbol: string
  security_name: string | null
  financial_year: string
  gross_amount: number
  net_amount: number
  status: string
  payment_date: string
  shares?: number | null
}

export interface ParseDividendPasteResult {
  rows: ParsedDividendRow[]
  errors: string[]
  format: 'payment_history' | 'summary_report'
}

export function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function parseInteger(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function parsePaymentDate(raw: string): string | null {
  const s = raw.trim()
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return iso
}

export function formatPaymentDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`
}

export function normalizeStatus(raw: string): string {
  return raw.trim().toLowerCase() || 'paid'
}

/** Net dividend per share from CDC entitlement (net ÷ shares at payment). */
export function dividendPerShare(netAmount: number, shares: number | null | undefined): number | null {
  if (shares == null || shares <= 0 || !Number.isFinite(netAmount)) return null
  return netAmount / shares
}

/**
 * Cash dividend yield on cost: (DPS from payments) ÷ average cost per share.
 * Falls back to total net ÷ invested when share counts are missing.
 */
export function calcDividendYieldOnCost(params: {
  totalNet: number
  totalDividendShares: number | null | undefined
  invested: number
  holdingShares: number
  eventCount: number
}): number | null {
  const { totalNet, totalDividendShares, invested, holdingShares, eventCount } = params
  if (eventCount === 0 || invested <= 0 || holdingShares <= 0) return null

  if (totalDividendShares != null && totalDividendShares > 0) {
    const dps = totalNet / totalDividendShares
    const costAvg = invested / holdingShares
    if (costAvg <= 0) return null
    return (dps / costAvg) * 100
  }

  return (totalNet / invested) * 100
}

export function parseSymbolAndName(raw: string): { symbol: string; security_name: string | null } {
  const s = raw.trim()
  const dash = s.indexOf(' - ')
  if (dash > 0) {
    return {
      symbol: s.slice(0, dash).trim().toUpperCase(),
      security_name: s.slice(dash + 3).trim() || null,
    }
  }
  const token = s.split(/\s+/)[0]?.toUpperCase() ?? ''
  return { symbol: token, security_name: s || null }
}

const PAYMENT_HEADER_ALIASES: Record<string, keyof ParsedDividendRow | 'skip'> = {
  'event id': 'event_id',
  event_id: 'event_id',
  'security symbol': 'symbol',
  symbol: 'symbol',
  'security name': 'security_name',
  security_name: 'security_name',
  name: 'security_name',
  'financial year': 'financial_year',
  financial_year: 'financial_year',
  fy: 'financial_year',
  'gross dividend amount (pkr)': 'gross_amount',
  'gross dividend': 'gross_amount',
  gross: 'gross_amount',
  gross_amount: 'gross_amount',
  'net dividend amount (pkr)': 'net_amount',
  'net dividend': 'net_amount',
  net: 'net_amount',
  net_amount: 'net_amount',
  status: 'status',
  'payment date': 'payment_date',
  payment_date: 'payment_date',
  date: 'payment_date',
  shares: 'shares',
  'no. of securities': 'shares',
  'no of securities': 'shares',
  securities: 'shares',
}

const SUMMARY_HEADER_ALIASES: Record<string, keyof ParsedDividendRow | 'skip'> = {
  'payment date': 'payment_date',
  'dividend issue date': 'skip',
  'sec. symbol - sec. name': 'symbol',
  'sec symbol - sec name': 'symbol',
  'security symbol': 'symbol',
  'filer status': 'skip',
  'filer status*': 'skip',
  'no. of securities': 'shares',
  'no of securities': 'shares',
  'gross dividend': 'gross_amount',
  gross: 'gross_amount',
  'deductions: tax': 'skip',
  tax: 'skip',
  'deductions: zakat': 'skip',
  zakat: 'skip',
  'net dividend': 'net_amount',
  net: 'net_amount',
}

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim())
  return line.split(',').map(c => c.trim())
}

function isSummaryHeader(cells: string[]): boolean {
  const lower = cells.map(c => c.toLowerCase())
  return lower.some(c => c.includes('no. of securities') || c.includes('no of securities'))
}

function mapHeader(
  cells: string[],
  aliases: Record<string, keyof ParsedDividendRow | 'skip'>,
): (keyof ParsedDividendRow | null)[] {
  return cells.map(c => {
    const key = aliases[c.trim().toLowerCase()]
    return key === 'skip' || key == null ? null : key
  })
}

const PAYMENT_POSITIONAL: (keyof ParsedDividendRow)[] = [
  'event_id',
  'symbol',
  'security_name',
  'financial_year',
  'gross_amount',
  'net_amount',
  'status',
  'payment_date',
]

function parsePaymentRow(
  cells: string[],
  columnMap: (keyof ParsedDividendRow | null)[],
): ParsedDividendRow | null {
  const raw: Partial<Record<keyof ParsedDividendRow, string>> = {}
  for (let i = 0; i < columnMap.length && i < cells.length; i++) {
    const key = columnMap[i]
    if (key) raw[key] = cells[i]
  }

  const event_id = (raw.event_id ?? '').trim() || undefined
  let symbol = (raw.symbol ?? '').trim().toUpperCase()
  let security_name = (raw.security_name ?? '').trim() || null
  if (!symbol && raw.symbol) {
    const parsed = parseSymbolAndName(raw.symbol)
    symbol = parsed.symbol
    security_name = parsed.security_name
  }
  const financial_year = (raw.financial_year ?? '').trim()
  const gross = parseAmount(raw.gross_amount ?? '')
  const net = parseAmount(raw.net_amount ?? '')
  const payment_date = parsePaymentDate(raw.payment_date ?? '')
  const sharesRaw = raw.shares != null ? parseInteger(raw.shares) : null

  if (!symbol || gross == null || net == null || !payment_date) return null
  if (!event_id && !financial_year) return null

  return {
    ...(event_id ? { event_id } : {}),
    symbol,
    security_name,
    financial_year,
    gross_amount: gross,
    net_amount: net,
    status: normalizeStatus(raw.status ?? 'paid'),
    payment_date,
    shares: sharesRaw,
  }
}

function parseSummaryRow(cells: string[], columnMap: (keyof ParsedDividendRow | null)[]): ParsedDividendRow | null {
  const raw: Partial<Record<keyof ParsedDividendRow, string>> = {}
  for (let i = 0; i < columnMap.length && i < cells.length; i++) {
    const key = columnMap[i]
    if (key) raw[key] = cells[i]
  }

  const payment_date = parsePaymentDate(raw.payment_date ?? '')
  const gross = parseAmount(raw.gross_amount ?? '')
  const net = parseAmount(raw.net_amount ?? '')
  const shares = raw.shares != null ? parseInteger(raw.shares) : null
  const secRaw = raw.symbol ?? ''
  const { symbol, security_name } = parseSymbolAndName(secRaw)

  if (!symbol || !payment_date || gross == null || net == null) return null

  return {
    symbol,
    security_name,
    financial_year: '',
    gross_amount: gross,
    net_amount: net,
    status: 'paid',
    payment_date,
    shares,
  }
}

function isTotalRow(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase()
  return joined.includes('total') && !cells.some(c => /^[A-Z]{2,}/.test(c))
}

export function parseDividendPaste(text: string): ParseDividendPasteResult {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length === 0) {
    return { rows: [], errors: ['No data to parse'], format: 'payment_history' }
  }

  const errors: string[] = []
  const rows: ParsedDividendRow[] = []
  const firstCells = splitLine(lines[0])
  const summaryFormat = isSummaryHeader(firstCells)
  const format: ParseDividendPasteResult['format'] = summaryFormat ? 'summary_report' : 'payment_history'

  let start = 0
  let columnMap: (keyof ParsedDividendRow | null)[]

  if (summaryFormat) {
    columnMap = mapHeader(firstCells, SUMMARY_HEADER_ALIASES)
    start = 1
  } else {
    const headerMap = mapHeader(firstCells, PAYMENT_HEADER_ALIASES)
    const hasHeader = headerMap.some(k => k != null)
    columnMap = hasHeader
      ? headerMap
      : PAYMENT_POSITIONAL.map(k => k as keyof ParsedDividendRow | null)
    if (hasHeader) start = 1
  }

  for (let i = start; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    if (cells.every(c => !c) || isTotalRow(cells)) continue

    const row = summaryFormat
      ? parseSummaryRow(cells, columnMap)
      : parsePaymentRow(cells, columnMap)

    if (!row) {
      errors.push(`Line ${i + 1}: could not parse row (${cells.slice(0, 3).join(' | ')}…)`)
      continue
    }
    if (summaryFormat && !row.financial_year) {
      row.financial_year = '—'
    }
    rows.push(row)
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No valid dividend rows found')
  }

  return { rows, errors, format }
}
