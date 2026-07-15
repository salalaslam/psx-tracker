import { calcPriceValuation } from '../goodBuyPrice'

export function PriceValuationCell({
  avgCost,
  currentPrice,
}: {
  avgCost: number
  currentPrice: number | null
}) {
  const valuation = calcPriceValuation(avgCost, currentPrice)

  if (valuation === null) {
    return <span className="text-gray-600">—</span>
  }

  const presentation = {
    underpriced: {
      label: 'Underpriced',
      className: 'bg-emerald-950 text-emerald-300 ring-emerald-800/70',
    },
    fair: {
      label: 'Fair Price',
      className: 'bg-sky-950 text-sky-300 ring-sky-800/70',
    },
    overpriced: {
      label: 'Overpriced',
      className: 'bg-red-950 text-red-300 ring-red-800/70',
    },
  }[valuation]

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${presentation.className}`}
      title="Compared with the Good Buy Range"
    >
      {presentation.label}
    </span>
  )
}
