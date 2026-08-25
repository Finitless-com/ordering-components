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

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [cart.mockConfigState, { refreshConfigs: vi.fn() }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [cart.mockOrderState, {
    setStateValues: cart.mockSetStateValues,
    placeCart: cart.mockPlaceCart,
    refreshOrderOptions: cart.mockRefreshOrderOptions
  }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [cart.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-14' })
}))

import { Checkout } from '../index'

describe('Checkout', () => {
  beforeEach(() => cart.reset())

  it('loads business details on mount', async () => {
    renderController(Checkout, { businessId: 5 })
    await waitFor(() => {
      expect(lastControllerProps.businessDetails.loading).toBe(false)
    })
    expect(cart.mockBusinessGet).toHaveBeenCalled()
  })

  it('updates selected paymethod', async () => {
    renderController(Checkout, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    lastControllerProps.handlePaymethodChange({ paymethodId: 3, gateway: 'cash' })
    await waitFor(() => {
      expect(lastControllerProps.paymethodSelected.paymethodId).toBe(3)
    })
  })

  it('places order through order context', async () => {
    const onPlaceOrderClick = vi.fn()
    renderController(Checkout, {
      businessId: 5,
      onPlaceOrderClick
    })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    lastControllerProps.handlePaymethodChange({ paymethodId: 3, gateway: 'cash', data: {} })
    await lastControllerProps.handlerClickPlaceOrder({}, {}, null, null, lastControllerProps.paymethodSelected)
    expect(cart.mockPlaceCart).toHaveBeenCalledWith('cart-uuid-5', expect.any(Object))
    expect(onPlaceOrderClick).toHaveBeenCalled()
  })

  it('updates delivery option on cart', async () => {
    renderController(Checkout, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    await lastControllerProps.handleChangeDeliveryOption(2)
    await waitFor(() => {
      expect(lastControllerProps.deliveryOptionSelected).toBe(2)
    })
    expect(cart.mockSetStateValues).toHaveBeenCalled()
  })

  it('does not treat Apple Pay as placed when confirmPayment fails', async () => {
    cart.mockPlaceCart.mockResolvedValue({
      error: false,
      result: {
        uuid: 'cart-uuid-5',
        status: 1,
        paymethod_data: {
          gateway: 'apple_pay',
          result: { client_secret: 'secret_apple' }
        }
      }
    })
    const onPlaceOrderClick = vi.fn()
    const confirmPayment = vi.fn().mockResolvedValue({ error: { message: 'Card declined' } })
    renderController(Checkout, {
      businessId: 5,
      onPlaceOrderClick
    })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    const applePaymethod = { paymethodId: 9, paymethod: { gateway: 'apple_pay' }, data: {} }
    lastControllerProps.handlePaymethodChange(applePaymethod)
    await lastControllerProps.handlerClickPlaceOrder({}, {}, confirmPayment, null, applePaymethod)
    expect(confirmPayment).toHaveBeenCalledWith('secret_apple')
    expect(onPlaceOrderClick).not.toHaveBeenCalled()
  })

  it('still places when Apple Pay confirm only reports the missing applePay parameter', async () => {
    cart.mockPlaceCart.mockResolvedValue({
      error: false,
      result: {
        uuid: 'cart-uuid-5',
        status: 1,
        paymethod_data: {
          gateway: 'apple_pay',
          result: { client_secret: 'secret_apple' }
        }
      }
    })
    const onPlaceOrderClick = vi.fn()
    const confirmPayment = vi.fn().mockResolvedValue({
      error: { message: 'You must provide the `applePay` parameter.' }
    })
    renderController(Checkout, {
      businessId: 5,
      onPlaceOrderClick
    })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    const applePaymethod = { paymethodId: 9, paymethod: { gateway: 'apple_pay' }, data: {} }
    await lastControllerProps.handlerClickPlaceOrder({}, {}, confirmPayment, null, applePaymethod)
    expect(onPlaceOrderClick).toHaveBeenCalled()
  })

  it('blocks duplicate place order while checkout is in progress', async () => {
    cart.mockPlaceCart.mockImplementationOnce(() => new Promise(() => {}))
    const onPlaceOrderClick = vi.fn()
    renderController(Checkout, {
      businessId: 5,
      onPlaceOrderClick
    })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    lastControllerProps.handlePaymethodChange({ paymethodId: 3, gateway: 'cash', data: {} })
    lastControllerProps.handlerClickPlaceOrder({}, {}, null, null, lastControllerProps.paymethodSelected)
    await waitFor(() => {
      expect(lastControllerProps.placing).toBe(true)
    })
    lastControllerProps.handlerClickPlaceOrder({}, {}, null, null, lastControllerProps.paymethodSelected)
    expect(cart.mockShowToast).toHaveBeenCalled()
  })
})
