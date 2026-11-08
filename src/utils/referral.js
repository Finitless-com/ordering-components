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

/**
 * Google Actions Center click id (ORD-2402).
 *
 * Google adds `rwg_token` to the store link it opens. Unlike the UTM, the
 * site keeps ONE token, the last one, with the store the user landed on and
 * when: a new token replaces it and restarts the 30 days, a visit without one
 * keeps it, and it is sent on a place of ANY store of the site (the API
 * reports `merchant_changed` 1 when it is another store). It is not removed
 * after an order: a return visit within 30 days counts again.
 */
export const CLICK_ID_STORAGE_KEY = 'referral_click_id'
export const CLICK_ID_TYPE = 'rwg_token'
export const CLICK_ID_MAX_LENGTH = 2048

/**
 * The decoded `rwg_token` of a query string, or null. Decoded by hand:
 * URLSearchParams would turn a `+` of the token into a space.
 */
export const rwgTokenFromSearch = (search) => {
  if (typeof search !== 'string' || !search) return null
  const pair = search.replace(/^\?/, '').split('&').find(part => part.split('=')[0] === CLICK_ID_TYPE)
  if (!pair) return null
  try {
    const value = decodeURIComponent(pair.slice(CLICK_ID_TYPE.length + 1)).trim()
    return value && value.length <= CLICK_ID_MAX_LENGTH ? value : null
  } catch (e) {
    return null
  }
}

/** The click id to keep for a visit, or null when the URL has none. */
export const buildClickId = (search, businessId, now = Date.now()) => {
  const value = rwgTokenFromSearch(search)
  const id = Number(businessId)
  if (!value || !Number.isInteger(id) || id <= 0) return null
  return { type: CLICK_ID_TYPE, value, landing_business_id: id, clicked_at: now }
}

/**
 * The click id fields to add to `referral` on place, or null when the stored
 * one is missing, malformed or older than 30 days.
 */
export const clickIdForPlace = (stored, now = Date.now()) => {
  if (!stored || typeof stored !== 'object') return null
  const value = typeof stored.value === 'string' ? stored.value : ''
  const landingBusinessId = Number(stored.landing_business_id)
  const clickedAt = Number(stored.clicked_at)
  if (stored.type !== CLICK_ID_TYPE || !value || value.length > CLICK_ID_MAX_LENGTH) return null
  if (!Number.isInteger(landingBusinessId) || landingBusinessId <= 0) return null
  if (!Number.isFinite(clickedAt) || clickedAt > now || now - clickedAt > REFERRAL_TTL_MS) return null
  return {
    click_id: { type: CLICK_ID_TYPE, value },
    landing_business_id: landingBusinessId,
    clicked_at: new Date(clickedAt).toISOString()
  }
}
