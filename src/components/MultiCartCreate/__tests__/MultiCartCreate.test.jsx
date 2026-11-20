import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
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

  it.each(['undefined', ' null ', '   '])('excludes a cart with identifier %j from checkout', (uuid) => {
    cart.mockOrderState.carts = {
      a: { uuid, valid: true, status: 0, business_id: 5 }
    }
    const handleOnRedirectCheckout = vi.fn()
    renderController(MultiCartCreate, { handleOnRedirectCheckout })
    expect(handleOnRedirectCheckout).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('only redirects to the normalized identifier when one of two carts is usable', () => {
    cart.mockOrderState.carts = {
      a: { uuid: 'undefined', valid: true, status: 0, business_id: 5 },
      b: { uuid: ' cart-uuid-6 ', valid: true, status: 0, business_id: 6 }
    }
    const handleOnRedirectCheckout = vi.fn()
    renderController(MultiCartCreate, { handleOnRedirectCheckout })
    expect(handleOnRedirectCheckout).toHaveBeenCalledExactlyOnceWith('cart-uuid-6')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it.each([undefined, 'undefined', ' null ', '  '])('rejects an unusable group UUID (%s) and stays on the current route', async (uuid) => {
    cart.mockOrderState.carts = {
      a: { uuid: 'cart-uuid-5', valid: true, status: 0, business_id: 5 },
      b: { uuid: 'cart-uuid-6', valid: true, status: 0, business_id: 6 }
    }
    global.fetch.mockResolvedValueOnce({ json: async () => ({ error: false, result: { uuid } }) })
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
    expect(global.fetch).not.toHaveBeenCalled()
    expect(cart.mockRefreshOrderOptions).not.toHaveBeenCalled()
    expect(handleOnRedirectCheckout).toHaveBeenCalledTimes(1)
    expect(handleOnRedirectMultiCheckout).not.toHaveBeenCalled()
  })

  it.each(['creation', 'refresh'])('does not navigate after unmount during %s', async (phase) => {
    cart.mockOrderState.carts = {
      a: { uuid: 'cart-uuid-5', valid: true, status: 0, business_id: 5 },
      b: { uuid: 'cart-uuid-6', valid: true, status: 0, business_id: 6 }
    }
    let finish
    const pending = new Promise(resolve => { finish = resolve })
    const groupResponse = { json: async () => ({ error: false, result: { uuid: 'group-uuid-1' } }) }
    if (phase === 'creation') global.fetch.mockReturnValueOnce(pending)
    else cart.mockRefreshOrderOptions.mockReturnValueOnce(pending)

    const handleOnRedirectMultiCheckout = vi.fn()
    const { unmount } = renderController(MultiCartCreate, { handleOnRedirectMultiCheckout })
    const pendingCall = phase === 'creation' ? global.fetch : cart.mockRefreshOrderOptions
    await waitFor(() => expect(pendingCall).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => { finish(phase === 'creation' ? groupResponse : true) })
    expect(handleOnRedirectMultiCheckout).not.toHaveBeenCalled()
  })

  it('retries a malformed refresh without reposting the persisted group', async () => {
    cart.mockOrderState.carts = {
      a: { uuid: 'cart-uuid-5', valid: true, status: 0, business_id: 5 },
      b: { uuid: 'cart-uuid-6', valid: true, status: 0, business_id: 6 }
    }
    cart.mockRefreshOrderOptions
      .mockResolvedValueOnce({ invalidResponse: true })
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const handleOnRedirectMultiCheckout = vi.fn()
    renderController(MultiCartCreate, { handleOnRedirectMultiCheckout, recoverMalformedRefresh: true })

    await waitFor(() => expect(lastControllerProps.onRetryRefresh).toEqual(expect.any(Function)))
    expect(handleOnRedirectMultiCheckout).not.toHaveBeenCalled()
    await act(async () => {
      await lastControllerProps.onRetryRefresh()
    })
    expect(handleOnRedirectMultiCheckout).not.toHaveBeenCalled()
    await act(async () => {
      await lastControllerProps.onRetryRefresh()
    })
    expect(cart.mockRefreshOrderOptions).toHaveBeenCalledTimes(3)
    expect(cart.mockRefreshOrderOptions).toHaveBeenLastCalledWith({ deferMalformedResponse: true, recovering: true })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(handleOnRedirectMultiCheckout).toHaveBeenCalledExactlyOnceWith('group-uuid-1')
  })

  it('creates cart group and redirects for multiple carts', async () => {
    cart.mockOrderState.carts = {
      'businessId:5': { uuid: 'cart-uuid-5', valid: true, status: 0, business_id: 5 },
      'businessId:6': { uuid: 'cart-uuid-6', valid: true, status: 0, business_id: 6 },
      'businessId:7': { uuid: 'undefined', valid: true, status: 0, business_id: 7 }
    }
    const handleOnRedirectMultiCheckout = vi.fn()
    renderController(MultiCartCreate, { handleOnRedirectMultiCheckout })
    await waitFor(() => {
      expect(handleOnRedirectMultiCheckout).toHaveBeenCalledWith('group-uuid-1')
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/cart_groups',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ carts: ['cart-uuid-5', 'cart-uuid-6'] }) })
    )
  })
})
