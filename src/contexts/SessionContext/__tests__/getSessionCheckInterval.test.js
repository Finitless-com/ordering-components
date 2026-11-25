import { describe, expect, it } from 'vitest'
import { getSessionCheckInterval, DEFAULT_SESSION_CHECK_INTERVAL } from '../getSessionCheckInterval'

describe('getSessionCheckInterval', () => {
  it('keeps the 2000 ms default when nothing is given', () => {
    expect(DEFAULT_SESSION_CHECK_INTERVAL).toBe(2000)
    expect(getSessionCheckInterval(undefined)).toBe(2000)
  })

  it('uses a positive number as the period', () => {
    expect(getSessionCheckInterval(500)).toBe(500)
    expect(getSessionCheckInterval(30000)).toBe(30000)
    expect(getSessionCheckInterval('1500')).toBe(1500)
  })

  it.each([0, false, null, -1, NaN, Infinity, '', '  ', 'abc', true, {}, []])('turns the poll off for %p', (value) => {
    expect(getSessionCheckInterval(value)).toBeNull()
  })
})
