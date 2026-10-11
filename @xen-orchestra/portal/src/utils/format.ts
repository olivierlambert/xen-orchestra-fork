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

const integer = new Intl.NumberFormat('en', { maximumFractionDigits: 0 })

/** quantity with its unit, for the organizations which see resources without costs */
export const formatQuantity = (value: number, unit: string) => `${integer.format(value)} ${unit}`.trim()

export const formatVcpuHours = (value: number) => formatQuantity(value, 'vCPU·h')

export const formatDate = (value: number) =>
  new Date(value).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Human description of the common backup schedules, the cron expression otherwise */
export function formatCron(cron: string) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = cron.trim().split(/\s+/)
  const time =
    /^\d+$/.test(minute) && /^\d+$/.test(hour) ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` : undefined
  if (time !== undefined && dayOfMonth === '*' && month === '*') {
    if (dayOfWeek === '*') {
      return `Every day at ${time}`
    }
    if (/^[0-7]$/.test(dayOfWeek)) {
      return `Every ${WEEKDAYS[Number(dayOfWeek) % 7]} at ${time}`
    }
  }
  const everyHours = /^\*\/(\d+)$/.exec(hour ?? '')
  if (/^\d+$/.test(minute) && everyHours !== null && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Every ${everyHours[1]} hours`
  }
  return cron
}
