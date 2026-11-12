import { describe, expect, it } from 'vitest'
import {
  REFERRAL_MAX_VISITS,
  REFERRAL_TTL_MS,
  captureVisit,
  isRepeatedNavigation,
  normalizeUtmValue,
  referralForPlace,
  registerVisit,
  storedVisits,
  utmFromSearch
} from '../referral'

const NOW = 1793500000000

describe('normalizeUtmValue', () => {
  it('lowercases, trims and joins inner whitespace', () => {
    expect(normalizeUtmValue(' Google ')).toBe('google')
    expect(normalizeUtmValue('Promo  Navidad')).toBe('promo_navidad')
  })

  it('keeps hyphens and dots', () => {
    expect(normalizeUtmValue('gbp-order')).toBe('gbp-order')
    expect(normalizeUtmValue('facebook.com')).toBe('facebook.com')
  })

  it('rejects anything that is not a usable value', () => {
    expect(normalizeUtmValue('')).toBeNull()
    expect(normalizeUtmValue('a/b')).toBeNull()
    expect(normalizeUtmValue('a'.repeat(101))).toBeNull()
    expect(normalizeUtmValue(5)).toBeNull()
    expect(normalizeUtmValue(null)).toBeNull()
  })
})

describe('utmFromSearch', () => {
  it('reads the standard combination', () => {
    expect(utmFromSearch('?utm_source=google&utm_medium=organic&utm_campaign=gbp-order&x=1'))
      .toEqual({ source: 'google', medium: 'organic', campaign: 'gbp-order' })
  })

  it('accepts a source alone', () => {
    expect(utmFromSearch('?utm_source=google_business_profile')).toEqual({ source: 'google_business_profile' })
  })

  it('drops a malformed medium or campaign but keeps the source', () => {
    expect(utmFromSearch('?utm_source=google&utm_medium=a/b')).toEqual({ source: 'google' })
  })

  it('returns null without utm_source', () => {
    expect(utmFromSearch('?utm_medium=organic&rwg_token=abc')).toBeNull()
    expect(utmFromSearch('')).toBeNull()
    expect(utmFromSearch(undefined)).toBeNull()
  })
})

const GOOGLE = '?utm_source=google&utm_medium=organic&utm_campaign=gbp-order'
const CAMPAIGN = '?utm_source=ordering_marketing&utm_medium=email&utm_campaign=mkt-7'

const google = (extra = {}) => ({
  source: 'google', medium: 'organic', campaign: 'gbp-order', captured_at: NOW, business_ids: [], ...extra
})
const campaign = (extra = {}) => ({
  source: 'ordering_marketing', medium: 'email', campaign: 'mkt-7', captured_at: NOW, business_ids: [], ...extra
})

describe('storedVisits', () => {
  it('returns the usable visits, oldest first', () => {
    const stored = { visits: [google({ business_ids: [12] }), campaign({ captured_at: NOW + 5 })] }
    expect(storedVisits(stored, NOW + 10)).toEqual(stored.visits)
  })

  it('drops what is malformed, in the future or older than the TTL', () => {
    const stored = {
      visits: [
        null,
        'google',
        google({ source: 'bad/source' }),
        google({ captured_at: 'x' }),
        google({ captured_at: NOW + 60000 }),
        google({ captured_at: NOW - REFERRAL_TTL_MS - 1 }),
        google({ captured_at: NOW - REFERRAL_TTL_MS })
      ]
    }
    expect(storedVisits(stored, NOW)).toEqual([google({ captured_at: NOW - REFERRAL_TTL_MS })])
  })

  it('keeps only usable store ids, once each', () => {
    expect(storedVisits({ visits: [google({ business_ids: [12, '12', 'abc', 0, -3, 7] })] }, NOW))
      .toEqual([google({ business_ids: [12, 7] })])
    expect(storedVisits({ visits: [{ source: 'google', captured_at: NOW }] }, NOW))
      .toEqual([{ source: 'google', captured_at: NOW, business_ids: [] }])
  })

  it('is empty for anything that is not the stored shape', () => {
    expect(storedVisits(null, NOW)).toEqual([])
    expect(storedVisits('google', NOW)).toEqual([])
    expect(storedVisits({ source: 'google', business_id: 12, captured_at: NOW }, NOW)).toEqual([])
  })
})

describe('isRepeatedNavigation', () => {
  const performance = (type) => ({ getEntriesByType: () => [{ type }] })

  it('is true for a reload and for back/forward', () => {
    expect(isRepeatedNavigation(performance('reload'))).toBe(true)
    expect(isRepeatedNavigation(performance('back_forward'))).toBe(true)
  })

  it('is false for a new arrival or when it cannot be known', () => {
    expect(isRepeatedNavigation(performance('navigate'))).toBe(false)
    expect(isRepeatedNavigation({ getEntriesByType: () => [] })).toBe(false)
    expect(isRepeatedNavigation(undefined)).toBe(false)
  })
})

