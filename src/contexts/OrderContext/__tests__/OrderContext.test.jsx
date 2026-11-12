import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  socketOn: vi.fn(),
  socketOff: vi.fn(),
  showToast: vi.fn(),
  confirmWithData: vi.fn(),
  confirm: vi.fn(),
  addProduct: vi.fn(),
  place: vi.fn(),
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
        addProduct: mocks.addProduct,
        place: mocks.place
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
  useToast: () => [{}, { showToast: mocks.showToast }],
  useToastActions: () => ({ showToast: mocks.showToast })
}))

// eslint-disable-next-line import/first
import { OrderProvider, useOrder, useOrderState, useOrderActions } from '../index'
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

describe('OrderContext state and actions without the copy', () => {
  const strategy = {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }

  it('gives the state without a copy and the same actions across renders', async () => {
    const states = []
    const actionSets = []
    const Probe = () => {
      states.push(useOrderState())
      actionSets.push(useOrderActions())
      useOrder()
      return null
    }
    const { rerender } = render(
      <OrderProvider strategy={strategy}>
        <Probe />
      </OrderProvider>
    )
    await waitFor(() => expect(states.length).toBeGreaterThan(0))
    rerender(
      <OrderProvider strategy={strategy}>
        <Probe />
      </OrderProvider>
    )
    const last = states[states.length - 1]
    expect(last).toHaveProperty('carts')
    expect(last).toHaveProperty('options')
    expect(actionSets.every((actions) => actions === actionSets[0])).toBe(true)
    expect(typeof actionSets[0].changeMoment).toBe('function')
  })

  it('warns and returns empty values outside the provider', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let state
    let actions
    const Probe = () => { state = useOrderState(); actions = useOrderActions(); return null }
    render(<Probe />)
    expect(state).toEqual({})
    expect(actions).toEqual({})
    warn.mockRestore()
  })
})

describe('OrderContext carts never changed in place', () => {
  const strategy = {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }

  it('hands a new carts object when placing a group removes its carts', async () => {
    let actions
    let cartKeys
    const MemoProbe = () => {
      const state = useOrderState()
      actions = useOrderActions()
      // A memo on the carts: it sees a change only if carts is a new object.
      cartKeys = React.useMemo(() => Object.keys(state.carts ?? {}), [state.carts])
      return null
    }
    render(
      <OrderProvider strategy={strategy}>
        <MemoProbe />
      </OrderProvider>
    )
    await act(async () => {
      actions.setStateValues({
        carts: {
          'businessId:5': { business_id: 5, uuid: 'cart-5', products: [{ id: 1 }] },
          'businessId:6': { business_id: 6, uuid: 'cart-6', products: [{ id: 2 }] }
        }
      })
    })
    await waitFor(() => expect(cartKeys).toEqual(expect.arrayContaining(['businessId:5', 'businessId:6'])))

    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        error: false,
        result: { carts: [{ business_id: 5, uuid: 'cart-5', business: { name: 'Five' } }] }
      })
    })
    await act(async () => {
      await actions.placeMultiCarts({ paymethod_id: 1 }, 'group-uuid')
    })

    await waitFor(() => expect(cartKeys).not.toContain('businessId:5'))
    expect(cartKeys).toContain('businessId:6')
  })
})


