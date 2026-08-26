import { describe, expect, it } from 'vitest'
import { parseReservationSetting } from '../parseReservationSetting'

describe('parseReservationSetting', () => {
  it('parses a valid reservation setting object', () => {
    expect(parseReservationSetting('{"min_time_reserve_minutes":30,"max_time_reserve_days":7}')).toEqual({
      min_time_reserve_minutes: 30,
      max_time_reserve_days: 7
    })
  })

  it('returns an empty object for missing, empty, or invalid JSON', () => {
    expect(parseReservationSetting(undefined)).toEqual({})
    expect(parseReservationSetting('')).toEqual({})
    expect(parseReservationSetting('{not-json')).toEqual({})
    expect(parseReservationSetting('<html>oops</html>')).toEqual({})
  })
})
