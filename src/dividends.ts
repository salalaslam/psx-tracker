export interface ParsedDividendRow {
  event_id: string
  symbol: string
  security_name: string | null
  financial_year: string
  gross_amount: number
  net_amount: number
  status: string
  payment_date: string
}

export interface ParseDividendPasteResult {
  rows: ParsedDividendRow[]
  errors: string[]
}

export function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
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

const HEADER_ALIASES: Record<string, keyof ParsedDividendRow | 'skip'> = {
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
}

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim())
  return line.split(',').map(c => c.trim())
}

function mapHeader(cells: string[]): (keyof ParsedDividendRow)[] | null {
  const mapped = cells.map(c => {
    const key = HEADER_ALIASES[c.trim().toLowerCase()]
    return key === 'skip' || key == null ? null : key
  })
  const required: (keyof ParsedDividendRow)[] = [
    'event_id',
    'symbol',
    'financial_year',
    'gross_amount',
    'net_amount',
    'status',
    'payment_date',
  ]
  if (required.every(k => mapped.includes(k))) return mapped as (keyof ParsedDividendRow)[]
  return null
}

const POSITIONAL_KEYS: (keyof ParsedDividendRow)[] = [
  'event_id',
  'symbol',
  'security_name',
  'financial_year',
  'gross_amount',
  'net_amount',
  'status',
  'payment_date',
]

function parseRowCells(cells: string[], columnMap: (keyof ParsedDividendRow)[]): ParsedDividendRow | null {
  const raw: Partial<Record<keyof ParsedDividendRow, string>> = {}
  for (let i = 0; i < columnMap.length && i < cells.length; i++) {
    const key = columnMap[i]
    if (key) raw[key] = cells[i]
  }

  const event_id = (raw.event_id ?? '').trim()
  const symbol = (raw.symbol ?? '').trim().toUpperCase()
  const financial_year = (raw.financial_year ?? '').trim()
  const gross = parseAmount(raw.gross_amount ?? '')
  const net = parseAmount(raw.net_amount ?? '')
  const payment_date = parsePaymentDate(raw.payment_date ?? '')

  if (!event_id || !symbol || !financial_year || gross == null || net == null || !payment_date) {
    return null
  }

  return {
    event_id,
    symbol,
    security_name: (raw.security_name ?? '').trim() || null,
    financial_year,
    gross_amount: gross,
    net_amount: net,
    status: normalizeStatus(raw.status ?? 'paid'),
    payment_date,
  }
}

export function parseDividendPaste(text: string): ParseDividendPasteResult {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length === 0) {
    return { rows: [], errors: ['No data to parse'] }
  }

  const errors: string[] = []
  const rows: ParsedDividendRow[] = []
  let start = 0
  let columnMap: (keyof ParsedDividendRow)[] = POSITIONAL_KEYS

  const firstCells = splitLine(lines[0])
  const headerMap = mapHeader(firstCells)
  if (headerMap) {
    columnMap = headerMap
    start = 1
  }

  for (let i = start; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    if (cells.every(c => !c)) continue

    const row = parseRowCells(cells, columnMap)
    if (!row) {
      errors.push(`Line ${i + 1}: could not parse row (${cells.slice(0, 3).join(' | ')}…)`)
      continue
    }
    rows.push(row)
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No valid dividend rows found')
  }

  return { rows, errors }
}
