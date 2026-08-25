import { describe, expect, it } from 'vitest'
import { isUnchangedDriverTip } from '../isUnchangedDriverTip'

describe('isUnchangedDriverTip', () => {
  it('does not skip a fixed dollar tip that matches a leftover percent rate', () => {
    const cart = { driver_tip_rate: 15, driver_tip: 1.5 }
    expect(isUnchangedDriverTip(cart, 15, true)).toBe(false)
  })

  it('does not skip a fixed $0 when driver_tip is still non-zero and rate is 0', () => {
    const cart = { driver_tip_rate: 0, driver_tip: 3 }
    expect(isUnchangedDriverTip(cart, 0, true)).toBe(false)
  })

  it('skips when the percent rate is unchanged', () => {
    const cart = { driver_tip_rate: 15, driver_tip: 1.5 }
    expect(isUnchangedDriverTip(cart, 15, false)).toBe(true)
  })

  it('skips when the fixed dollar amount is unchanged', () => {
    const cart = { driver_tip_rate: 0, driver_tip: 15 }
    expect(isUnchangedDriverTip(cart, 15, true)).toBe(true)
  })

  it('skips when the cart is missing', () => {
    expect(isUnchangedDriverTip(undefined, 15, true)).toBe(true)
    expect(isUnchangedDriverTip(null, 10, false)).toBe(true)
  })
})
