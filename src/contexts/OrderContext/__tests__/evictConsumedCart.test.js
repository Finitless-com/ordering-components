import { describe, expect, it } from 'vitest'
import { evictConsumedCart } from '../evictConsumedCart'

const paypalCart = {
  uuid: 'cart-paypal',
  business_id: 12,
  status: 2,
  products: [{ id: 1 }]
}

const otherCart = {
  uuid: 'cart-other',
  business_id: 99,
  status: 0,
  products: [{ id: 2 }]
}

const carts = {
  'businessId:12': paypalCart,
  'businessId:99': otherCart
}

describe('evictConsumedCart', () => {
  it('evicts the confirmed uuid when status is 1', () => {
    const next = evictConsumedCart(carts, {
      cartUuid: 'cart-paypal',
      error: false,
      result: { status: 1, business_id: 12 }
    })

    expect(next['businessId:12']).toBeUndefined()
    expect(next['businessId:99']).toBe(otherCart)
  })

  it('evicts the confirmed uuid when result includes an order', () => {
    const next = evictConsumedCart(carts, {
      cartUuid: 'cart-paypal',
      error: false,
      result: { status: 2, order: { uuid: 'order-1' }, business_id: 12 }
    })

    expect(next['businessId:12']).toBeUndefined()
    expect(next['businessId:99']).toBe(otherCart)
  })

  it('evicts the confirmed uuid when the API says the cart is already gone', () => {
    const next = evictConsumedCart(carts, {
      cartUuid: 'cart-paypal',
      error: true,
      result: ['ERROR_YOU_HAVE_NOT_CART']
    })

    expect(next['businessId:12']).toBeUndefined()
    expect(next['businessId:99']).toBe(otherCart)
  })

  it('evicts when the translated missing-cart message is returned', () => {
    const next = evictConsumedCart(carts, {
      cartUuid: 'cart-paypal',
      error: true,
      result: ['You do not have a cart']
    })

    expect(next['businessId:12']).toBeUndefined()
    expect(next['businessId:99']).toBe(otherCart)
  })

  it('keeps the cart on cancel, network, or payment failure', () => {
    const next = evictConsumedCart(carts, {
      cartUuid: 'cart-paypal',
      error: true,
      result: ['Network error']
    })

    expect(next['businessId:12']).toBe(paypalCart)
    expect(next['businessId:99']).toBe(otherCart)
  })

  it('keeps a pending cart when confirm succeeds without completing it', () => {
    const next = evictConsumedCart(carts, {
      cartUuid: 'cart-paypal',
      error: false,
      result: { status: 2, business_id: 12 }
    })

    expect(next['businessId:12']).toBe(paypalCart)
    expect(next['businessId:99']).toBe(otherCart)
  })

  it('does not evict another business cart when uuids do not match', () => {
    const next = evictConsumedCart(carts, {
      cartUuid: 'missing-uuid',
      error: false,
      result: { status: 1, business_id: 12 }
    })

    expect(next['businessId:12']).toBe(paypalCart)
    expect(next['businessId:99']).toBe(otherCart)
  })
})
