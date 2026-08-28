import { describe, it, expect, vi, afterEach } from 'vitest'
import dayjs from 'dayjs'
import {
  TIMEZONES,
  isValidTimezone,
  getValidTimezone,
  createDayjsWithTimezone,
  parseBusinessDateTime,
  formatUtcInBusinessTimezone,
  getPreorderMaxDate
} from '../timezones'

describe('timezones', () => {
  it('exports a large timezone catalog', () => {
    expect(TIMEZONES['America/New_York']).toBe('United States')
    expect(Object.keys(TIMEZONES).length).toBeGreaterThan(100)
  })

  describe('isValidTimezone', () => {
    it('rejects falsy and non-string values', () => {
      expect(isValidTimezone(null)).toBe(false)
      expect(isValidTimezone(123)).toBe(false)
    })

    it('accepts known catalog timezones', () => {
      expect(isValidTimezone('America/New_York')).toBe(true)
    })

    it('rejects invalid timezone strings', () => {
      expect(isValidTimezone('Not/A_Real_Zone')).toBe(false)
    })
  })

  describe('getValidTimezone', () => {
    it('returns valid timezone unchanged', () => {
      expect(getValidTimezone('America/New_York')).toBe('America/New_York')
    })

    it('falls back to local timezone or UTC for invalid timezone', () => {
      const result = getValidTimezone('Invalid/Zone')
      expect(['UTC', Intl.DateTimeFormat().resolvedOptions().timeZone]).toContain(result)
    })
  })

  describe('createDayjsWithTimezone', () => {
    it('creates dayjs instance in timezone', () => {
      const result = createDayjsWithTimezone('America/New_York', '2024-01-15T12:00:00Z')
      expect(result.isValid()).toBe(true)
      expect(result.format('YYYY-MM-DD')).toBe('2024-01-15')
    })
  })

  describe('parseBusinessDateTime', () => {
    it('parses date and time in business timezone', () => {
      const parsed = parseBusinessDateTime('2024-06-01', '14:30', 'America/New_York')
      expect(parsed.format('YYYY-MM-DD HH:mm')).toBe('2024-06-01 14:30')
    })
  })

  describe('formatUtcInBusinessTimezone', () => {
    it('returns null for empty input', () => {
      expect(formatUtcInBusinessTimezone(null, 'America/New_York')).toBeNull()
    })

    it('formats UTC datetime in business timezone', () => {
      const formatted = formatUtcInBusinessTimezone(
        '2024-06-01T18:30:00Z',
        'America/New_York',
        'YYYY-MM-DD'
      )
      expect(formatted).toBe('2024-06-01')
    })
  })

  describe('getPreorderMaxDate', () => {
    it('returns end of day date object', () => {
      const result = getPreorderMaxDate('America/New_York', 3)
      expect(result).toBeInstanceOf(Date)
    })

    it('uses default lookahead when limitDays is not positive', () => {
      const result = getPreorderMaxDate('America/New_York', 0)
      expect(result).toBeInstanceOf(Date)
    })
  })

  describe('timezone plugin fallback', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('still converts to the business timezone when the plugin cannot parse the locale string', () => {
      const toLocaleString = Date.prototype.toLocaleString
      vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (...args) {
        return `x${toLocaleString.apply(this, args)}`
      })
      const inTz = dayjs('2026-08-28T20:08:00Z').tz('America/Los_Angeles')
      expect(inTz.isValid()).toBe(true)
      expect(inTz.format('YYYY-MM-DD HH:mm')).toBe('2026-08-28 13:08')
      expect(dayjs('2026-09-04T05:59:00Z').tz('America/Los_Angeles').isSameOrAfter(inTz, 'day')).toBe(true)
      expect(createDayjsWithTimezone('America/Los_Angeles', '2026-08-28T20:08:00Z').format('YYYY-MM-DD HH:mm')).toBe('2026-08-28 13:08')
      expect(formatUtcInBusinessTimezone('2026-08-28 20:08:00', 'America/Los_Angeles')).toBe('2026-08-28 13:08')
    })
  })
})