describe('OrderContext referral', () => {
  const NOW = 1793500000000
  const GOOGLE = '?utm_source=google&utm_medium=organic&utm_campaign=gbp-order'
  const CAMPAIGN = '?utm_source=ordering_marketing&utm_medium=email&utm_campaign=mkt-7'
  const google = { source: 'google', medium: 'organic', campaign: 'gbp-order' }
  const campaign = { source: 'ordering_marketing', medium: 'email', campaign: 'mkt-7' }

  let storage
  const strategy = {
    getItem: vi.fn(async (key) => storage[key] ?? null),
    setItem: vi.fn(async (key, value) => { storage[key] = value }),
    removeItem: vi.fn()
  }
  const carts = {
    'businessId:5': { business_id: 5, uuid: 'cart-5', products: [{ id: 1 }] },
    'businessId:12': { business_id: 12, uuid: 'cart-12', products: [{ id: 2 }] }
  }

  const open = (url) => window.history.replaceState({}, '', url)
  const navigationType = (type) => vi.spyOn(window.performance, 'getEntriesByType').mockReturnValue([{ type }])

  const renderProvider = async () => {
    render(
      <OrderProvider strategy={strategy}>
        <OrderProbe />
      </OrderProvider>
    )
    // Lets the capture of the site's load end.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    await act(async () => { orderActions.setStateValues({ carts }) })
    await waitFor(() => expect(orderState.carts['businessId:12']).toBeDefined())
  }

  const place = async (uuid, data = { paymethod_id: 1 }) => {
    await act(async () => { await orderActions.placeCart(uuid, data) })
    return mocks.place.mock.calls[mocks.place.mock.calls.length - 1][0]
  }

  beforeEach(() => {
    vi.clearAllMocks()
    storage = {}
    strategy.getItem.mockImplementation(async (key) => storage[key] ?? null)
    strategy.setItem.mockImplementation(async (key, value) => { storage[key] = value })
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    navigationType('navigate')
    mocks.place.mockResolvedValue({ content: { error: true, result: ['stop'] }, status: 400 })
    open('/')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    open('/')
  })

  it('remembers a visit that lands outside a store and sends it for any store', async () => {
    open('/promotions' + CAMPAIGN)
    await renderProvider()

    expect(storage.referral).toEqual({ visits: [{ ...campaign, captured_at: NOW, business_ids: [] }] })
    expect((await place('cart-5')).referral).toEqual(campaign)
    expect((await place('cart-12')).referral).toEqual(campaign)
  })

  it('binds the visit to the store it opened and sends it only for that store', async () => {
    open('/taco-shop' + GOOGLE)
    await renderProvider()
    await act(async () => { await orderActions.captureReferral(12) })

    expect(storage.referral).toEqual({ visits: [{ ...google, captured_at: NOW, business_ids: [12] }] })
    expect((await place('cart-12')).referral).toEqual({ ...google, business_id: 12 })
    expect(await place('cart-5')).not.toHaveProperty('referral')
  })

  it('keeps the date of the visit when the store is fetched again', async () => {
    open('/taco-shop' + GOOGLE)
    await renderProvider()
    Date.now.mockReturnValue(NOW + 60000)
    await act(async () => {
      await Promise.all([orderActions.captureReferral(12), orderActions.captureReferral(12)])
    })

    expect(storage.referral).toEqual({ visits: [{ ...google, captured_at: NOW, business_ids: [12] }] })
  })

  it('does not lose a capture when two run at the same time', async () => {
    await renderProvider()
    open('/taco-shop' + GOOGLE)
    await act(async () => {
      await Promise.all([orderActions.captureReferral(12), orderActions.captureReferral(5)])
    })

    expect(storage.referral).toEqual({ visits: [{ ...google, captured_at: NOW, business_ids: [12, 5] }] })
  })

  it('keeps the date of the visit when the page is reloaded', async () => {
    storage.referral = { visits: [{ ...google, captured_at: NOW - 86400000, business_ids: [12] }] }
    navigationType('reload')
    open('/taco-shop' + GOOGLE)
    await renderProvider()
    await act(async () => { await orderActions.captureReferral(12) })

    expect(storage.referral).toEqual({ visits: [{ ...google, captured_at: NOW - 86400000, business_ids: [12] }] })
  })

  it('keeps the visit of a store when another store gets one', async () => {
    storage.referral = { visits: [{ ...google, captured_at: NOW - 1000, business_ids: [12] }] }
    open('/burgers' + CAMPAIGN)
    await renderProvider()
    await act(async () => { await orderActions.captureReferral(5) })

    expect((await place('cart-12')).referral).toEqual({ ...google, business_id: 12 })
    expect((await place('cart-5')).referral).toEqual({ ...campaign, business_id: 5 })
  })

  it('keeps what was remembered on a visit without utm_source', async () => {
    storage.referral = { visits: [{ ...google, captured_at: NOW - 1000, business_ids: [12] }] }
    open('/taco-shop?table=4')
    await renderProvider()
    await act(async () => { await orderActions.captureReferral(12) })

    expect(storage.referral).toEqual({ visits: [{ ...google, captured_at: NOW - 1000, business_ids: [12] }] })
    expect(strategy.setItem).not.toHaveBeenCalledWith('referral', expect.anything(), true)
  })

  it('lets a referral passed by the caller win', async () => {
    open('/' + CAMPAIGN)
    await renderProvider()

    expect((await place('cart-5', { referral: { source: 'kiosk' } })).referral).toEqual({ source: 'kiosk' })
  })

  it('sends none on an order placed for a customer', async () => {
    open('/' + CAMPAIGN)
    storage['user-customer'] = { id: 99 }
    await renderProvider()

    const body = await place('cart-5')
    expect(body.user_id).toBe(99)
    expect(body).not.toHaveProperty('referral')
  })

  describe('while attribution is off', () => {
    const TOKEN = 'AFd1xnHr+JWKcjtriCyB5j3QL0bz=='
    const LANDING = '/taco-shop' + GOOGLE + '&rwg_token=' + encodeURIComponent(TOKEN)
    const REFERRAL_KEYS = ['referral', 'referral_click_id']
    const touched = (spy) => spy.mock.calls.filter(([key]) => REFERRAL_KEYS.includes(key))

    let rerenderProvider
    const renderSwitchable = async (referralEnabled) => {
      const ui = (enabled) => (
        <OrderProvider strategy={strategy} referralEnabled={enabled}>
          <OrderProbe />
        </OrderProvider>
      )
      const view = render(ui(referralEnabled))
      rerenderProvider = (enabled) => view.rerender(ui(enabled))
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
      await act(async () => { orderActions.setStateValues({ carts }) })
      await waitFor(() => expect(orderState.carts['businessId:12']).toBeDefined())
    }
    const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

    it('stores nothing and sends no referral', async () => {
      open(LANDING)
      await renderSwitchable(false)
      await act(async () => { await orderActions.captureReferral(12) })

      expect(storage).toEqual({})
      expect(touched(strategy.setItem)).toEqual([])
      expect(await place('cart-12')).not.toHaveProperty('referral')
    })

    it('does not send or read what is already stored', async () => {
      storage.referral = { visits: [{ ...google, captured_at: NOW - 1000, business_ids: [] }] }
      storage.referral_click_id = { type: 'rwg_token', value: TOKEN, landing_business_id: 12, clicked_at: NOW - 1000 }
      await renderSwitchable(false)
      strategy.getItem.mockClear()

      expect(await place('cart-12')).not.toHaveProperty('referral')
      expect(touched(strategy.getItem)).toEqual([])
    })

    it('captures the pending visit with its own time when it is turned on', async () => {
      open(LANDING)
      await renderSwitchable(false)
      await act(async () => { await orderActions.captureReferral(12) })
      open('/')
      Date.now.mockReturnValue(NOW + 3600000)
      rerenderProvider(true)
      await settle()

      expect(storage.referral).toEqual({ visits: [{ ...google, captured_at: NOW, business_ids: [12] }] })
      expect(storage.referral_click_id).toEqual({ type: 'rwg_token', value: TOKEN, landing_business_id: 12, clicked_at: NOW })
      const sent = (await place('cart-12')).referral
      expect(sent).toEqual({
        ...google,
        business_id: 12,
        click_id: { type: 'rwg_token', value: TOKEN },
        landing_business_id: 12,
        clicked_at: new Date(NOW).toISOString()
      })
    })

    it('captures the pending entries once and keeps at most 20', async () => {
      await renderSwitchable(false)
      for (let i = 1; i <= 22; i++) {
        open('/s' + i + '?utm_source=src' + i)
        Date.now.mockReturnValue(NOW + i)
        await act(async () => { await orderActions.captureReferral(i) })
      }
      open('/')
      rerenderProvider(true)
      await settle()

      const visits = storage.referral.visits
      expect(visits.map(v => v.source)).toEqual(Array.from({ length: 20 }, (_, i) => 'src' + (i + 3)))
      expect(visits[0].captured_at).toBe(NOW + 3)
      // One write per pending entry: the cap is on the entries, not only on the stored visits.
      expect(strategy.setItem.mock.calls.filter(([key]) => key === 'referral')).toHaveLength(20)

      strategy.setItem.mockClear()
      rerenderProvider(false)
      rerenderProvider(true)
      await settle()
      expect(strategy.setItem).not.toHaveBeenCalled()
    })

    it('keeps the landing when the same store reports itself many times', async () => {
      open(LANDING)
      await renderSwitchable(false)
      for (let i = 1; i <= 25; i++) {
        Date.now.mockReturnValue(NOW + i)
        await act(async () => { await orderActions.captureReferral(12) })
      }
      rerenderProvider(true)
      await settle()

      expect(storage.referral).toEqual({ visits: [{ ...google, captured_at: NOW, business_ids: [12] }] })
      expect(strategy.setItem.mock.calls.filter(([key]) => key === 'referral')).toHaveLength(2)
    })

    it('drops a capture that was queued when it is turned off before it runs', async () => {
      await renderSwitchable(true)
      open('/' + GOOGLE)
      let release
      strategy.getItem.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(null) }))
      let first
      let second
      await act(async () => { first = orderActions.captureReferral() })
      open('/' + CAMPAIGN)
      await act(async () => { second = orderActions.captureReferral() })
      rerenderProvider(false)
      await act(async () => { release(); await Promise.all([first, second]) })

      expect(storage.referral.visits.map(visit => visit.source)).toEqual(['google'])
    })

    it('stops capturing and sending when it is turned off, and leaves what was stored', async () => {
      open('/' + CAMPAIGN)
      await renderSwitchable(true)
      const stored = storage.referral
      expect(stored).toBeDefined()
      rerenderProvider(false)
      open('/taco-shop' + GOOGLE)
      await act(async () => { await orderActions.captureReferral(12) })

      expect(storage.referral).toEqual(stored)
      expect(await place('cart-5')).not.toHaveProperty('referral')
    })
  })

  describe('registerReferral', () => {
    const push = { source: 'ordering_marketing', medium: 'push', campaign: 'mkt-7' }

    it('stores a visit with no URL and sends it on place', async () => {
      await renderProvider()
      await act(async () => { await orderActions.registerReferral(push) })

      expect(storage.referral).toEqual({ visits: [{ ...push, captured_at: NOW, business_ids: [] }] })
      expect((await place('cart-12')).referral).toEqual(push)
    })

    it('stores nothing without a usable source', async () => {
      await renderProvider()
      await act(async () => { await orderActions.registerReferral({ source: 'a/b', medium: 'push' }) })
      await act(async () => { await orderActions.registerReferral({}) })

      expect(storage).toEqual({})
      expect(await place('cart-12')).not.toHaveProperty('referral')
    })

    it('is a new click every time: the same combination keeps one entry with the newest date', async () => {
      await renderProvider()
      await act(async () => { await orderActions.registerReferral(push) })
      Date.now.mockReturnValue(NOW + 60000)
      await act(async () => { await orderActions.registerReferral(push) })

      expect(storage.referral).toEqual({ visits: [{ ...push, captured_at: NOW + 60000, business_ids: [] }] })
    })

    it('the newest visit wins over a web one', async () => {
      open('/' + GOOGLE)
      await renderProvider()
      Date.now.mockReturnValue(NOW + 1000)
      await act(async () => { await orderActions.registerReferral(push) })

      expect((await place('cart-5')).referral).toEqual(push)
    })

    it('does not corrupt the landing memory of the web capture', async () => {
      open('/taco-shop' + GOOGLE)
      await renderProvider()
      Date.now.mockReturnValue(NOW + 1000)
      await act(async () => { await orderActions.registerReferral(push) })
      Date.now.mockReturnValue(NOW + 2000)
      await act(async () => { await orderActions.captureReferral(12) })

      expect(storage.referral.visits).toEqual([
        { ...google, captured_at: NOW, business_ids: [12] },
        { ...push, captured_at: NOW + 1000, business_ids: [] }
      ])
    })

    it('with a store, applies to that store only', async () => {
      await renderProvider()
      await act(async () => { await orderActions.registerReferral(push, 12) })

      expect(storage.referral).toEqual({ visits: [{ ...push, captured_at: NOW, business_ids: [12] }] })
      expect((await place('cart-12')).referral).toEqual({ ...push, business_id: 12 })
      expect(await place('cart-5')).not.toHaveProperty('referral')
    })

    it('while attribution is off stores nothing, and stores it with its own time once on', async () => {
      const ui = (enabled) => (
        <OrderProvider strategy={strategy} referralEnabled={enabled}>
          <OrderProbe />
        </OrderProvider>
      )
      const view = render(ui(false))
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
      await act(async () => { orderActions.setStateValues({ carts }) })
      await waitFor(() => expect(orderState.carts['businessId:12']).toBeDefined())
      await act(async () => { await orderActions.registerReferral(push) })

      expect(storage).toEqual({})
      expect(await place('cart-12')).not.toHaveProperty('referral')

      Date.now.mockReturnValue(NOW + 3600000)
      view.rerender(ui(true))
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

      expect(storage.referral).toEqual({ visits: [{ ...push, captured_at: NOW, business_ids: [] }] })
      expect((await place('cart-12')).referral).toEqual(push)
    })

    it('is held and never stored if attribution never turns on', async () => {
      const view = render(<OrderProvider strategy={strategy} referralEnabled={false}><OrderProbe /></OrderProvider>)
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
      await act(async () => { await orderActions.registerReferral(push) })
      view.unmount()

      expect(storage).toEqual({})
    })
  })

  describe('click id', () => {
    const TOKEN = 'AFd1xnHr+JWKcjtriCyB5j3QL0bz=='
    const TOKEN_URL = '?rwg_token=' + encodeURIComponent(TOKEN)
    const clickId = { type: 'rwg_token', value: TOKEN, landing_business_id: 12, clicked_at: NOW }
    const sent = {
      click_id: { type: 'rwg_token', value: TOKEN },
      landing_business_id: 12,
      clicked_at: new Date(NOW).toISOString()
    }

    it('keeps the token of the store link and sends it for any store', async () => {
      open('/taco-shop' + TOKEN_URL)
      await renderProvider()
      await act(async () => { await orderActions.captureReferral(12) })

      expect(storage.referral_click_id).toEqual(clickId)
      expect((await place('cart-12')).referral).toEqual(sent)
      expect((await place('cart-5')).referral).toEqual(sent)
    })

    it('sends it next to the UTM visit', async () => {
      open('/taco-shop' + GOOGLE + '&rwg_token=' + encodeURIComponent(TOKEN))
      await renderProvider()
      await act(async () => { await orderActions.captureReferral(12) })

      expect((await place('cart-12')).referral).toEqual({ ...google, business_id: 12, ...sent })
      expect((await place('cart-5')).referral).toEqual(sent)
    })

    it('keeps the date of the click when the same token comes again', async () => {
      storage.referral_click_id = { ...clickId, clicked_at: NOW - 86400000 }
      open('/burgers' + TOKEN_URL)
      await renderProvider()
      await act(async () => { await orderActions.captureReferral(5) })

      expect(storage.referral_click_id).toEqual({ ...clickId, clicked_at: NOW - 86400000 })
      expect(strategy.setItem).not.toHaveBeenCalledWith('referral_click_id', expect.anything(), true)
    })

    it('replaces it with a new token', async () => {
      storage.referral_click_id = { ...clickId, value: 'older-token', clicked_at: NOW - 86400000 }
      open('/burgers' + TOKEN_URL)
      await renderProvider()
      await act(async () => { await orderActions.captureReferral(5) })

      expect(storage.referral_click_id).toEqual({ ...clickId, landing_business_id: 5 })
    })

    it('still keeps the token when the UTM visit cannot be stored', async () => {
      open('/taco-shop' + GOOGLE + '&rwg_token=' + encodeURIComponent(TOKEN))
      strategy.setItem.mockImplementation(async (key, value) => {
        if (key === 'referral') throw new Error('quota exceeded')
        storage[key] = value
      })
      await renderProvider()
      await act(async () => { await orderActions.captureReferral(12) })

      expect(storage.referral_click_id).toEqual(clickId)
    })

    it('sends none on an order placed for a customer', async () => {
      storage.referral_click_id = clickId
      storage['user-customer'] = { id: 99 }
      await renderProvider()

      expect(await place('cart-12')).not.toHaveProperty('referral')
    })
  })

  it('places without a referral when the storage fails', async () => {
    open('/' + CAMPAIGN)
    await renderProvider()
    strategy.getItem.mockImplementation(async (key) => {
      if (key === 'referral') throw new Error('storage is blocked')
      return storage[key] ?? null
    })

    expect(await place('cart-5')).toEqual({ paymethod_id: 1, user_id: 8 })
  })

  it('sends it on a place of a group of carts', async () => {
    open('/' + CAMPAIGN)
    await renderProvider()
    global.fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ error: true, result: ['stop'] }) })
    await act(async () => { await orderActions.placeMultiCarts({ paymethod_id: 1 }, 'group-uuid') })

    expect(global.fetch).toHaveBeenCalledWith('https://api.test/cart_groups/group-uuid/place', expect.any(Object))
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).referral).toEqual(campaign)
  })
})
