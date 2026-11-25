import { describe, it, expect } from 'vitest'
import { getMaxProductAmount } from '../maxProductAmount'

describe('getMaxProductAmount', () => {
  it('reads the value of the setting', () => {
    expect(getMaxProductAmount({ max_product_amount: { value: '5' } })).toBe(5)
    expect(getMaxProductAmount({ max_product_amount: { value: 12 } })).toBe(12)
  })

  it('is 100 when the setting is missing or not a number', () => {
    expect(getMaxProductAmount()).toBe(100)
    expect(getMaxProductAmount({})).toBe(100)
    expect(getMaxProductAmount({ max_product_amount: {} })).toBe(100)
    expect(getMaxProductAmount({ max_product_amount: { value: '' } })).toBe(100)
    expect(getMaxProductAmount({ max_product_amount: { value: 'abc' } })).toBe(100)
  })
})
