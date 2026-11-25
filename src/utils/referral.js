/**
 * Order attribution (ORD-1992).
 *
 * A visit that arrives with UTM parameters (`utm_source`, `utm_medium`,
 * `utm_campaign`) is remembered for 30 days and the next places send it as
 * `referral`. The API registers each distinct combination by itself, ignores
 * what is not usable, and never rejects an order because of it.
 *
 * What a visit applies to depends on where it landed:
 *
 * - on a store page: that store only, sent with its `business_id` (the API
 *   does not attribute a cart of another store to it);
 * - anywhere else (home, promotions, a campaign link to the site): any store,
 *   sent without `business_id`.
 *
 * Storage keeps one entry per visit, `{ visits: [{ source, medium?,
 * campaign?, captured_at, business_ids }] }`, so a visit to one store does
 * not erase the one of another. On place the newest visit that applies to the
 * store wins (last non-direct click). A visit is not removed after an order.
 *
 * The visit comes from one of two places, both ending in the same storage:
 *
 * - web: the URL of the page (`captureVisit`, fed by `captureReferral`);
 * - React Native, where there is no URL: the data of a marketing push
 *   notification the user opened (`registerVisit`, fed by `registerReferral`).
 */

export const REFERRAL_STORAGE_KEY = 'referral'
export const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const REFERRAL_MAX_VISITS = 20

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

