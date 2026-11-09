import { describe, expect, it } from 'vitest'
import {
  getReferralCodeFromUrl,
  normalizeReferralCode,
  referralAttributionSettled,
  subscribeToBrowserReferralUrls
} from '../referral'

describe('referral utilities', () => {
  it('normalizes a valid referral code', () => {
    expect(normalizeReferralCode('  ab12cd34  ')).toBe('AB12CD34')
  })

  it('rejects empty and oversized referral codes', () => {
    expect(normalizeReferralCode('')).toBeNull()
    expect(normalizeReferralCode('a'.repeat(33))).toBeNull()
  })

  it('reads the referral code from web and native links', () => {
    expect(getReferralCodeFromUrl('https://shop.test/?referral_code=ab12cd34&utm_source=email')).toBe('AB12CD34')
    expect(getReferralCodeFromUrl('ordering://home?referral_code=ZX90')).toBe('ZX90')
  })

  it('returns null for malformed links or links without the parameter', () => {
    expect(getReferralCodeFromUrl('https://shop.test/?coupon=SAVE')).toBeNull()
    expect(getReferralCodeFromUrl(null)).toBeNull()
  })

  it('clears a code only after a final attribution answer', () => {
    expect(referralAttributionSettled({ accepted: true, error_code: null })).toBe(true)
    expect(referralAttributionSettled({ accepted: false, error_code: 'referral_attribution.same_account' })).toBe(true)
    expect(referralAttributionSettled(null)).toBe(false)
    expect(referralAttributionSettled({ accepted: false, error_code: 'referral_attribution.unavailable' })).toBe(false)
  })

  it('reads a referral code added by a client-side navigation', () => {
    const seen = []
    const stop = subscribeToBrowserReferralUrls((url) => seen.push(url))
    window.history.pushState({}, '', '/?referral_code=ab12')
    expect(getReferralCodeFromUrl(seen.at(-1))).toBe('AB12')
    stop()
    window.history.pushState({}, '', '/cart')
    expect(seen).toHaveLength(1)
  })
})