describe('captureVisit', () => {
  it('keeps nothing without a usable utm_source', () => {
    expect(captureVisit(null, { search: '?q=1', now: NOW })).toBeNull()
    expect(captureVisit(null, { search: '', businessId: 12, now: NOW })).toBeNull()
    expect(captureVisit(null)).toBeNull()
  })

  it('remembers a visit that landed outside a store, for any store', () => {
    expect(captureVisit(null, { search: CAMPAIGN, now: NOW })).toEqual({
      stored: { visits: [campaign()] },
      landing: { search: CAMPAIGN, captured_at: NOW }
    })
  })

  it('makes the visit of this page load one of the store it opened', () => {
    const first = captureVisit(null, { search: GOOGLE, now: NOW })
    const second = captureVisit(first.stored, {
      search: GOOGLE, businessId: 12, landing: first.landing, now: NOW + 900
    })
    expect(second.stored).toEqual({ visits: [google({ business_ids: [12] })] })
    expect(second.landing).toEqual(first.landing)
  })

  it('does not restart the 30 days when the same store is fetched again', () => {
    const first = captureVisit(null, { search: GOOGLE, businessId: 12, now: NOW })
    const again = captureVisit(first.stored, {
      search: GOOGLE, businessId: 12, landing: first.landing, now: NOW + 50000
    })
    expect(again.stored).toEqual({ visits: [google({ business_ids: [12] })] })
  })

  it('does not restart the 30 days on a reload or a back/forward', () => {
    const stored = { visits: [google({ business_ids: [12] })] }
    const reloaded = captureVisit(stored, { search: GOOGLE, repeated: true, now: NOW + 86400000 })
    expect(reloaded.stored).toEqual(stored)
    expect(reloaded.landing).toEqual({ search: GOOGLE, captured_at: NOW })
  })

  it('counts a reload as a new visit when nothing with that combination is remembered', () => {
    const stored = { visits: [campaign()] }
    expect(captureVisit(stored, { search: GOOGLE, repeated: true, now: NOW + 10 }).stored)
      .toEqual({ visits: [campaign(), google({ captured_at: NOW + 10 })] })
  })

  it('counts the same link opened again as a new visit', () => {
    const stored = { visits: [google({ business_ids: [12] })] }
    expect(captureVisit(stored, { search: GOOGLE, businessId: 12, now: NOW + 86400000 }).stored).toEqual({
      visits: [google({ business_ids: [12] }), google({ captured_at: NOW + 86400000, business_ids: [12] })]
    })
  })

  it('keeps the visit of one store when another store gets its own', () => {
    const first = captureVisit(null, { search: GOOGLE, businessId: 12, now: NOW })
    const second = captureVisit(first.stored, { search: CAMPAIGN, businessId: 30, now: NOW + 10 })
    expect(second.stored).toEqual({
      visits: [google({ business_ids: [12] }), campaign({ captured_at: NOW + 10, business_ids: [30] })]
    })
  })

  it('starts a new visit when the URL changes during the same page load', () => {
    const first = captureVisit(null, { search: GOOGLE, now: NOW })
    const second = captureVisit(first.stored, { search: CAMPAIGN, landing: first.landing, now: NOW + 10 })
    expect(second.stored).toEqual({ visits: [google(), campaign({ captured_at: NOW + 10 })] })
    expect(second.landing).toEqual({ search: CAMPAIGN, captured_at: NOW + 10 })
  })

  it('forgets the oldest visits beyond the limit and the expired ones', () => {
    const visits = Array.from({ length: REFERRAL_MAX_VISITS }, (_, index) => google({ captured_at: NOW + index }))
    const expired = google({ captured_at: NOW - REFERRAL_TTL_MS })
    const captured = captureVisit({ visits: [expired, ...visits] }, { search: CAMPAIGN, now: NOW + 500 })
    expect(captured.stored.visits).toHaveLength(REFERRAL_MAX_VISITS)
    expect(captured.stored.visits[0]).toEqual(google({ captured_at: NOW + 1 }))
    expect(captured.stored.visits[REFERRAL_MAX_VISITS - 1]).toEqual(campaign({ captured_at: NOW + 500 }))
  })
})

