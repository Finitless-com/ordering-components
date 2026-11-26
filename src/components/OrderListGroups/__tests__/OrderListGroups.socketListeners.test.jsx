import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const orders = vi.hoisted(() => {
  const { createCustomerOrdersTestContext } = require('../../../__tests__/helpers/customerOrdersTestHelpers')
  return createCustomerOrdersTestContext(vi)
})

// Emulates the wrapper `Socket` (contexts/WebsocketContext/socket.js) on top of the socket.io emitter:
// registering the same function twice keeps two registrations, `off(event)` without a handler
// forwards a fresh empty function so it removes nothing, and removal matches by reference.
const listeners = vi.hoisted(() => ({ map: new Map() }))

vi.mock('../../../contexts/EventContext', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useEvent: () => [{ emit: orders.mockEmit, on: orders.mockEventsOn, off: orders.mockEventsOff }]
  }
})

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false, language: { code: 'en' } }, orders.mockT]
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => [[], { showToast: orders.mockShowToast }],
  ToastType: { error: 'error', success: 'success', info: 'info' }
}))

// A new session object on every render, like the real one after refreshUserInfo/changeUser
vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    loading: false,
    user: { id: 8, name: 'Test User', level: 0 },
    token: 'session-tok'
  }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrderActions: () => ({}),
  useOrder: () => [orders.mockOrderState, {
    reorder: orders.mockReorder,
    clearCart: orders.mockClearCart
  }]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{ configs: orders.mockConfigState }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [orders.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => orders.mockSocket
}))

import { OrderListGroups } from '../index'

const REQUEST_EVENTS = ['request_register', 'request_update', 'request_cancel']
const liveHandlers = (event) => [...(listeners.map.get(event) || [])]
const emit = (event, payload) => liveHandlers(event).forEach((handler) => handler(payload))

describe('OrderListGroups assign request socket listeners', () => {
  beforeEach(() => {
    orders.reset()
    listeners.map.clear()
    orders.mockSocket.on.mockImplementation((event, func = () => {}) => {
      if (!listeners.map.has(event)) listeners.map.set(event, [])
      listeners.map.get(event).push(func)
    })
    orders.mockSocket.off.mockImplementation((event, func = () => {}) => {
      // Like the emitter of socket.io-client: removes one registration that matches by reference
      const list = listeners.map.get(event) || []
      const index = list.indexOf(func)
      if (index !== -1) list.splice(index, 1)
    })
    orders.mockConfigState.logistic_module.value = '1'
  })

  it('does not accumulate request listeners across re-renders of one mounted controller', async () => {
    const { unmount } = renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    act(() => {
      lastControllerProps.setCurrentTabSelected('completed')
    })
    await waitFor(() => expect(lastControllerProps.currentTabSelected).toBe('completed'))
    act(() => {
      lastControllerProps.setCurrentTabSelected('pending')
    })
    await waitFor(() => expect(lastControllerProps.currentTabSelected).toBe('pending'))
    REQUEST_EVENTS.forEach((event) => expect(liveHandlers(event)).toHaveLength(1))
    unmount()
    REQUEST_EVENTS.forEach((event) => expect(liveHandlers(event)).toHaveLength(0))
  })

  it('does not register or remove request listeners when logistic is off', async () => {
    orders.mockConfigState.logistic_module.value = ''
    const { unmount } = renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    REQUEST_EVENTS.forEach((event) => expect(liveHandlers(event)).toHaveLength(0))
    unmount()
    const requestOffCalls = orders.mockSocket.off.mock.calls.filter(([event]) => REQUEST_EVENTS.includes(event))
    expect(requestOffCalls).toHaveLength(0)
  })

  it('a request_register event runs the handler once, however many times the effect re-ran', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    for (const tab of ['completed', 'pending', 'completed']) {
      act(() => {
        lastControllerProps.setCurrentTabSelected(tab)
      })
      await waitFor(() => expect(lastControllerProps.currentTabSelected).toBe(tab))
    }
    orders.mockShowToast.mockClear()
    orders.mockEmit.mockClear()
    act(() => {
      emit('request_register', { id: 88, status: 0, order: orders.sampleOrder })
    })
    expect(orders.mockShowToast).toHaveBeenCalledTimes(1)
    expect(orders.mockEmit.mock.calls.filter(([name]) => name === 'request_register_notification')).toHaveLength(1)
  })

  it('request_update reads the current logistic orders: a known request is an update, not a new one', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    act(() => {
      emit('request_register', { id: 88, status: 0, order: orders.sampleOrder })
    })
    await waitFor(() => expect(lastControllerProps.logisticOrders.orders.some(o => o.id === 88)).toBe(true))
    orders.mockShowToast.mockClear()
    act(() => {
      emit('request_update', { id: 88, status: 1, order: orders.sampleOrder })
    })
    expect(orders.mockShowToast).toHaveBeenCalledTimes(1)
    expect(orders.mockShowToast.mock.calls[0][1]).toContain('has updated')
  })

  it('request_update does not repeat the notification for the same event (current orderLogisticUpdated)', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    const request = { id: 90, status: 1, order: orders.sampleOrder }
    act(() => {
      emit('request_update', request)
    })
    act(() => {
      emit('request_update', request)
    })
    expect(orders.mockEmit.mock.calls.filter(([name]) => name === 'request_update_notification')).toHaveLength(1)
  })
})
