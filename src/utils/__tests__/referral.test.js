import { describe, expect, it } from 'vitest'
import {
  REFERRAL_TTL_MS,
  buildReferral,
  normalizeUtmValue,
  referralForPlace,
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

describe('buildReferral', () => {
  it('binds the UTM combination to the store that was opened', () => {
    expect(buildReferral('?utm_source=google&utm_medium=organic', 12, NOW))
      .toEqual({ source: 'google', medium: 'organic', business_id: 12, captured_at: NOW })
  })

  it('keeps nothing without a source or a store', () => {
    expect(buildReferral('?q=1', 12, NOW)).toBeNull()
    expect(buildReferral('?utm_source=google', undefined, NOW)).toBeNull()
    expect(buildReferral('?utm_source=google', 'abc', NOW)).toBeNull()
  })
})

describe('referralForPlace', () => {
  const stored = { source: 'google', medium: 'organic', campaign: 'gbp-order', business_id: 12, captured_at: NOW }

  it('sends the combination and the store while it is fresh', () => {
    expect(referralForPlace(stored, NOW + 1000))
      .toEqual({ source: 'google', medium: 'organic', campaign: 'gbp-order', business_id: 12 })
  })

  it('omits medium and campaign when they were not captured', () => {
    expect(referralForPlace({ source: 'google', business_id: 12, captured_at: NOW }, NOW))
      .toEqual({ source: 'google', business_id: 12 })
  })

  it('still sends it on the last day of the TTL', () => {
    expect(referralForPlace(stored, NOW + REFERRAL_TTL_MS)).not.toBeNull()
  })

  it('drops it after the TTL', () => {
    expect(referralForPlace(stored, NOW + REFERRAL_TTL_MS + 1)).toBeNull()
  })

  it('drops a malformed or future one', () => {
    expect(referralForPlace(null, NOW)).toBeNull()
    expect(referralForPlace('google', NOW)).toBeNull()
    expect(referralForPlace({ ...stored, source: 'bad/source' }, NOW)).toBeNull()
    expect(referralForPlace({ ...stored, business_id: null }, NOW)).toBeNull()
    expect(referralForPlace({ ...stored, captured_at: 'x' }, NOW)).toBeNull()
    expect(referralForPlace({ ...stored, captured_at: NOW + 60000 }, NOW)).toBeNull()
  })
})
