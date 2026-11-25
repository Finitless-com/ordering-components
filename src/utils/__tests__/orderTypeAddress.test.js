import { describe, it, expect } from 'vitest'
import {
  parseUnaddressedOrderTypes,
  resolveUnaddressedOrderTypes,
  orderTypeRequiresAddress,
  hasOrderAddress,
  shouldRequireOrderAddress
} from '../orderTypeAddress'

describe('orderTypeAddress', () => {
  describe('parseUnaddressedOrderTypes', () => {
    it('returns empty array for falsy config', () => {
      expect(parseUnaddressedOrderTypes()).toEqual([])
      expect(parseUnaddressedOrderTypes('')).toEqual([])
    })

    it('parses pipe-separated numeric order types', () => {
      expect(parseUnaddressedOrderTypes('2|5|7')).toEqual([2, 5, 7])
    })

    it('filters non-finite values', () => {
      expect(parseUnaddressedOrderTypes('2|x|5')).toEqual([2, 5])
    })
  })

  describe('resolveUnaddressedOrderTypes', () => {
    it('is the parsed config without options, and tolerates a missing value', () => {
      expect(resolveUnaddressedOrderTypes('2|5')).toEqual([2, 5])
      expect(resolveUnaddressedOrderTypes(undefined)).toEqual([])
      expect(resolveUnaddressedOrderTypes('', {})).toEqual([])
    })

    it('adds pickup when pickupWithoutAddress is on, without duplicates', () => {
      expect(resolveUnaddressedOrderTypes('3', { pickupWithoutAddress: true })).toEqual([3, 2])
      expect(resolveUnaddressedOrderTypes('2|3', { pickupWithoutAddress: true })).toEqual([2, 3])
      expect(resolveUnaddressedOrderTypes('3', { pickupWithoutAddress: false })).toEqual([3])
    })

    it('adds the extra types, without duplicates', () => {
      expect(resolveUnaddressedOrderTypes('2|3', { extraUnaddressedOrderTypes: [2, 3, 4, 5] })).toEqual([2, 3, 4, 5])
      expect(resolveUnaddressedOrderTypes('', { pickupWithoutAddress: true, extraUnaddressedOrderTypes: [2, 8] })).toEqual([2, 8])
    })

    it('ignores an extras value that is not an array', () => {
      expect(resolveUnaddressedOrderTypes('3', { extraUnaddressedOrderTypes: null })).toEqual([3])
    })
  })

  describe('orderTypeRequiresAddress', () => {
    it('returns false when orderType is missing', () => {
      expect(orderTypeRequiresAddress(null, [2])).toBe(false)
    })

    it('returns false when order type is unaddressed', () => {
      expect(orderTypeRequiresAddress('2', [2, 5])).toBe(false)
      expect(orderTypeRequiresAddress(2, [2, 5])).toBe(false)
    })

    it('returns true when order type requires address', () => {
      expect(orderTypeRequiresAddress(1, [2, 5])).toBe(true)
    })
  })

  describe('hasOrderAddress', () => {
    it('returns false when lat/lng are missing', () => {
      expect(hasOrderAddress({})).toBe(false)
      expect(hasOrderAddress({ address: {} })).toBe(false)
      expect(hasOrderAddress({ address: { location: { lat: 1 } } })).toBe(false)
    })

    it('returns true when lat and lng exist', () => {
      expect(hasOrderAddress({
        address: { location: { lat: 40.7, lng: -74.0 } }
      })).toBe(true)
    })
  })

  describe('shouldRequireOrderAddress', () => {
    it('requires address when type needs it and none is set', () => {
      expect(shouldRequireOrderAddress(1, {}, [2])).toBe(true)
    })

    it('does not require address when type is unaddressed', () => {
      expect(shouldRequireOrderAddress(2, {}, [2])).toBe(false)
    })

    it('does not require address when one is already set', () => {
      expect(shouldRequireOrderAddress(1, {
        address: { location: { lat: 1, lng: 2 } }
      }, [])).toBe(false)
    })
  })
})
