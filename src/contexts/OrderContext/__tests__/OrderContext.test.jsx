import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  socketOn: vi.fn(),
  socketOff: vi.fn(),
  showToast: vi.fn()
}))

vi.mock('../../SessionContext', () => ({
  useSession: () => [{
    auth: true,
    loading: true,
    token: 'session-token',
    user: { id: 8 }
  }, { logout: vi.fn() }]
}))

vi.mock('../../ApiContext', () => ({
  useApi: () => [{
    appId: 'app',
    appInternalName: 'web',
    project: 'demo',
    root: 'https://api.test'
  }]
}))

vi.mock('../../WebsocketContext', () => ({
  useWebsocket: () => ({
    getId: () => 'socket-id',
    on: mocks.socketOn,
    off: mocks.socketOff,
    join: vi.fn(),
    leave: vi.fn()
  })
}))

vi.mock('../../LanguageContext', () => ({
  useLanguage: () => [{ loading: true }, (key, fallback) => fallback || key]
}))

vi.mock('../../EventContext', () => ({
  useEvent: () => [{ emit: mocks.emit }]
}))

vi.mock('../../ConfigContext', () => ({
  useConfig: () => [{
    loading: true,
    configs: {
      order_types_allowed: { value: '' }
    }
  }]
}))

vi.mock('../../CustomerContext', () => ({
  useCustomer: () => [{ user: null }, { setUserCustomer: vi.fn() }]
}))

vi.mock('../../ToastContext', () => ({
  ToastType: {
    Error: 'error',
    Info: 'info'
  },
  useToast: () => [{}, { showToast: mocks.showToast }]
}))

// eslint-disable-next-line import/first
import { OrderProvider, useOrder } from '../index'

let orderState
let orderActions

const OrderProbe = () => {
  [orderState, orderActions] = useOrder()
  return null
}

describe('OrderContext offers', () => {
  const strategy = {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    strategy.getItem.mockResolvedValue(null)
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        error: false,
        result: {
          business_id: 5,
          uuid: 'cart-uuid-5',
          offers: [{ id: 50 }]
        }
      })
    })
  })

  it('applies a selected offer by id and updates the matching cart', async () => {
    render(
      <OrderProvider strategy={strategy}>
        <OrderProbe />
      </OrderProvider>
    )

    await act(async () => {
      await orderActions.applyOffer({
        business_id: 5,
        offer_id: 50,
        force: true
      })
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/carts/add_offer',
      expect.objectContaining({ method: 'POST' })
    )
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      business_id: 5,
      offer_id: 50,
      force: true
    })
    await waitFor(() => {
      expect(orderState.loading).toBe(false)
      expect(orderState.carts['businessId:5']).toEqual(expect.objectContaining({
        uuid: 'cart-uuid-5',
        offers: [{ id: 50 }]
      }))
    })
    expect(mocks.emit).toHaveBeenCalledWith(
      'offer_applied',
      expect.objectContaining({ offer_id: 50 })
    )
  })

  it('removes an offer and replaces the matching cart immutably', async () => {
    global.fetch.mockResolvedValue({
      status: 200,
      json: async () => ({
        error: false,
        result: {
          business_id: 5,
          uuid: 'cart-uuid-5',
          offers: []
        }
      })
    })
    render(
      <OrderProvider strategy={strategy}>
        <OrderProbe />
      </OrderProvider>
    )

    await act(async () => {
      await orderActions.removeOffer({
        business_id: 5,
        offer_id: 50,
        user_id: 12
      })
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/carts/remove_offer',
      expect.objectContaining({ method: 'POST' })
    )
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      business_id: 5,
      offer_id: 50,
      user_id: 12
    })
    await waitFor(() => {
      expect(orderState.loading).toBe(false)
      expect(orderState.carts['businessId:5']).toEqual(expect.objectContaining({
        uuid: 'cart-uuid-5',
        offers: []
      }))
    })
    expect(mocks.emit).toHaveBeenCalledWith(
      'offer_removed',
      expect.objectContaining({ offer_id: 50 })
    )
  })
})
