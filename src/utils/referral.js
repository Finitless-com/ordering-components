/**
 * Order attribution (ORD-1992).
 *
 * A visit that lands on a store page with `utm_source` (for example the
 * "Order online" button of Google Business Profile) is remembered for that
 * store, and the next place of that store sends it as `referral`. The API
 * resolves the code against `referral_sources`, ignores what it does not know,
 * and never rejects an order because of it.
 */

export const REFERRAL_STORAGE_KEY = 'referral'
export const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000

const SOURCE_PATTERN = /^[a-z0-9_]{1,64}$/

/** Normalizes a source code; returns null when it is not a valid code. */
export const normalizeReferralSource = (value) => {
  if (typeof value !== 'string') return null
  const source = value.trim().toLowerCase()
  return SOURCE_PATTERN.test(source) ? source : null
}

/** Reads `utm_source` from a query string (`?a=b&utm_source=x`). */
export const referralSourceFromSearch = (search) => {
  if (typeof search !== 'string' || !search) return null
  try {
    return normalizeReferralSource(new URLSearchParams(search).get('utm_source'))
  } catch (e) {
    return null
  }
}

/** Builds the stored referral for a store, or null when there is nothing to keep. */
export const buildReferral = (search, businessId, now = Date.now()) => {
  const source = referralSourceFromSearch(search)
  const id = Number(businessId)
  if (!source || !Number.isInteger(id) || id <= 0) return null
  return { source, business_id: id, captured_at: now }
}

/**
 * The `referral` to send on place, or null when the stored one is missing,
 * malformed or older than the TTL.
 */
export const referralForPlace = (stored, now = Date.now()) => {
  if (!stored || typeof stored !== 'object') return null
  const source = normalizeReferralSource(stored.source)
  const businessId = Number(stored.business_id)
  const capturedAt = Number(stored.captured_at)
  if (!source || !Number.isInteger(businessId) || businessId <= 0) return null
  if (!Number.isFinite(capturedAt) || capturedAt > now || now - capturedAt > REFERRAL_TTL_MS) return null
  return { source, business_id: businessId }
}
