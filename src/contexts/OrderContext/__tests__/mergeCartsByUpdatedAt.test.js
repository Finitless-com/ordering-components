import { describe, expect, it } from 'vitest'
import {
  mergeCartResult,
  mergeCartsByUpdatedAt,
  mergeCartsFromList,
  resolveOrderOptionsCarts
} from '../mergeCartsByUpdatedAt'

const olderCart = {
  business_id: 5,
  comment: 'No onions',
  products: [{ id: 1 }],
  updated_at: '2026-08-25 12:00:00'
}

const newerCart = {
  business_id: 5,
  comment: '',
  products: [{ id: 1 }, { id: 2 }],
  updated_at: '2026-08-25 12:01:00'
}

describe('mergeCartsByUpdatedAt', () => {
  it('keeps a newer add/remove when an older comment cart arrives', () => {
    const prev = { 'businessId:5': newerCart }
    const next = mergeCartsByUpdatedAt(prev, { 'businessId:5': olderCart })

    expect(next['businessId:5']).toBe(newerCart)
    expect(next['businessId:5'].products).toHaveLength(2)
  })

  it('applies a newer comment cart over a stale local snapshot', () => {
    const prev = { 'businessId:5': olderCart }
    const next = mergeCartsByUpdatedAt(prev, { 'businessId:5': newerCart })

    expect(next['businessId:5']).toBe(newerCart)
  })

  it('does not drop other business carts from the current map', () => {
    const other = { business_id: 6, updated_at: '2026-08-25 12:02:00' }
    const prev = {
      'businessId:5': newerCart,
      'businessId:6': other
    }
    const next = mergeCartsByUpdatedAt(prev, { 'businessId:5': olderCart })

    expect(next['businessId:6']).toBe(other)
    expect(next['businessId:5']).toBe(newerCart)
  })

  it('takes the incoming cart when timestamps are missing', () => {
    const prev = { 'businessId:5': { business_id: 5, products: [{ id: 1 }] } }
    const incoming = { business_id: 5, comment: 'No onions' }
    const next = mergeCartsByUpdatedAt(prev, { 'businessId:5': incoming })

    expect(next['businessId:5']).toBe(incoming)
  })
})

describe('mergeCartResult', () => {
  it('merges a single cart by business id without replacing the map', () => {
    const other = { business_id: 6, updated_at: '2026-08-25 12:02:00' }
    const next = mergeCartResult(
      { 'businessId:5': newerCart, 'businessId:6': other },
      olderCart
    )

    expect(next['businessId:5']).toBe(newerCart)
    expect(next['businessId:6']).toBe(other)
  })
})

describe('mergeCartsFromList', () => {
  it('keeps a newer local cart when a stale options list arrives', () => {
    const other = { business_id: 6, updated_at: '2026-08-25 12:02:00' }
    const next = mergeCartsFromList(
      { 'businessId:5': newerCart, 'businessId:6': other },
      [olderCart]
    )

    expect(next['businessId:5']).toBe(newerCart)
    expect(next['businessId:6']).toBe(other)
  })

  it('keeps carts omitted from the API or socket list', () => {
    const added = {
      business_id: 7,
      products: [{ id: 9 }],
      updated_at: '2026-08-25 12:03:00'
    }
    const next = mergeCartsFromList(
      { 'businessId:5': newerCart, 'businessId:7': added },
      [olderCart]
    )

    expect(next['businessId:7']).toBe(added)
    expect(next['businessId:5']).toBe(newerCart)
  })
})

describe('resolveOrderOptionsCarts', () => {
  it('skips a non-array payload so loading can clear without dropping carts', () => {
    const prev = { 'businessId:5': newerCart }
    const resolved = resolveOrderOptionsCarts(prev, null)

    expect(resolved.apply).toBe(false)
    expect(resolved.carts).toBe(prev)
  })

  it('merges an array payload against current carts', () => {
    const resolved = resolveOrderOptionsCarts(
      { 'businessId:5': newerCart },
      [olderCart]
    )

    expect(resolved.apply).toBe(true)
    expect(resolved.carts['businessId:5']).toBe(newerCart)
  })
})
