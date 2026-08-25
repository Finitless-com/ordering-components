import { describe, expect, it } from 'vitest'
import { getPlaceAmount } from '../placeAmount'

describe('getPlaceAmount', () => {
  it('uses remaining balance when a wallet covered part of the total', () => {
    expect(getPlaceAmount({ total: 40, balance: 10 })).toBe(10)
  })

  it('keeps a zero remainder when the wallet covers the full total', () => {
    expect(getPlaceAmount({ total: 40, balance: 0 })).toBe(0)
  })

  it('falls back to total when balance is missing', () => {
    expect(getPlaceAmount({ total: 40 })).toBe(40)
    expect(getPlaceAmount({ total: 40, balance: null })).toBe(40)
  })
})
