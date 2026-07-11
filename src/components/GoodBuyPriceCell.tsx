import {
  buyPriceStatusDotClass,
  buyPriceStatusTextClass,
  calcGoodBuyPrice,
  type BuyPriceStatus,
} from '../goodBuyPrice'

function fmt(n: number) {
  return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function GoodBuyPriceCell({
  avgCost,
  currentPrice,
}: {
  avgCost: number
  currentPrice: number | null
}) {
  const info = calcGoodBuyPrice(avgCost, currentPrice)
  if (!info) {
    return <span className="text-gray-600">—</span>
  }

  return (
    <div className="inline-flex items-center justify-end gap-2">
      <BuyPriceDot status={info.status} />
      <span className={`tabular-nums ${buyPriceStatusTextClass(info.status)}`}>
        ₨ {fmt(info.lower)} – ₨ {fmt(info.upper)}
      </span>
    </div>
  )
}

function BuyPriceDot({ status }: { status: BuyPriceStatus }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${buyPriceStatusDotClass(status)}`}
      title={
        status === 'green'
          ? 'At or below average cost — good to buy'
          : status === 'yellow'
            ? 'Slightly above average cost — watch'
            : 'Well above average cost — avoid adding'
      }
    />
  )
}
