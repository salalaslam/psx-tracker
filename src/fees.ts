/** PSX delivery-trade fee defaults (broker-dependent). Shared client + server. */
export const BROKER_COMMISSION_RATE = 0.0015 // 0.15% of trade value
export const SST_ON_COMMISSION_RATE = 0.15 // 15% Sindh sales tax on commission

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function tradeValue(shares: number, rateSlip: number): number {
  return roundMoney(shares * rateSlip)
}

export function calcCommission(tradeVal: number): number {
  return roundMoney(tradeVal * BROKER_COMMISSION_RATE)
}

export function calcSalesTax(commission: number): number {
  return roundMoney(commission * SST_ON_COMMISSION_RATE)
}

export function calcNetAmount(
  tradeVal: number,
  commission: number,
  salesTax: number,
  cdcCharges: number,
): number {
  return roundMoney(tradeVal + commission + salesTax + cdcCharges)
}

export function calcCostPerShare(
  shares: number,
  tradeVal: number,
  commission: number,
  salesTax: number,
  cdcCharges: number,
): number {
  if (shares <= 0) return 0
  return calcNetAmount(tradeVal, commission, salesTax, cdcCharges) / shares
}

export interface TradeFees {
  rate_slip: number | null
  commission: number | null
  sales_tax: number | null
  cdc_charges: number | null
}

export function resolveTradeFees(
  shares: number,
  input: {
    rate_slip?: number | null
    commission?: number | null
    sales_tax?: number | null
    cdc_charges?: number | null
  },
): { fees: TradeFees; tradeVal: number | null; netAmount: number | null; costPerShare: number | null } {
  const rateSlip = input.rate_slip != null && input.rate_slip > 0 ? input.rate_slip : null
  if (rateSlip === null) {
    return {
      fees: {
        rate_slip: null,
        commission: input.commission ?? null,
        sales_tax: input.sales_tax ?? null,
        cdc_charges: input.cdc_charges ?? null,
      },
      tradeVal: null,
      netAmount: null,
      costPerShare: null,
    }
  }

  const tradeVal = tradeValue(shares, rateSlip)
  const commission =
    input.commission != null && input.commission >= 0
      ? roundMoney(input.commission)
      : calcCommission(tradeVal)
  const salesTax =
    input.sales_tax != null && input.sales_tax >= 0
      ? roundMoney(input.sales_tax)
      : calcSalesTax(commission)
  const cdcCharges =
    input.cdc_charges != null && input.cdc_charges >= 0 ? roundMoney(input.cdc_charges) : 0
  const netAmount = calcNetAmount(tradeVal, commission, salesTax, cdcCharges)
  const costPerShare = calcCostPerShare(shares, tradeVal, commission, salesTax, cdcCharges)

  return {
    fees: { rate_slip: rateSlip, commission, sales_tax: salesTax, cdc_charges: cdcCharges },
    tradeVal,
    netAmount,
    costPerShare,
  }
}

export function transactionTradeValue(
  shares: number,
  rateSlip: number | null,
): number | null {
  if (rateSlip == null) return null
  return tradeValue(shares, rateSlip)
}

export function transactionTotal(
  shares: number,
  costPerShare: number,
  rateSlip: number | null,
  commission: number | null,
  salesTax: number | null,
  cdcCharges: number | null,
): number {
  const gross = transactionTradeValue(shares, rateSlip)
  if (gross != null && commission != null && salesTax != null && cdcCharges != null) {
    return calcNetAmount(gross, commission, salesTax, cdcCharges)
  }
  return roundMoney(shares * costPerShare)
}
