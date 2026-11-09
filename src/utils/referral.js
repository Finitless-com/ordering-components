export const REFERRAL_CODE_STORAGE_KEY = 'referral-code'

const TRANSIENT_ATTRIBUTION_ERROR = 'referral_attribution.unavailable'

/**
 * A stored code is cleared only after the API gives a final answer.
 * An inactive program and a temporary failure leave the code in place.
 */
export const referralAttributionSettled = (attribution) => (
  attribution?.accepted === true ||
  (attribution?.accepted === false &&
    Boolean(attribution.error_code) &&
    attribution.error_code !== TRANSIENT_ATTRIBUTION_ERROR)
)

/**
 * The first page load and the back button are not the only times a link
 * can arrive. Client-side navigations change the URL without a popstate.
 */
export const subscribeToBrowserReferralUrls = (handler) => {
  if (typeof window === 'undefined' || typeof history === 'undefined') return undefined
  const notify = () => handler(window.location?.href)
  window.addEventListener('popstate', notify)
  const restore = ['pushState', 'replaceState'].map((method) => {
    const original = history[method]
    history[method] = function (...args) {
      const result = original.apply(this, args)
      notify()
      return result
    }
    return () => {
      history[method] = original
    }
  })
  return () => {
    window.removeEventListener('popstate', notify)
    restore.forEach((undo) => undo())
  }
}

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
