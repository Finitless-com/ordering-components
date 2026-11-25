import { describe, it, expect } from 'vitest'
import {
  buildProductsWhere,
  formatApiDateTime,
  isProductUnavailable,
  parseApiDateTime
} from '../utils'

describe('StoreProductSearch utils', () => {
  const now = new Date('2026-11-19T15:30:05Z')

  it('formats dates as the API reads them (UTC, Y-m-d H:i:s)', () => {
    expect(formatApiDateTime(now)).toBe('2026-11-19 15:30:05')
    expect(formatApiDateTime(new Date('2026-01-02T03:04:05-05:00'))).toBe('2026-01-02 08:04:05')
  })

  it('parses a snooze_until as UTC', () => {
    expect(parseApiDateTime('2026-11-19 15:30:05')).toBe(Date.parse('2026-11-19T15:30:05Z'))
    expect(parseApiDateTime('2026-11-19T15:30:05.000Z')).toBe(Date.parse('2026-11-19T15:30:05Z'))
    expect(parseApiDateTime(null)).toBeNaN()
    expect(parseApiDateTime('')).toBeNaN()
  })

  it('knows when a product is unavailable', () => {
    expect(isProductUnavailable({ enabled: true, snooze_until: null }, now)).toBe(false)
    expect(isProductUnavailable({ enabled: false, snooze_until: null }, now)).toBe(true)
    expect(isProductUnavailable({ enabled: true, snooze_until: '2026-11-19 16:00:00' }, now)).toBe(true)
    expect(isProductUnavailable({ enabled: true, snooze_until: '2026-11-19 15:00:00' }, now)).toBe(false)
    expect(isProductUnavailable({ enabled: true, snooze_until: '' }, now)).toBe(false)
    expect(isProductUnavailable(null, now)).toBe(false)
  })

  it('builds no where without a search or a filter', () => {
    expect(buildProductsWhere({})).toBeNull()
    expect(buildProductsWhere({ search: '   ' })).toBeNull()
  })

  it('searches the name and the description (encodeURI off iOS, plain on iOS)', () => {
    expect(buildProductsWhere({ search: 'pizza x', isIos: true })).toEqual({
      conector: 'AND',
      conditions: [{
        conector: 'OR',
        conditions: [
          { attribute: 'name', value: { condition: 'ilike', value: '%pizza x%' } },
          { attribute: 'description', value: { condition: 'ilike', value: '%pizza x%' } }
        ]
      }]
    })
    const android = buildProductsWhere({ search: 'pizza x' })
    expect(android.conditions[0].conditions[0].value.value).toBe('%25pizza%20x%25')
  })

  it('can search only the name', () => {
    const where = buildProductsWhere({ search: 'a', isIos: true, searchByDescription: false })
    expect(where.conditions[0].conditions.map(c => c.attribute)).toEqual(['name'])
  })

  it('filters the unavailable ones: enabled = false OR snooze_until > now', () => {
    expect(buildProductsWhere({ unavailableOnly: true, now })).toEqual({
      conector: 'AND',
      conditions: [{
        conector: 'OR',
        conditions: [
          { attribute: 'enabled', value: false },
          { attribute: 'snooze_until', value: { condition: '>', value: '2026-11-19 15:30:05' } }
        ]
      }]
    })
  })

  it('ANDs the search with the unavailable filter', () => {
    const where = buildProductsWhere({ search: 'a', unavailableOnly: true, now, isIos: true })
    expect(where.conector).toBe('AND')
    expect(where.conditions).toHaveLength(2)
  })
})