const businessIdOf = (value) => {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

const sameUtm = (a, b) =>
  a.source === b.source && (a.medium || '') === (b.medium || '') && (a.campaign || '') === (b.campaign || '')

/**
 * The visits kept in storage that can still be used, oldest first: well
 * formed and not older than the TTL. Anything else is dropped.
 */
export const storedVisits = (stored, now = Date.now()) => {
  if (!stored || typeof stored !== 'object' || !Array.isArray(stored.visits)) return []
  return stored.visits.reduce((visits, item) => {
    if (!item || typeof item !== 'object') return visits
    const source = normalizeUtmValue(item.source)
    const capturedAt = Number(item.captured_at)
    if (!source) return visits
    if (!Number.isFinite(capturedAt) || capturedAt > now || now - capturedAt > REFERRAL_TTL_MS) return visits
    const visit = { source }
    const medium = normalizeUtmValue(item.medium)
    const campaign = normalizeUtmValue(item.campaign)
    if (medium) visit.medium = medium
    if (campaign) visit.campaign = campaign
    visit.captured_at = capturedAt
    visit.business_ids = Array.isArray(item.business_ids)
      ? [...new Set(item.business_ids.map(businessIdOf).filter(Boolean))]
      : []
    visits.push(visit)
    return visits
  }, [])
}

/**
 * Whether the page was reloaded or reached with back/forward: the URL still
 * carries the parameters of a click the user did not make again.
 */
export const isRepeatedNavigation = (performance) => {
  try {
    const [entry] = performance.getEntriesByType('navigation')
    return entry?.type === 'reload' || entry?.type === 'back_forward'
  } catch (e) {
    return false
  }
}

/**
 * Registers what a URL with UTM parameters means for the stored visits.
 *
 * The same click is seen several times: when the site loads, when the store
 * it opened finishes loading, and each time that store is fetched again. It
 * has to stay one visit with one date, so:
 *
 * - `landing` is what this page load already captured (`{ search,
 *   captured_at }`); the same query string again is the same visit.
 * - on a reload or a back/forward (`repeated`), the newest visit with the
 *   same combination is the same visit, and its 30 days do not restart.
 * - anything else is a new visit, dated `now`.
 *
 * A `businessId` marks the visit as one that opened that store.
 *
 * Returns `{ stored, landing }` (what to write and what to remember for the
 * rest of the page load), or null when the URL has no usable `utm_source`.
 */
export const captureVisit = (stored, { search, businessId, landing, repeated = false, now = Date.now() } = {}) => {
  const utm = utmFromSearch(search)
  if (!utm) return null
  const visits = storedVisits(stored, now)
  let visit = landing?.search === search
    ? visits.find(item => item.captured_at === landing.captured_at && sameUtm(item, utm))
    : undefined
  if (!visit && repeated) {
    visit = [...visits].reverse().find(item => sameUtm(item, utm))
  }
  if (!visit) {
    visit = { ...utm, captured_at: now, business_ids: [] }
    visits.push(visit)
  }
  const id = businessIdOf(businessId)
  if (id && !visit.business_ids.includes(id)) visit.business_ids.push(id)
  return {
    stored: { visits: visits.slice(-REFERRAL_MAX_VISITS) },
    landing: { search, captured_at: visit.captured_at }
  }
}

/**
 * Registers a visit from explicit values (an opened push notification) instead
 * of a URL. The values are normalized and validated like the ones of a URL and
 * `source` is required: it returns null when it is not usable. It reads no
 * query string, so it does not depend on the platform's URLSearchParams.
 *
 * Every call is a click the user really made, so unlike a page load it is
 * never taken for one already captured (no `landing`, no `repeated`): it is a
 * visit dated `now`, the newest one, and it wins on place. To keep opening the
 * same notification from filling the 20 visits, it replaces the older visits
 * of the same combination and the same stores instead of adding to them (its
 * date moves forward, which is the newest click being the one that counts).
 * A visit of the same combination that opened other stores is kept.
 *
 * It does not touch the page-load memory: the returned object has `stored`
 * only.
 */
export const registerVisit = (stored, { source, medium, campaign, businessId, now = Date.now() } = {}) => {
  const visit = { source: normalizeUtmValue(source) }
  if (!visit.source) return null
  const normalizedMedium = normalizeUtmValue(medium)
  const normalizedCampaign = normalizeUtmValue(campaign)
  if (normalizedMedium) visit.medium = normalizedMedium
  if (normalizedCampaign) visit.campaign = normalizedCampaign
  visit.captured_at = now
  const id = businessIdOf(businessId)
  visit.business_ids = id ? [id] : []
  const scope = (item) => [...item.business_ids].sort((a, b) => a - b).join(',')
  const visits = storedVisits(stored, now)
    .filter(item => !(sameUtm(item, visit) && scope(item) === scope(visit)))
  visits.push(visit)
  return { stored: { visits: visits.slice(-REFERRAL_MAX_VISITS) } }
}

/**
 * The `referral` to send on a place of the stores in `businessIds`, or null:
 * the newest visit that applies to one of them. A visit that opened a store
 * goes with that store's `business_id`; one that landed anywhere else goes
 * without it.
 *
 * When the stores of the place are not known (`businessIds` empty), the
 * newest visit is sent as it is and the API discards it if it is of another
 * store.
 */
export const referralForPlace = (stored, businessIds = [], now = Date.now()) => {
  const ids = (Array.isArray(businessIds) ? businessIds : [businessIds]).map(businessIdOf).filter(Boolean)
  const visits = storedVisits(stored, now).reverse()
  for (const visit of visits) {
    const referral = { source: visit.source }
    if (visit.medium) referral.medium = visit.medium
    if (visit.campaign) referral.campaign = visit.campaign
    if (!visit.business_ids.length) return referral
    const businessId = ids.length
      ? ids.find(id => visit.business_ids.includes(id))
      : visit.business_ids[visit.business_ids.length - 1]
    if (businessId) return { ...referral, business_id: businessId }
  }
  return null
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
 *
 * The same token again is the same click, whatever brought the URL back (a
 * reload, a bookmark, the store fetched again): its date and its store stay.
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
 * The click id to write for a visit, or null when there is nothing to write:
 * the URL has no token, or it has the one already kept. Keeping the stored
 * one, even past its 30 days, is what stops an old click from being reported
 * as a recent one.
 */
export const clickIdToKeep = (stored, search, businessId, now = Date.now()) => {
  const clickId = buildClickId(search, businessId, now)
  if (!clickId) return null
  const kept = stored && typeof stored === 'object' &&
    stored.type === CLICK_ID_TYPE &&
    stored.value === clickId.value &&
    Number.isFinite(Number(stored.clicked_at)) &&
    Number.isInteger(Number(stored.landing_business_id)) && Number(stored.landing_business_id) > 0
  return kept ? null : clickId
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

// Invite-code capture for the referral program. The visits above are the separate UTM attribution.

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
