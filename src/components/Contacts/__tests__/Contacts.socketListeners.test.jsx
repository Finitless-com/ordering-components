import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps, ControllerUI } from '../../../__tests__/helpers/renderController'

const mocks = vi.hoisted(() => ({ listeners: new Map(), socket: null }))

const mockOrdering = {
  businesses: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    parameters: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    asDashboard: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ content: { result: [], error: false, pagination: { current_page: 1, page_size: 6, total_pages: 0, total: 0 } } })
  })),
  setAccessToken: vi.fn().mockReturnThis(),
  orders: vi.fn(() => ({
    parameters: vi.fn().mockReturnThis(),
    asDashboard: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ content: { result: [], error: false, pagination: { current_page: 1, page_size: 6, total_pages: 0, total: 0 } } })
  }))
}

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [mockOrdering]
}))

// A new user object on every render, like the session after refreshUserInfo
vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ token: 'tok', user: { id: 8, level: 4 } }]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => mocks.socket
}))

import { Contacts } from '../index'

const live = (event) => mocks.listeners.get(event) || []

describe('Contacts socket listeners', () => {
  beforeEach(() => {
    mocks.listeners.clear()
    // Same semantics as the socket.io emitter behind the wrapper: duplicates are kept, off matches by reference
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

  it('removes every listener it registered, including orders_register, when the effect re-runs and on unmount', async () => {
    const { rerender, unmount } = renderController(Contacts, { firstFetch: 'orders' })
    await waitFor(() => expect(lastControllerProps.orders.loading).toBe(false))
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        rerender(<Contacts UIComponent={ControllerUI} firstFetch='orders' />)
      })
    }
    ;['message', 'orders_register', 'update_order'].forEach((event) => expect(live(event)).toHaveLength(1))
    unmount()
    ;['message', 'orders_register', 'update_order'].forEach((event) => expect(live(event)).toHaveLength(0))
  })
})
