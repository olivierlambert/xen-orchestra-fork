import { CURRENCY } from '@/mock/data.ts'

const money = new Intl.NumberFormat('en', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 2 })
const preciseMoney = new Intl.NumberFormat('en', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 3 })
const number = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

export const formatMoney = (value: number) => money.format(value)

export const formatHourlyPrice = (value: number) => `${preciseMoney.format(value)}/h`

export const formatMonthlyPrice = (hourly: number) => `≈ ${money.format(hourly * 730)}/month`

export const formatNumber = (value: number) => number.format(value)

export const formatDate = (value: number) =>
  new Date(value).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })
