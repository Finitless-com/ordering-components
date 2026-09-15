export const DEFAULT_DATES_GENERAL_FORMAT = 'YYYY-MM-DD HH:mm:ss'

const configValue = (configs, key) => {
  if (!configs) return undefined
  if (Array.isArray(configs)) {
    return configs.find(config => config?.key === key)?.value
  }
  return configs[key]?.value
}

const isEnabledValue = (value) => {
  const normalized = String(value ?? '').toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

export const getDateTimeFormats = (generalFormat) => {
  const safeFormat = (typeof generalFormat === 'string' && generalFormat.trim())
    ? generalFormat.trim()
    : DEFAULT_DATES_GENERAL_FORMAT
  const timeMatch = safeFormat.match(/[Hh].*$/)
  const timeFormat = timeMatch ? timeMatch[0].trim() : 'HH:mm'
  const dateFormat = safeFormat.replace(/[HhmsaA:.\s]+$/g, '').trim() || 'YYYY-MM-DD'
  const preorderDateFormat = dateFormat
    .replace(/Y{2,4}[-/.\s]*/g, '')
    .replace(/[-/.]\s*Y{2,4}/g, '')
    .replace(/^[-/.\s]+|[-/.\s]+$/g, '')
    .trim() || dateFormat
  return {
    dateFormat,
    timeFormat,
    is12Hours: /h/.test(timeFormat),
    preorderDateFormat
  }
}

export const isWalletEnabled = (configs = {}) => (
  isEnabledValue(configValue(configs, 'wallet_cash_enabled')) ||
  isEnabledValue(configValue(configs, 'wallet_credit_point_enabled'))
)

export const getMaxPreorderDays = (configs = {}, orderType) => {
  const fallback = parseInt(configValue(configs, 'max_days_preorder'), 10)
  const defaultDays = Number.isFinite(fallback) ? fallback : 6
  const raw = configValue(configs, 'preorder_maximum_days')
  if (raw == null || raw === '' || orderType == null || orderType === '') {
    return defaultDays
  }
  const typeKey = String(orderType)
  const parts = String(raw).split('|')
  for (const part of parts) {
    const [type, days] = part.split(',')
    if (String(type).trim() !== typeKey) continue
    const parsed = parseInt(days, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return defaultDays
}
