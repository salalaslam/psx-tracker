import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export function SortIndicator({
  active,
  direction,
}: {
  active: boolean
  direction: 'asc' | 'desc'
}) {
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return <Icon aria-hidden="true" className="inline-block h-3.5 w-3.5 shrink-0" />
}
