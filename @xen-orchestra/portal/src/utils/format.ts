let money: Intl.NumberFormat
let preciseMoney: Intl.NumberFormat
const number = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

/** the currency comes from the provider configuration */
export function setCurrency(currency: string) {
  money = new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 })
  preciseMoney = new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 3 })
}

setCurrency('EUR')

export const formatMoney = (value: number) => money.format(value)

export const formatHourlyPrice = (value: number) => `${preciseMoney.format(value)}/h`

export const formatMonthlyPrice = (hourly: number) => `≈ ${money.format(hourly * 730)}/month`

export const formatNumber = (value: number) => number.format(value)

export const formatDate = (value: number) =>
  new Date(value).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })
