import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  socketOn: vi.fn(),
  socketOff: vi.fn(),
  showToast: vi.fn(),
  confirmWithData: vi.fn(),
  confirm: vi.fn(),
  addProduct: vi.fn(),
  orderOptionsGet: vi.fn(),
  orderOptionsSave: vi.fn()
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
    root: 'https://api.test',
    setAccessToken: () => ({
      carts: () => ({
        confirmWithData: mocks.confirmWithData,
        confirm: mocks.confirm,
        addProduct: mocks.addProduct
      }),
      orderOptions: () => ({
        get: mocks.orderOptionsGet,
        save: mocks.orderOptionsSave
      })
    })
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
// eslint-disable-next-line import/first
import { PurchaseGiftCard } from '../../../components/GiftCard/PurchaseGiftCard'

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

describe('OrderContext confirmCart', () => {
  const strategy = {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }
  const releaseBody = { mercado_pago_data: { status: 'cancelled' } }

  const renderProvider = () => render(
    <OrderProvider strategy={strategy}>
      <OrderProbe />
    </OrderProvider>
  )

  beforeEach(() => {
    vi.clearAllMocks()
    strategy.getItem.mockResolvedValue(null)
  })

  it('returns the cart sent next to an error response', async () => {
    const releasedCart = { uuid: 'cart-uuid-5', business_id: 5, status: 4, paymethod_id: null }
    mocks.confirmWithData.mockResolvedValue({
      content: { error: true, result: ['Payment cancelled'], cart: releasedCart }
    })
    renderProvider()
    await act(async () => {
      orderActions.setStateValues({
        carts: { 'businessId:5': { uuid: 'cart-uuid-5', business_id: 5, status: 2 } }
      })
    })

    let response
    await act(async () => {
      response = await orderActions.confirmCart('cart-uuid-5', releaseBody)
    })

    expect(mocks.confirmWithData).toHaveBeenCalledWith(
      { ...releaseBody, user_id: 8 },
      expect.objectContaining({ headers: expect.any(Object) })
    )
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(response).toEqual({ error: true, result: ['Payment cancelled'], cart: releasedCart })
    await waitFor(() => {
      expect(orderState.loading).toBe(false)
      expect(orderState.carts['businessId:5']).toEqual(releasedCart)
    })
  })

  it('returns an undefined cart when the response has none', async () => {
    const pendingCart = { uuid: 'cart-uuid-5', business_id: 5, status: 2 }
    mocks.confirmWithData.mockResolvedValue({ content: { error: false, result: pendingCart } })
    renderProvider()

    let response
    await act(async () => {
      response = await orderActions.confirmCart('cart-uuid-5', releaseBody)
    })

    expect(response).toEqual({ error: false, result: pendingCart, cart: undefined })
  })

  it('returns no cart when the request throws', async () => {
    mocks.confirmWithData.mockRejectedValue(new Error('Network Error'))
    renderProvider()

    let response
    await act(async () => {
      response = await orderActions.confirmCart('cart-uuid-5', releaseBody)
    })

    expect(response).toEqual({ error: true, result: ['Network Error'] })
    expect(response).not.toHaveProperty('cart')
    await waitFor(() => expect(orderState.loading).toBe(false))
  })
})

