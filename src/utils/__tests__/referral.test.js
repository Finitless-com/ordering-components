import { describe, expect, it } from 'vitest'
import {
  REFERRAL_TTL_MS,
  buildReferral,
  normalizeReferralSource,
  referralForPlace,
  referralSourceFromSearch
} from '../referral'

const NOW = 1793500000000

describe('normalizeReferralSource', () => {
  it('lowercases and trims a valid code', () => {
    expect(normalizeReferralSource(' Google_Business_Profile ')).toBe('google_business_profile')
  })

  it('rejects anything that is not a code', () => {
    expect(normalizeReferralSource('')).toBeNull()
    expect(normalizeReferralSource('google-business profile')).toBeNull()
    expect(normalizeReferralSource('a'.repeat(65))).toBeNull()
    expect(normalizeReferralSource(5)).toBeNull()
    expect(normalizeReferralSource(null)).toBeNull()
  })
})

describe('referralSourceFromSearch', () => {
  it('reads utm_source from the query string', () => {
    expect(referralSourceFromSearch('?utm_source=google_business_profile&utm_medium=x')).toBe('google_business_profile')
  })

  it('returns null without utm_source', () => {
    expect(referralSourceFromSearch('?rwg_token=abc')).toBeNull()
    expect(referralSourceFromSearch('')).toBeNull()
    expect(referralSourceFromSearch(undefined)).toBeNull()
  })
})

describe('buildReferral', () => {
  it('binds the source to the store that was opened', () => {
    expect(buildReferral('?utm_source=google_business_profile', 12, NOW))
      .toEqual({ source: 'google_business_profile', business_id: 12, captured_at: NOW })
  })

  it('keeps nothing without a source or a store', () => {
    expect(buildReferral('?q=1', 12, NOW)).toBeNull()
    expect(buildReferral('?utm_source=google_business_profile', undefined, NOW)).toBeNull()
    expect(buildReferral('?utm_source=google_business_profile', 'abc', NOW)).toBeNull()
  })
})

describe('referralForPlace', () => {
  const stored = { source: 'google_business_profile', business_id: 12, captured_at: NOW }

  it('sends source and store while it is fresh', () => {
    expect(referralForPlace(stored, NOW + 1000)).toEqual({ source: 'google_business_profile', business_id: 12 })
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
    expect(referralForPlace({ ...stored, source: 'bad source' }, NOW)).toBeNull()
    expect(referralForPlace({ ...stored, business_id: null }, NOW)).toBeNull()
    expect(referralForPlace({ ...stored, captured_at: 'x' }, NOW)).toBeNull()
    expect(referralForPlace({ ...stored, captured_at: NOW + 60000 }, NOW)).toBeNull()
  })
})
