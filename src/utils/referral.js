/**
 * Order attribution (ORD-1992).
 *
 * A visit that lands on a store page with UTM parameters (`utm_source`,
 * `utm_medium`, `utm_campaign`) is remembered for that store, and the next
 * place of that store sends them as `referral`. The API registers each
 * distinct combination by itself, ignores what is not usable, and never
 * rejects an order because of it.
 */

export const REFERRAL_STORAGE_KEY = 'referral'
export const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000

const VALUE_PATTERN = /^[a-z0-9_.-]{1,100}$/

/**
 * Normalizes a UTM value the same way the API does: lowercased, trimmed,
 * inner whitespace as `_`. Returns null when it is not a usable value.
 */
export const normalizeUtmValue = (value) => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_')
  return VALUE_PATTERN.test(normalized) ? normalized : null
}

/**
 * Reads the UTM parameters from a query string. `source` is required;
 * medium and campaign are optional.
 */
export const utmFromSearch = (search) => {
  if (typeof search !== 'string' || !search) return null
  try {
    const params = new URLSearchParams(search)
    const source = normalizeUtmValue(params.get('utm_source'))
    if (!source) return null
    const utm = { source }
    const medium = normalizeUtmValue(params.get('utm_medium'))
    const campaign = normalizeUtmValue(params.get('utm_campaign'))
    if (medium) utm.medium = medium
    if (campaign) utm.campaign = campaign
    return utm
  } catch (e) {
    return null
  }
}

/** Builds the stored referral for a store, or null when there is nothing to keep. */
export const buildReferral = (search, businessId, now = Date.now()) => {
  const utm = utmFromSearch(search)
  const id = Number(businessId)
  if (!utm || !Number.isInteger(id) || id <= 0) return null
  return { ...utm, business_id: id, captured_at: now }
}

/**
 * The `referral` to send on place, or null when the stored one is missing,
 * malformed or older than the TTL.
 */
export const referralForPlace = (stored, now = Date.now()) => {
  if (!stored || typeof stored !== 'object') return null
  const source = normalizeUtmValue(stored.source)
  const businessId = Number(stored.business_id)
  const capturedAt = Number(stored.captured_at)
  if (!source || !Number.isInteger(businessId) || businessId <= 0) return null
  if (!Number.isFinite(capturedAt) || capturedAt > now || now - capturedAt > REFERRAL_TTL_MS) return null
  const referral = { source, business_id: businessId }
  const medium = normalizeUtmValue(stored.medium)
  const campaign = normalizeUtmValue(stored.campaign)
  if (medium) referral.medium = medium
  if (campaign) referral.campaign = campaign
  return referral
}
