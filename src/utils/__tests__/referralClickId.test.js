import { describe, expect, it } from 'vitest'
import {
  CLICK_ID_MAX_LENGTH,
  REFERRAL_TTL_MS,
  buildClickId,
  clickIdForPlace,
  clickIdToKeep,
  rwgTokenFromSearch
} from '../referral'

const NOW = 1793500000000
// Google's test token A, as it arrives in the URL.
const TOKEN_A_URL = 'AFd1xnHrJWKcjtriCyB5j3QL0bzbmLdcg1N1f5cJuSNVhteYjuOJz18Au6GIAT0tjHkw6fkUJKcarafV45b3c_gl7uT_o8HMcg%3D%3D'
const TOKEN_A = 'AFd1xnHrJWKcjtriCyB5j3QL0bzbmLdcg1N1f5cJuSNVhteYjuOJz18Au6GIAT0tjHkw6fkUJKcarafV45b3c_gl7uT_o8HMcg=='

describe('rwgTokenFromSearch', () => {
  it('reads and decodes the token', () => {
    expect(rwgTokenFromSearch(`?utm_source=google&rwg_token=${TOKEN_A_URL}`)).toBe(TOKEN_A)
  })

  it('keeps a + of the token instead of turning it into a space', () => {
    expect(rwgTokenFromSearch('?rwg_token=ab+cd%2B==')).toBe('ab+cd+==')
  })

  it('is null without a usable token', () => {
    expect(rwgTokenFromSearch('')).toBeNull()
    expect(rwgTokenFromSearch('?utm_source=google')).toBeNull()
    expect(rwgTokenFromSearch('?rwg_token=')).toBeNull()
    expect(rwgTokenFromSearch('?rwg_token_x=abc')).toBeNull()
    expect(rwgTokenFromSearch('?rwg_token=%E0%A4%A')).toBeNull()
    expect(rwgTokenFromSearch(`?rwg_token=${'a'.repeat(CLICK_ID_MAX_LENGTH + 1)}`)).toBeNull()
  })
})

describe('buildClickId', () => {
  it('keeps the token with the landing store and the time', () => {
    expect(buildClickId(`?rwg_token=${TOKEN_A_URL}`, '12', NOW)).toEqual({
      type: 'rwg_token',
      value: TOKEN_A,
      landing_business_id: 12,
      clicked_at: NOW
    })
  })

  it('is null without a token or a store', () => {
    expect(buildClickId('?utm_source=google', 12, NOW)).toBeNull()
    expect(buildClickId(`?rwg_token=${TOKEN_A_URL}`, undefined, NOW)).toBeNull()
    expect(buildClickId(`?rwg_token=${TOKEN_A_URL}`, 0, NOW)).toBeNull()
  })
})

describe('clickIdToKeep', () => {
  const search = `?rwg_token=${TOKEN_A_URL}`
  const stored = { type: 'rwg_token', value: TOKEN_A, landing_business_id: 12, clicked_at: NOW }

  it('writes a token that is not the one kept', () => {
    const fresh = { type: 'rwg_token', value: TOKEN_A, landing_business_id: 12, clicked_at: NOW }
    expect(clickIdToKeep(null, search, 12, NOW)).toEqual(fresh)
    expect(clickIdToKeep({ ...stored, value: 'another-token' }, search, 12, NOW)).toEqual(fresh)
  })

  it('leaves the same token with its date and its store', () => {
    expect(clickIdToKeep(stored, search, 12, NOW + 86400000)).toBeNull()
    expect(clickIdToKeep(stored, search, 30, NOW + 86400000)).toBeNull()
  })

  it('does not renew the same token after its 30 days', () => {
    expect(clickIdToKeep(stored, search, 12, NOW + REFERRAL_TTL_MS + 86400000)).toBeNull()
  })

  it('rewrites the same token when what is kept cannot be used', () => {
    expect(clickIdToKeep({ ...stored, clicked_at: 'x' }, search, 12, NOW + 5)).toMatchObject({ clicked_at: NOW + 5 })
    expect(clickIdToKeep({ ...stored, landing_business_id: null }, search, 12, NOW + 5)).not.toBeNull()
    expect(clickIdToKeep({ ...stored, type: 'gclid' }, search, 12, NOW + 5)).not.toBeNull()
    expect(clickIdToKeep('token', search, 12, NOW + 5)).not.toBeNull()
  })

  it('writes nothing without a token or a store', () => {
    expect(clickIdToKeep(stored, '?utm_source=google', 12, NOW)).toBeNull()
    expect(clickIdToKeep(null, search, undefined, NOW)).toBeNull()
  })
})

describe('clickIdForPlace', () => {
  const stored = { type: 'rwg_token', value: TOKEN_A, landing_business_id: 12, clicked_at: NOW - 1000 }

  it('sends the click id, the landing store and the time as ISO', () => {
    expect(clickIdForPlace(stored, NOW)).toEqual({
      click_id: { type: 'rwg_token', value: TOKEN_A },
      landing_business_id: 12,
      clicked_at: new Date(NOW - 1000).toISOString()
    })
  })

  it('still counts at 30 days and not after', () => {
    expect(clickIdForPlace({ ...stored, clicked_at: NOW - REFERRAL_TTL_MS }, NOW)).not.toBeNull()
    expect(clickIdForPlace({ ...stored, clicked_at: NOW - REFERRAL_TTL_MS - 1 }, NOW)).toBeNull()
  })

  it('drops what is missing or malformed', () => {
    expect(clickIdForPlace(null, NOW)).toBeNull()
    expect(clickIdForPlace({ ...stored, type: 'fbclid' }, NOW)).toBeNull()
    expect(clickIdForPlace({ ...stored, value: '' }, NOW)).toBeNull()
    expect(clickIdForPlace({ ...stored, landing_business_id: 'x' }, NOW)).toBeNull()
    expect(clickIdForPlace({ ...stored, clicked_at: NOW + 60000 }, NOW)).toBeNull()
  })
})
