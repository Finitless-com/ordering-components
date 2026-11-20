import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const cart = vi.hoisted(() => {
  const { createCartCheckoutTestContext } = require('../../../__tests__/helpers/cartCheckoutTestHelpers')
  return createCartCheckoutTestContext(vi)
})

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    user: { id: 8 },
    token: 'session-tok'
  }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [cart.mockOrderState, {
    refreshOrderOptions: cart.mockRefreshOrderOptions
  }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [cart.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-14' })
}))

import { MultiCartCreate } from '../index'

describe('MultiCartCreate', () => {
  beforeEach(() => cart.reset())

  it('passes props through to UI', async () => {
    renderController(MultiCartCreate, { loadingLabel: 'Creating carts' })
    expect(lastControllerProps.loadingLabel).toBe('Creating carts')
  })

  it.each([
    {},
    { a: { uuid: 'invalid', valid: false, status: 0, business_id: 5 } },
    { a: { uuid: 'pending', valid: true, status: 2, business_id: 5 } }
  ])('does not create a group without eligible carts (%j)', (carts) => {
    cart.mockOrderState.carts = carts
    renderController(MultiCartCreate)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('reports a group response without a UUID and stays on the current route', async () => {
    cart.mockOrderState.carts = {
      a: { uuid: 'cart-uuid-5', valid: true, status: 0, business_id: 5 },
      b: { uuid: 'cart-uuid-6', valid: true, status: 0, business_id: 6 }
    }
    global.fetch.mockResolvedValueOnce({ json: async () => ({ error: false, result: {} }) })
    const handleOnRedirectMultiCheckout = vi.fn()
    renderController(MultiCartCreate, { handleOnRedirectMultiCheckout })
    await waitFor(() => expect(lastControllerProps.groupCreationFailed).toBe(true))
    expect(cart.mockRefreshOrderOptions).not.toHaveBeenCalled()
    expect(handleOnRedirectMultiCheckout).not.toHaveBeenCalled()
  })

  it('redirects to single checkout when only one valid cart exists', async () => {
    cart.mockOrderState.carts = {
      'businessId:5': { uuid: 'cart-uuid-5', valid: true, status: 0, business_id: 5 }
    }
    const handleOnRedirectCheckout = vi.fn()
    const handleOnRedirectMultiCheckout = vi.fn()
    renderController(MultiCartCreate, {
      handleOnRedirectCheckout,
      handleOnRedirectMultiCheckout
    })
    await waitFor(() => {
      expect(handleOnRedirectCheckout).toHaveBeenCalledWith('cart-uuid-5')
    })
    expect(cart.mockRefreshOrderOptions).toHaveBeenCalled()
  })

  it('creates cart group and redirects for multiple carts', async () => {
    cart.mockOrderState.carts = {
      'businessId:5': { uuid: 'cart-uuid-5', valid: true, status: 0, business_id: 5 },
      'businessId:6': { uuid: 'cart-uuid-6', valid: true, status: 0, business_id: 6 }
    }
    const handleOnRedirectMultiCheckout = vi.fn()
    renderController(MultiCartCreate, { handleOnRedirectMultiCheckout })
    await waitFor(() => {
      expect(handleOnRedirectMultiCheckout).toHaveBeenCalledWith('group-uuid-1')
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/cart_groups',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
