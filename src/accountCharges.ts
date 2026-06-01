/** Non-trade cash movements (CGT, registration, etc.). Shared client + server. */

export const ACCOUNT_CHARGE_CATEGORIES = [
  { id: 'cgt', label: 'CGT' },
  { id: 'cgt_refund', label: 'CGT refund' },
  { id: 'tariff', label: 'CGT tariff' },
  { id: 'registration', label: 'Registration' },
  { id: 'other', label: 'Other' },
] as const

export type AccountChargeCategory = (typeof ACCOUNT_CHARGE_CATEGORIES)[number]['id']

const CATEGORY_SET = new Set<string>(ACCOUNT_CHARGE_CATEGORIES.map(c => c.id))

export function isAccountChargeCategory(value: string): value is AccountChargeCategory {
  return CATEGORY_SET.has(value)
}

export function accountChargeCategoryLabel(category: string): string {
  return ACCOUNT_CHARGE_CATEGORIES.find(c => c.id === category)?.label ?? category
}
