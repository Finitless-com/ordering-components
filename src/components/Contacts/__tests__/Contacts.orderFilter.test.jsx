import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { EventProvider } from '../../../contexts/EventContext'
import { renderController, lastControllerProps, ControllerUI } from '../../../__tests__/helpers/renderController'

const mocks = vi.hoisted(() => ({ listeners: new Map(), socket: null, list: [], single: {}, session: [{ token: 'tok', user: { id: 8, level: 4 } }] }))

const mockOrdering = {
  setAccessToken: vi.fn().mockReturnThis(),
  orders: vi.fn((orderId) => ({
    parameters: vi.fn().mockReturnThis(),
    asDashboard: vi.fn().mockReturnThis(),
    get: vi.fn(async () => ({
      content: orderId
        ? { result: mocks.single[orderId], error: false }
        : { result: mocks.list.map((o) => ({ ...o })), error: false, pagination: { current_page: 1, page_size: 6, total_pages: 1, total: mocks.list.length } }
    }))
  }))
}

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [mockOrdering]
}))

vi.mock('../../../contexts/SessionContext', () => ({
  // Stable user identity, so the subscription count only reflects the predicate
  useSession: () => mocks.session
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => mocks.socket
}))

import { Contacts } from '../index'

const live = (event) => mocks.listeners.get(event) || []
const emit = async (event, payload) => {
  await act(async () => {
    await Promise.all(live(event).map((func) => func(payload)))
  })
}
const ids = () => lastControllerProps.orders.data.map((o) => o.id)
const hasMessages = (order) => !!order?.last_direct_message_at

// Same wrapper type on render and rerender, so changing a prop does not remount the controller
const Wrapper = ({ children }) => <EventProvider>{children}</EventProvider>

const renderOrders = async (props = {}) => {
  const view = renderController(Contacts, { firstFetch: 'orders', ...props }, { wrapper: Wrapper })
  await waitFor(() => expect(lastControllerProps.orders.loading).toBe(false))
  return view
}

describe('Contacts orderFilter on socket events', () => {
  beforeEach(() => {
    mocks.listeners.clear()
    mocks.list = [
      { id: 1, status: 0, last_direct_message_at: '2026-01-01' },
      { id: 3, status: 0, last_direct_message_at: '2026-01-02' }
    ]
    mocks.single = {}
    mocks.socket = {
      socket: { connected: true },
      join: vi.fn(),
      leave: vi.fn(),
      on: vi.fn((event, func = () => {}) => {
        if (!mocks.listeners.has(event)) mocks.listeners.set(event, [])
        mocks.listeners.get(event).push(func)
      }),
      off: vi.fn((event, func = () => {}) => {
        const list = mocks.listeners.get(event) || []
        const index = list.indexOf(func)
        if (index !== -1) list.splice(index, 1)
      })
    }
  })

  describe('without orderFilter (as always)', () => {
    it.each(['orders_register', 'update_order'])('%s inserts an unknown order', async (event) => {
      await renderOrders()
      await emit(event, { id: 2, status: 1, last_direct_message_at: null })
      expect(ids()).toEqual([2, 1, 3])
    })

    it('message inserts an unknown order, even one without direct messages', async () => {
      await renderOrders()
      mocks.single[2] = { id: 2, status: 1, last_direct_message_at: null }
      await emit('message', { order_id: 2 })
      expect(ids()).toEqual([2, 1, 3])
    })
  })

  describe('with orderFilter', () => {
    it.each(['orders_register', 'update_order'])('%s does not insert an unknown order that fails it', async (event) => {
      await renderOrders({ orderFilter: hasMessages })
      await emit(event, { id: 2, status: 1, last_direct_message_at: null })
      expect(ids()).toEqual([1, 3])
    })

    it.each(['orders_register', 'update_order'])('%s inserts an unknown order that passes it', async (event) => {
      await renderOrders({ orderFilter: hasMessages })
      await emit(event, { id: 2, status: 1, last_direct_message_at: '2026-02-01' })
      expect(ids()).toEqual([2, 1, 3])
    })

    it('message applies the predicate to the order it fetched', async () => {
      await renderOrders({ orderFilter: hasMessages })
      mocks.single[2] = { id: 2, status: 1, last_direct_message_at: null }
      await emit('message', { order_id: 2 })
      expect(ids()).toEqual([1, 3])

      mocks.single[4] = { id: 4, status: 1, last_direct_message_at: '2026-02-01' }
      await emit('message', { order_id: 4 })
      expect(ids()).toEqual([4, 1, 3])
    })

    it('an order already in the list is still updated or moved whatever the predicate says', async () => {
      await renderOrders({ orderFilter: () => false })

      await emit('update_order', { id: 1, status: 5, last_direct_message_at: null })
      expect(ids()).toEqual([1, 3])
      expect(lastControllerProps.orders.data[0].status).toBe(5)

      mocks.single[3] = { id: 3, status: 7, last_direct_message_at: null }
      await emit('message', { order_id: 3 })
      expect(ids()).toEqual([3, 1])
      expect(lastControllerProps.orders.data[0].status).toBe(7)
    })

    it('honours a predicate swapped at run time without subscribing the listeners again', async () => {
      const { rerender } = await renderOrders({ orderFilter: () => false })
      const subscriptions = mocks.socket.on.mock.calls.length

      await emit('update_order', { id: 2, status: 1 })
      expect(ids()).toEqual([1, 3])

      await act(async () => {
        rerender(<Wrapper><Contacts UIComponent={ControllerUI} firstFetch='orders' orderFilter={() => true} /></Wrapper>)
      })
      await emit('update_order', { id: 2, status: 1 })
      expect(ids()).toEqual([2, 1, 3])

      await act(async () => {
        rerender(<Wrapper><Contacts UIComponent={ControllerUI} firstFetch='orders' /></Wrapper>)
      })
      await emit('update_order', { id: 9, status: 1 })
      expect(ids()).toEqual([9, 2, 1, 3])

      expect(mocks.socket.on.mock.calls.length).toBe(subscriptions)
      ;['message', 'orders_register', 'update_order'].forEach((event) => expect(live(event)).toHaveLength(1))
    })
  })
})