describe('OrderContext platform gift carts', () => {
  const strategy = {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }
  const giftCart = {
    business_id: null,
    uuid: 'gift-cart-uuid',
    products: [{ id: 90, type: 'gift_card' }],
    updated_at: '2026-08-25 12:01:00'
  }
  const businessCart = {
    business_id: 5,
    uuid: 'cart-uuid-5',
    products: [{ id: 1 }],
    updated_at: '2026-08-25 12:02:00'
  }

  const renderProvider = () => render(
    <OrderProvider strategy={strategy}>
      <OrderProbe />
    </OrderProvider>
  )

  beforeEach(() => {
    vi.clearAllMocks()
    strategy.getItem.mockResolvedValue(null)
    mocks.orderOptionsSave.mockResolvedValue({
      content: { error: false, result: {} },
      status: 200
    })
  })

  it('stores a platform product cart under businessId:null without dropping business carts', async () => {
    mocks.addProduct.mockResolvedValue({
      content: { error: false, result: giftCart },
      status: 200
    })
    renderProvider()

    await act(async () => {
      orderActions.setStateValues({ carts: { 'businessId:5': businessCart } })
    })

    let response
    await act(async () => {
      response = await orderActions.addProduct({ id: 90, quantity: 1 }, null, null, true)
    })

    expect(mocks.addProduct).toHaveBeenCalledWith(
      { platform_product: { id: 90, quantity: 1 } },
      expect.objectContaining({ headers: expect.any(Object) })
    )
    expect(response).toEqual({ error: false, result: giftCart })
    await waitFor(() => {
      expect(orderState.carts['businessId:null']).toEqual(expect.objectContaining({
        uuid: 'gift-cart-uuid',
        products: [{ id: 90, type: 'gift_card' }]
      }))
      expect(orderState.carts['businessId:5']).toEqual(expect.objectContaining({
        uuid: 'cart-uuid-5'
      }))
    })
  })

  it('hydrates a gift cart from order options and keeps it when later lists omit it', async () => {
    mocks.orderOptionsGet.mockResolvedValue({
      content: { error: false, result: { carts: [giftCart, businessCart] } },
      status: 200
    })
    renderProvider()

    await act(async () => {
      await orderActions.refreshOrderOptions()
    })

    await waitFor(() => {
      expect(orderState.carts['businessId:null']).toEqual(expect.objectContaining({
        uuid: 'gift-cart-uuid'
      }))
      expect(orderState.carts['businessId:5']).toEqual(expect.objectContaining({
        uuid: 'cart-uuid-5'
      }))
    })

    mocks.orderOptionsGet.mockResolvedValue({
      content: { error: false, result: { carts: [businessCart] } },
      status: 200
    })
    await act(async () => {
      await orderActions.refreshOrderOptions()
    })

    await waitFor(() => {
      expect(orderState.carts['businessId:null']).toEqual(expect.objectContaining({
        uuid: 'gift-cart-uuid'
      }))
    })
  })

  it('does not overwrite a newer local gift cart with a stale list response', async () => {
    const newerGift = { ...giftCart, uuid: 'newer-gift-uuid', updated_at: '2026-08-25 12:05:00' }
    mocks.orderOptionsGet.mockResolvedValue({
      content: { error: false, result: { carts: [giftCart] } },
      status: 200
    })
    renderProvider()

    await act(async () => {
      orderActions.setStateValues({ carts: { 'businessId:null': newerGift } })
    })
    await act(async () => {
      await orderActions.refreshOrderOptions()
    })

    await waitFor(() => {
      expect(orderState.carts['businessId:null']).toEqual(expect.objectContaining({
        uuid: 'newer-gift-uuid'
      }))
    })
  })
})

describe('PurchaseGiftCard with real OrderProvider', () => {
  const strategy = {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }
  const giftProduct = { id: 90, name: 'Gift Card 90', type: 'gift_card' }
  const giftCart = {
    business_id: null,
    uuid: 'gift-cart-uuid',
    products: [{ id: 90, type: 'gift_card' }],
    updated_at: '2026-08-25 12:01:00'
  }

  let lastUIProps
  const GiftUI = (props) => {
    lastUIProps = props
    return null
  }

  beforeEach(() => {
    vi.clearAllMocks()
    strategy.getItem.mockResolvedValue(null)
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ error: false, result: [giftProduct] })
    })
  })

  it('checks out the new gift cart stored under businessId:null', async () => {
    mocks.addProduct.mockResolvedValue({
      content: { error: false, result: giftCart },
      status: 200
    })
    const goToCheckout = vi.fn()

    render(
      <OrderProvider strategy={strategy}>
        <OrderProbe />
        <PurchaseGiftCard UIComponent={GiftUI} handleCustomGoToCheckout={goToCheckout} />
      </OrderProvider>
    )

    await waitFor(() => {
      expect(lastUIProps.productsListState.loading).toBe(false)
      expect(lastUIProps.productsListState.products).toHaveLength(1)
    })

    await act(async () => {
      await lastUIProps.handleAccept(giftProduct)
    })

    expect(mocks.addProduct).toHaveBeenCalledWith(
      { platform_product: { id: 90, quantity: 1 } },
      expect.anything()
    )
    expect(goToCheckout).toHaveBeenCalledWith('gift-cart-uuid')
    await waitFor(() => {
      expect(orderState.carts['businessId:null']).toEqual(expect.objectContaining({
        uuid: 'gift-cart-uuid',
        products: [{ id: 90, type: 'gift_card' }]
      }))
    })
  })
})
