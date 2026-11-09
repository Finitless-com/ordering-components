import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const cart = vi.hoisted(() => {
  const { createCartCheckoutTestContext } = require('../../../__tests__/helpers/cartCheckoutTestHelpers')
  return createCartCheckoutTestContext(vi)
})

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false, language: { code: 'en' } }, (key, fallback) => fallback || key]
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => [[], { showToast: cart.mockShowToast }],
  ToastType: { error: 'error', success: 'success', info: 'info' }
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    user: { id: 8 },
    token: 'session-tok'
  }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [cart.mockOrderState, {
    placeMultiCarts: cart.mockPlaceMultiCarts
  }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [cart.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-14' })
}))

const referral = vi.hoisted(() => ({
  getReferralCode: vi.fn(),
  consumeReferralCode: vi.fn()
}))

vi.mock('../../../contexts/ReferralContext', () => ({
  useReferral: () => [{ referralCode: null }, {
    getReferralCode: referral.getReferralCode,
    consumeReferralCode: referral.consumeReferralCode
  }]
}))

import { MultiCheckout } from '../index'

describe('MultiCheckout', () => {
  beforeEach(() => {
    cart.reset()
    referral.getReferralCode.mockResolvedValue(null)
    referral.consumeReferralCode.mockResolvedValue(undefined)
  })

  it('loads cart group on mount', async () => {
    renderController(MultiCheckout, { cartUuid: 'group-uuid-1' })
    await waitFor(() => {
      expect(lastControllerProps.cartGroup.result?.uuid).toBe('group-uuid-1')
    })
    expect(lastControllerProps.totalCartsPrice).toBe(40)
  })

  it('selects paymethod for group checkout', async () => {
    renderController(MultiCheckout, { cartUuid: 'group-uuid-1' })
    await waitFor(() => expect(lastControllerProps.cartGroup.loading).toBe(false))
    lastControllerProps.handleSelectPaymethod({ id: 4, gateway: 'cash', paymethod_data: { token: 'abc' } })
    await waitFor(() => {
      expect(lastControllerProps.paymethodSelected.id).toBe(4)
    })
  })

  it('does not treat Apple Pay as placed when confirmPayment fails', async () => {
    cart.mockPlaceMultiCarts.mockResolvedValue({
      error: false,
      result: {
        status: 'completed',
        id: 99,
        payment_events: [{ data: { extra: { client_secret: 'secret_group' } } }]
      }
    })
    const onPlaceOrderClick = vi.fn()
    const confirmPayment = vi.fn().mockResolvedValue({ error: { message: 'Card declined' } })
    renderController(MultiCheckout, {
      cartUuid: 'group-uuid-1',
      onPlaceOrderClick
    })
    await waitFor(() => expect(lastControllerProps.cartGroup.loading).toBe(false))
    lastControllerProps.handleSelectPaymethod({
      gateway: 'global_apple_pay',
      paymethod: { id: 9, gateway: 'global_apple_pay' }
    })
    await waitFor(() => {
      expect(lastControllerProps.paymethodSelected.gateway).toBe('global_apple_pay')
    })
    await lastControllerProps.handleGroupPlaceOrder(confirmPayment)
    expect(confirmPayment).toHaveBeenCalledWith('secret_group')
    expect(onPlaceOrderClick).not.toHaveBeenCalled()
  })

  it('calls onPlaceOrderClick once after a successful Apple Pay confirm', async () => {
    cart.mockPlaceMultiCarts.mockResolvedValue({
      error: false,
      result: {
        status: 'completed',
        id: 99,
        payment_events: [{ data: { extra: { client_secret: 'secret_group' } } }]
      }
    })
    const onPlaceOrderClick = vi.fn()
    const confirmPayment = vi.fn().mockResolvedValue({ error: null })
    renderController(MultiCheckout, {
      cartUuid: 'group-uuid-1',
      onPlaceOrderClick
    })
    await waitFor(() => expect(lastControllerProps.cartGroup.loading).toBe(false))
    lastControllerProps.handleSelectPaymethod({
      gateway: 'global_apple_pay',
      paymethod: { id: 9, gateway: 'global_apple_pay' }
    })
    await waitFor(() => {
      expect(lastControllerProps.paymethodSelected.gateway).toBe('global_apple_pay')
    })
    await lastControllerProps.handleGroupPlaceOrder(confirmPayment)
    expect(onPlaceOrderClick).toHaveBeenCalledTimes(1)
  })

  it('prices every cart with the referral code before placing the group', async () => {
    referral.getReferralCode.mockResolvedValue('REF123')
    cart.mockCartSet.mockResolvedValue({
      content: {
        error: false,
        result: { uuid: 'cart-uuid-5', business_id: 5 },
        referral_attribution: { accepted: true, error_code: null }
      }
    })
    const baseFetch = global.fetch
    let groupGets = 0
    global.fetch = vi.fn(async (url, options = {}) => {
      const isGroup = String(url).includes('/cart_groups/group-uuid-1') && !String(url).includes('prepare') && (options.method || 'GET') === 'GET'
      if (isGroup) {
        groupGets += 1
        if (groupGets > 1) {
          return {
            json: async () => ({
              error: false,
              result: {
                uuid: 'group-uuid-1',
                balance: 33,
                carts: [
                  { uuid: 'cart-uuid-5', business_id: 5, valid: true, status: 0, total: 18, balance: 18, referral: { name: 'Referral', applied: true, notice: null } },
                  { uuid: 'cart-uuid-6', business_id: 6, valid: true, status: 0, total: 15, balance: 15, referral: { notice: null } }
                ]
              }
            })
          }
        }
      }
      return baseFetch(url, options)
    })

    renderController(MultiCheckout, { cartUuid: 'group-uuid-1', onPlaceOrderClick: vi.fn() })
    await waitFor(() => expect(cart.mockCartSet).toHaveBeenCalledWith({ referral_code: 'REF123' }))
    await waitFor(() => expect(lastControllerProps.cartGroup.result?.balance).toBe(33))
    expect(referral.consumeReferralCode).toHaveBeenCalled()
    expect(lastControllerProps.referralLines[0].name).toBe('Referral')

    await lastControllerProps.handleGroupPlaceOrder()
    const payload = cart.mockPlaceMultiCarts.mock.calls.at(-1)[0]
    expect(payload.amount).toBe(33)
    expect(payload).not.toHaveProperty('referral_code')
    expect(cart.mockCartSet).toHaveBeenCalledTimes(2)
  })

  it('places multi-cart order on success', async () => {
    const onPlaceOrderClick = vi.fn()
    renderController(MultiCheckout, {
      cartUuid: 'group-uuid-1',
      onPlaceOrderClick
    })
    await waitFor(() => expect(lastControllerProps.cartGroup.loading).toBe(false))
    lastControllerProps.handleSelectPaymethod({ paymethod: { id: 4, gateway: 'cash' } })
    await lastControllerProps.handleGroupPlaceOrder()
    expect(cart.mockPlaceMultiCarts).toHaveBeenCalled()
    expect(onPlaceOrderClick).toHaveBeenCalled()
  })

  it('places a braintree multi-cart order without Forter fields or a client IP lookup', async () => {
    const getForterToken = vi.fn(() => 'forter-tok')
    const getForterMobileUid = vi.fn(() => 'forter-uid')
    renderController(MultiCheckout, {
      cartUuid: 'group-uuid-1',
      onPlaceOrderClick: vi.fn(),
      getForterToken,
      getForterMobileUid
    })
    await waitFor(() => expect(lastControllerProps.cartGroup.loading).toBe(false))
    lastControllerProps.handleSelectPaymethod({ paymethod: { id: 31, gateway: 'braintree' }, paymethod_data: { nonce: 'bt-nonce' } })
    await waitFor(() => expect(lastControllerProps.paymethodSelected.paymethod?.id).toBe(31))
    const fetchSpy = vi.spyOn(global, 'fetch')
    await lastControllerProps.handleGroupPlaceOrder()
    expect(cart.mockPlaceMultiCarts).toHaveBeenCalledWith(
      expect.objectContaining({ paymethod_id: 31 }),
      'group-uuid-1'
    )
    const payload = cart.mockPlaceMultiCarts.mock.calls[0][0]
    expect(payload).not.toHaveProperty('forter_token')
    expect(payload).not.toHaveProperty('forter_mobile_uid')
    expect(payload).not.toHaveProperty('customer_ip')
    expect(getForterToken).not.toHaveBeenCalled()
    expect(getForterMobileUid).not.toHaveBeenCalled()
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('ipify'))).toBe(false)
    fetchSpy.mockRestore()
  })

  it('places multi-cart with remaining group balance', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn(async (url, options = {}) => {
      if (String(url).includes('/cart_groups/group-uuid-1') && !String(url).includes('prepare') && (options.method || 'GET') === 'GET') {
        return {
          json: async () => ({
            error: false,
            result: {
              uuid: 'group-uuid-1',
              balance: 10,
              total: 40,
              carts: [
                { uuid: 'cart-uuid-5', business_id: 5, valid: true, status: 0, total: 25, delivery_price_with_discount: 2 },
                { uuid: 'cart-uuid-6', business_id: 6, valid: true, status: 0, total: 15, delivery_price_with_discount: 1 }
              ]
            }
          })
        }
      }
      return originalFetch(url, options)
    })
    renderController(MultiCheckout, { cartUuid: 'group-uuid-1', onPlaceOrderClick: vi.fn() })
    await waitFor(() => expect(lastControllerProps.cartGroup.loading).toBe(false))
    lastControllerProps.handleSelectPaymethod({ paymethod: { id: 4, gateway: 'cash' } })
    await waitFor(() => expect(lastControllerProps.paymethodSelected.paymethod?.id).toBe(4))
    await lastControllerProps.handleGroupPlaceOrder()
    expect(cart.mockPlaceMultiCarts).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10 }),
      'group-uuid-1'
    )
  })

  it('places multi-cart with total when group balance is missing', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn(async (url, options = {}) => {
      if (String(url).includes('/cart_groups/group-uuid-1') && !String(url).includes('prepare') && (options.method || 'GET') === 'GET') {
        return {
          json: async () => ({
            error: false,
            result: {
              uuid: 'group-uuid-1',
              total: 40,
              carts: [
                { uuid: 'cart-uuid-5', business_id: 5, valid: true, status: 0, total: 25, delivery_price_with_discount: 2 },
                { uuid: 'cart-uuid-6', business_id: 6, valid: true, status: 0, total: 15, delivery_price_with_discount: 1 }
              ]
            }
          })
        }
      }
      return originalFetch(url, options)
    })
    renderController(MultiCheckout, { cartUuid: 'group-uuid-1', onPlaceOrderClick: vi.fn() })
    await waitFor(() => expect(lastControllerProps.cartGroup.loading).toBe(false))
    lastControllerProps.handleSelectPaymethod({ paymethod: { id: 4, gateway: 'cash' } })
    await waitFor(() => expect(lastControllerProps.paymethodSelected.paymethod?.id).toBe(4))
    await lastControllerProps.handleGroupPlaceOrder()
    expect(cart.mockPlaceMultiCarts).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 40 }),
      'group-uuid-1'
    )
  })
})
