import { describe, expect, it } from 'vitest'
import { isBlockingApplePayConfirmError } from '../applePayConfirm'

describe('isBlockingApplePayConfirmError', () => {
  it('blocks a real Apple Pay confirm error', () => {
    expect(isBlockingApplePayConfirmError({ message: 'Card declined' })).toBe(true)
  })

  it('blocks a confirm error that only has localizedMessage', () => {
    expect(isBlockingApplePayConfirmError({ localizedMessage: 'Payment failed' })).toBe(true)
  })

  it('does not block the missing applePay parameter workaround', () => {
    expect(isBlockingApplePayConfirmError({
      message: 'You must provide the `applePay` parameter.'
    })).toBe(false)
  })

  it('does not block a successful confirm', () => {
    expect(isBlockingApplePayConfirmError(null)).toBe(false)
    expect(isBlockingApplePayConfirmError(undefined)).toBe(false)
  })
})
