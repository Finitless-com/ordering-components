import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController } from '../../../__tests__/helpers/renderController'

const cart = vi.hoisted(() => {
  const { createCartCheckoutTestContext } = require('../../../__tests__/helpers/cartCheckoutTestHelpers')
  return createCartCheckoutTestContext(vi)
})

const mockConfirmCart = vi.hoisted(() => vi.fn())

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
    confirmCart: mockConfirmCart,
    refreshOrderOptions: cart.mockRefreshOrderOptions
  }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [cart.mockOrdering]
}))

const sockets = vi.hoisted(() => ({ current: null }))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => sockets.current
}))

import { Checkout } from '../index'

// The OrderContext listens to carts_update first; the controller only piggy-backs on it
const createSocket = () => {
  const socket = {
    getId: () => 'socket-14',
    socket: { _callbacks: { $carts_update: [() => {}] } },
    on: vi.fn(),
    off: vi.fn()
  }
  return socket
}

describe('Checkout carts_update listener', () => {
  beforeEach(() => {
    cart.reset()
    sockets.current = createSocket()
  })

  it('registers when another carts_update listener exists and removes that same handler on unmount, even if the other listener is gone by then', async () => {
    const view = renderController(Checkout, { businessId: 5, isListenOrderUpdate: true })
    await waitFor(() => expect(sockets.current.on).toHaveBeenCalledWith('carts_update', expect.any(Function)))
    const handler = sockets.current.on.mock.calls.find(([event]) => event === 'carts_update')[1]
    // the OrderContext listener is removed before this controller unmounts
    delete sockets.current.socket._callbacks.$carts_update
    view.unmount()
    expect(sockets.current.off).toHaveBeenCalledWith('carts_update', handler)
  })

  it('does not register, and does not call off, when there is no other carts_update listener', async () => {
    delete sockets.current.socket._callbacks.$carts_update
    const view = renderController(Checkout, { businessId: 5, isListenOrderUpdate: true })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(sockets.current.on).not.toHaveBeenCalledWith('carts_update', expect.any(Function))
    view.unmount()
    expect(sockets.current.off).not.toHaveBeenCalledWith('carts_update', expect.any(Function))
  })

  it('does not register when the controller is not listening for order updates', async () => {
    const view = renderController(Checkout, { businessId: 5 })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(sockets.current.on).not.toHaveBeenCalledWith('carts_update', expect.any(Function))
    view.unmount()
    expect(sockets.current.off).not.toHaveBeenCalledWith('carts_update', expect.any(Function))
  })
})
