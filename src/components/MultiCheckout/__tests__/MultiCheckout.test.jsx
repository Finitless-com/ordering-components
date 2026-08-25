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

import { MultiCheckout } from '../index'

describe('MultiCheckout', () => {
  beforeEach(() => cart.reset())

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
})