describe('referralForPlace', () => {
  const stored = {
    visits: [
      campaign({ captured_at: NOW }),
      google({ captured_at: NOW + 10, business_ids: [12] })
    ]
  }

  it('sends the visit of the store with its business_id', () => {
    expect(referralForPlace(stored, [12], NOW + 20))
      .toEqual({ source: 'google', medium: 'organic', campaign: 'gbp-order', business_id: 12 })
  })

  it('sends a visit that landed outside a store without business_id', () => {
    expect(referralForPlace(stored, [5], NOW + 20))
      .toEqual({ source: 'ordering_marketing', medium: 'email', campaign: 'mkt-7' })
  })

  it('sends nothing to a store when the only visits opened other stores', () => {
    expect(referralForPlace({ visits: [google({ business_ids: [12] })] }, [5], NOW)).toBeNull()
  })

  it('prefers the newest visit that applies', () => {
    const newerCampaign = { visits: [google({ business_ids: [12] }), campaign({ captured_at: NOW + 10 })] }
    expect(referralForPlace(newerCampaign, [12], NOW + 20))
      .toEqual({ source: 'ordering_marketing', medium: 'email', campaign: 'mkt-7' })
  })

  it('takes the first store of a group that the visit opened', () => {
    expect(referralForPlace({ visits: [google({ business_ids: [12, 30] })] }, [5, 30, 12], NOW))
      .toEqual({ source: 'google', medium: 'organic', campaign: 'gbp-order', business_id: 30 })
  })

  it('sends the newest visit as it is when the stores of the place are unknown', () => {
    expect(referralForPlace(stored, [], NOW + 20))
      .toEqual({ source: 'google', medium: 'organic', campaign: 'gbp-order', business_id: 12 })
    expect(referralForPlace(stored, undefined, NOW + 20)).toMatchObject({ business_id: 12 })
    expect(referralForPlace(stored, 12, NOW + 20)).toMatchObject({ business_id: 12 })
  })

  it('omits medium and campaign when they were not captured', () => {
    expect(referralForPlace({ visits: [{ source: 'google', captured_at: NOW, business_ids: [12] }] }, [12], NOW))
      .toEqual({ source: 'google', business_id: 12 })
  })

  it('still sends it on the last day of the TTL and drops it after', () => {
    expect(referralForPlace(stored, [5], NOW + REFERRAL_TTL_MS)).not.toBeNull()
    expect(referralForPlace(stored, [5], NOW + REFERRAL_TTL_MS + 1)).toBeNull()
  })

  it('sends nothing when nothing usable is stored', () => {
    expect(referralForPlace(null, [12], NOW)).toBeNull()
    expect(referralForPlace({ visits: [] }, [12], NOW)).toBeNull()
  })
})

describe('registerVisit', () => {
  const push = { source: 'Ordering_Marketing', medium: 'Push', campaign: 'mkt-7' }
  const pushVisit = { source: 'ordering_marketing', medium: 'push', campaign: 'mkt-7' }

  it('records a visit from explicit values, normalized, with no URL', () => {
    const result = registerVisit(null, { ...push, now: NOW })
    expect(result.stored).toEqual({ visits: [{ ...pushVisit, captured_at: NOW, business_ids: [] }] })
    expect(result).not.toHaveProperty('landing')
  })

  it('records nothing without a usable source', () => {
    expect(registerVisit(null, { medium: 'push', now: NOW })).toBeNull()
    expect(registerVisit(null, { source: 'a/b', now: NOW })).toBeNull()
    expect(registerVisit(null, { source: 5, now: NOW })).toBeNull()
    expect(registerVisit(null)).toBeNull()
  })

  it('keeps medium and campaign optional and drops unusable ones', () => {
    const { stored } = registerVisit(null, { source: 'push', medium: 'a/b', campaign: 3, now: NOW })
    expect(stored.visits).toEqual([{ source: 'push', captured_at: NOW, business_ids: [] }])
  })

  it('marks the stores the visit opened', () => {
    const { stored } = registerVisit(null, { ...push, businessId: 12, now: NOW })
    expect(stored.visits[0].business_ids).toEqual([12])
  })

  it('replaces the same combination and scope: the newest click is the only one', () => {
    const first = registerVisit(null, { ...push, now: NOW }).stored
    const second = registerVisit(first, { ...push, now: NOW + 1000 }).stored
    expect(second.visits).toEqual([{ ...pushVisit, captured_at: NOW + 1000, business_ids: [] }])
  })

  it('keeps the visits of other combinations and orders the newest last', () => {
    const other = { source: 'google', captured_at: NOW + 500, business_ids: [] }
    const stored = { visits: [{ ...pushVisit, captured_at: NOW, business_ids: [] }, other] }
    const result = registerVisit(stored, { ...push, now: NOW + 1000 }).stored
    expect(result.visits.map(visit => visit.source)).toEqual(['google', 'ordering_marketing'])
    expect(referralForPlace(result, [], NOW + 2000)).toEqual(pushVisit)
  })

  it('keeps a visit of the same combination that opened another store', () => {
    const first = registerVisit(null, { ...push, businessId: 12, now: NOW }).stored
    const second = registerVisit(first, { ...push, businessId: 5, now: NOW + 1000 }).stored
    expect(second.visits.map(visit => visit.business_ids)).toEqual([[12], [5]])
    expect(referralForPlace(second, [12], NOW + 2000)).toEqual({ ...pushVisit, business_id: 12 })
  })

  it('never goes past the maximum of visits', () => {
    let stored = null
    for (let i = 0; i < REFERRAL_MAX_VISITS + 5; i++) {
      stored = registerVisit(stored, { source: `s${i}`, now: NOW + i }).stored
    }
    expect(stored.visits).toHaveLength(REFERRAL_MAX_VISITS)
  })
})
