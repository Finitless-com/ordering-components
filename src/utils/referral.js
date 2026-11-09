export const REFERRAL_CODE_STORAGE_KEY = 'referral-code'

export const normalizeReferralCode = (value) => {
  if (typeof value !== 'string') return null
  const code = value.trim()
  if (!code || code.length > 32) return null
  return code.toUpperCase()
}

export const getReferralCodeFromUrl = (url) => {
  if (typeof url !== 'string') return null
  const queryStart = url.indexOf('?')
  if (queryStart === -1) return null
  const query = url.slice(queryStart + 1).split('#')[0]
  for (const entry of query.split('&')) {
    const [rawKey, ...rawValue] = entry.split('=')
    try {
      if (decodeURIComponent(rawKey) !== 'referral_code') continue
      return normalizeReferralCode(decodeURIComponent(rawValue.join('=').replace(/\+/g, ' ')))
    } catch {
      return null
    }
  }
  return null
}
