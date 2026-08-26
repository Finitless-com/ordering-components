import { describe, expect, it } from 'vitest'
import { parseJsonStorage } from '../parseJsonStorage'

describe('parseJsonStorage', () => {
  it('parses valid JSON', () => {
    expect(parseJsonStorage('{"code":"en"}')).toEqual({ code: 'en' })
  })

  it('returns null for missing or empty values', () => {
    expect(parseJsonStorage(null)).toBeNull()
    expect(parseJsonStorage('')).toBeNull()
  })

  it('returns null for corrupt JSON instead of throwing', () => {
    expect(parseJsonStorage('undefined')).toBeNull()
    expect(parseJsonStorage('{"type":1')).toBeNull()
  })
})
