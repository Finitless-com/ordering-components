import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseApiJsonBody } from '../../../utils/parseApiJsonBody'
import { MultiCartCreate } from '../../../components/MultiCartCreate'

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
  orderOptionsSave: vi.fn(),
  orderTypesAllowed: '',
  defaultOrderType: undefined,
  unaddressedAllowed: undefined,
  sessionToken: 'session-token',
  // A guest with the config loaded (stable object: the provider's effects depend on it).
  guest: false,
  guestConfig: null
}))

vi.mock('../../SessionContext', () => ({
  useSession: () => [{
    auth: !mocks.guest,
    loading: !mocks.guest,
    token: mocks.sessionToken,
    user: mocks.guest ? undefined : { id: 8 }
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
  useConfig: () => [mocks.guestConfig ?? {
    loading: true,
    configs: {
      order_types_allowed: { value: mocks.orderTypesAllowed },
      ...(mocks.defaultOrderType && { default_order_type: { key: 'default_order_type', type: 2, value: mocks.defaultOrderType } }),
      ...(mocks.unaddressedAllowed && { unaddressed_order_types_allowed: { value: mocks.unaddressedAllowed } })
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

describe('OrderContext malformed order options', () => {
  const refreshWith = async (status, body) => {
    const strategy = { getItem: vi.fn().mockResolvedValue(null), removeItem: vi.fn() }
    const Alert = vi.fn(() => null)
    const data = parseApiJsonBody(body)
    mocks.orderOptionsGet.mockResolvedValueOnce({ status, response: { data }, content: data })
    render(<OrderProvider strategy={strategy} Alert={Alert}><OrderProbe /></OrderProvider>)
    await act(async () => {
      await orderActions.refreshOrderOptions()
    })
    return { strategy, Alert }
  }

  it('clears the web session when an authenticated refresh returns 401 with no body', async () => {
    const { strategy, Alert } = await refreshWith(401, '')
    expect(strategy.removeItem.mock.calls).toEqual([['token'], ['user'], ['device_code']])
    expect(Alert.mock.lastCall[0].open).toBe(false)
  })

  it('explains an invalid 200 response and keeps the response status with the alert', async () => {
    const { strategy, Alert } = await refreshWith(200, '{')
    expect(strategy.removeItem).not.toHaveBeenCalled()
    expect(Alert.mock.lastCall[0]).toMatchObject({
      open: true,
      status: 200,
      content: expect.stringContaining('refresh your carts')
    })
    expect(orderState.loading).toBe(false)
  })
})

describe('MultiCart recovery with OrderProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    mocks.orderTypesAllowed = ''
    mocks.orderOptionsGet.mockReset()
    mocks.orderOptionsSave.mockReset()
  })

  it('awaits pickup synchronization before handing the persisted group to checkout', async () => {
    mocks.orderTypesAllowed = '1|2'
    vi.stubGlobal('__FIRST_LOAD__', {})
    const createGroup = vi.fn().mockResolvedValue({ json: async () => ({ error: false, result: { uuid: 'group-1' } }) })
    vi.stubGlobal('fetch', createGroup)
    const carts = [
      { uuid: 'cart-a', valid: true, status: 0, business_id: 1 },
      { uuid: 'cart-b', valid: true, status: 0, business_id: 2 }
    ]
    const malformed = parseApiJsonBody('{')
    mocks.orderOptionsGet.mockReset()
      .mockResolvedValueOnce({ status: 200, content: { error: false, result: { type: 2, carts } } })
      .mockResolvedValueOnce({ status: 200, response: { data: malformed }, content: malformed })
      .mockResolvedValue({ status: 200, content: { error: false, result: { type: 1, carts } } })
    let finishSync
    const pendingSync = new Promise(resolve => { finishSync = resolve })
    mocks.orderOptionsSave.mockReset()
      .mockResolvedValueOnce({ status: 503, content: { error: true, result: 'Unavailable' } })
      .mockReturnValueOnce(pendingSync)
    const strategy = { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn(), removeItem: vi.fn() }
    const onCheckout = vi.fn()
    let retry
    const RecoveryUI = ({ onRetryRefresh }) => {
      retry = onRetryRefresh
      return null
    }
    render(
      <OrderProvider strategy={strategy}>
        <OrderProbe />
        <MultiCartCreate recoverMalformedRefresh UIComponent={RecoveryUI} handleOnRedirectMultiCheckout={onCheckout} />
      </OrderProvider>
    )
    await act(async () => { await orderActions.refreshOrderOptions() })
    await waitFor(() => expect(retry).toEqual(expect.any(Function)))

    await act(async () => { await retry() })
    expect(mocks.orderOptionsSave).toHaveBeenCalledWith(
      expect.objectContaining({ type: 2 }),
      expect.any(Object)
    )
    expect(onCheckout).not.toHaveBeenCalled()

    let retrying
    await act(async () => { retrying = retry() })
    expect(mocks.orderOptionsSave).toHaveBeenCalledTimes(2)
    expect(onCheckout).not.toHaveBeenCalled()
    await act(async () => {
      finishSync({ status: 200, content: { error: false, result: { type: 2, carts } } })
      await retrying
    })
    expect(onCheckout).toHaveBeenCalledExactlyOnceWith('group-1')
    expect(createGroup).toHaveBeenCalledTimes(1)
  })
})

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

describe('OrderContext updateOrderOptions', () => {
  const strategy = {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }

  const renderProvider = () => render(
    <OrderProvider strategy={strategy}>
      <OrderProbe />
    </OrderProvider>
  )

  beforeEach(() => {
    vi.clearAllMocks()
    strategy.getItem.mockResolvedValue(null)
  })

  it('is exposed as a function on the second item of useOrder()', async () => {
    renderProvider()
    await waitFor(() => expect(typeof orderActions.updateOrderOptions).toBe('function'))
  })

  it('saves the changes plus the session user_id and returns true on success', async () => {
    mocks.orderOptionsSave.mockResolvedValue({
      content: { error: false, result: { type: 1, moment: '2026-08-25 12:00:00' } },
      status: 200
    })
    renderProvider()
    await waitFor(() => expect(typeof orderActions.updateOrderOptions).toBe('function'))

    let result
    await act(async () => {
      result = await orderActions.updateOrderOptions({ type: 1, moment: 1756123200 })
    })

    expect(mocks.orderOptionsSave).toHaveBeenCalledWith(
      { type: 1, moment: 1756123200, user_id: 8 },
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Socket-Id-X': 'socket-id' }) })
    )
    expect(result).toBe(true)
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

describe('OrderContext changeBusiness', () => {
  const source = { business_id: 5, uuid: 'source-cart', products: [{ line_id: 1 }, { line_id: 2 }] }
  const previousDestination = { business_id: 6, uuid: 'empty-destination', products: [] }
  const other = { business_id: 7, uuid: 'other-cart' }
  const cart = { business_id: 6, uuid: 'new-destination', products: [{ line_id: 3 }], subtotal: 12, total: 15 }
  const result = {
    cart,
    unavailable: [{ line_id: 2, product_id: 9, reason: 'out_of_stock' }],
    discarded: { offers: [{ id: 8, reason: 'unavailable' }], wallets: [], context: [] }
  }
  const initialCarts = { 'businessId:5': source, 'businessId:6': previousDestination, 'businessId:7': other }
  const strategy = {
    getItem: vi.fn().mockImplementation(async key => key === 'country-code' ? 'US' : null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }
  const successResponse = { ok: true, json: async () => ({ error: false, result }) }

  const prepare = async () => {
    const view = render(<OrderProvider strategy={strategy}><OrderProbe /></OrderProvider>)
    await act(async () => orderActions.setStateValues({ carts: initialCarts }))
    return view
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    mocks.orderOptionsGet.mockReset()
    mocks.sessionToken = 'session-token'
    mocks.guest = false
  })

  it('atomically replaces the source and empty destination for a guest with a session token', async () => {
    mocks.guest = true
    mocks.sessionToken = 'guest-token'
    let finishRequest
    const request = new Promise(resolve => { finishRequest = resolve })
    const send = vi.fn().mockReturnValue(request)
    vi.stubGlobal('fetch', send)
    await prepare()

    let transfer
    await act(async () => { transfer = orderActions.changeBusiness(5, 6) })

    expect(orderState.carts).toEqual(initialCarts)
    const updatedOther = { ...other, products: [{ line_id: 7 }] }
    await act(async () => orderActions.setStateValues({ carts: { 'businessId:7': updatedOther } }))
    expect(send).toHaveBeenCalledWith('https://api.test/carts/source-cart/change_business', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ business_id: 6 }),
      headers: expect.objectContaining({
        Authorization: 'Bearer guest-token',
        'X-Socket-Id-X': 'socket-id',
        'X-Country-Code-X': 'US'
      })
    }))

    await act(async () => {
      finishRequest(successResponse)
      await expect(transfer).resolves.toEqual(result)
    })
    expect(orderState.carts).toEqual({ 'businessId:6': cart, 'businessId:7': updatedOther })
  })

  it('rejects with the API error code and preserves all carts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: true,
        error_codes: ['cart.destination_occupied'],
        result: ['The destination already has a cart.']
      })
    }))
    mocks.orderOptionsGet.mockResolvedValueOnce({ status: 200, content: { error: false, result: { carts: Object.values(initialCarts) } } })
    await prepare()

    await act(async () => {
      await expect(orderActions.changeBusiness(5, 6)).rejects.toMatchObject({
        name: 'Error',
        code: 'cart.destination_occupied',
        message: 'The destination already has a cart.'
      })
    })
    expect(orderState.carts).toEqual(initialCarts)
  })

  it('ignores stale cart data from an in-flight refresh and socket updates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successResponse))
    let finishRefresh
    mocks.orderOptionsGet.mockReturnValueOnce(new Promise(resolve => { finishRefresh = resolve }))
    await prepare()

    let refresh
    await act(async () => { refresh = orderActions.refreshOrderOptions() })
    await act(async () => { await orderActions.changeBusiness(5, 6) })
    await act(async () => {
      finishRefresh({ content: { error: false, result: { carts: [source, previousDestination, other] } } })
      await refresh
    })

    const [, updateCart] = mocks.socketOn.mock.calls.findLast(([event]) => event === 'carts_update')
    await act(async () => {
      updateCart(source)
      updateCart({ ...previousDestination, status: 1 })
    })
    expect(orderState.carts).toEqual({ 'businessId:6': cart, 'businessId:7': other })
  })

  const listResponse = carts => ({ status: 200, content: { error: false, result: { carts } } })
  const rejection = code => ({ ok: false, json: async () => ({ error: true, error_codes: [code], result: ['Rejected'] }) })

  it('recovers a lost success and reconciles the stale source in a second provider', async () => {
    const probes = {}
    const Probe = ({ tab }) => {
      const [state, actions] = useOrder()
      probes[tab] = { state, actions }
      return null
    }
    render(
      <>
        <OrderProvider strategy={strategy}><Probe tab='first' /></OrderProvider>
        <OrderProvider strategy={strategy}><Probe tab='second' /></OrderProvider>
      </>
    )
    await act(async () => {
      probes.first.actions.setStateValues({ carts: initialCarts })
      probes.second.actions.setStateValues({ carts: initialCarts })
    })
    const post = vi.fn()
      .mockRejectedValueOnce(new TypeError('Lost response'))
      .mockResolvedValueOnce(rejection('cart.not_found'))
    vi.stubGlobal('fetch', post)
    mocks.orderOptionsGet.mockResolvedValue(listResponse([cart, other]))
    await act(async () => {
      await expect(probes.first.actions.changeBusiness(5, 6)).resolves.toEqual({ cart, recovered: true })
    })
    expect(probes.second.state.carts).toEqual(initialCarts)
    await act(async () => {
      await expect(probes.second.actions.changeBusiness(5, 6)).resolves.toEqual({ cart, recovered: true })
    })
    const finalCarts = { 'businessId:6': cart, 'businessId:7': other }
    expect(probes.first.state.carts).toEqual(finalCarts)
    expect(probes.second.state.carts).toEqual(finalCarts)
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('reconciles a confirmed transfer without POST after the destination arrived over the socket', async () => {
    const post = vi.fn()
    vi.stubGlobal('fetch', post)
    mocks.orderOptionsGet.mockResolvedValueOnce(listResponse([cart, other]))
    await prepare()
    const [, updateCart] = mocks.socketOn.mock.calls.findLast(([event]) => event === 'carts_update')
    await act(async () => updateCart(cart))
    expect(orderState.carts['businessId:6'].uuid).toBe(cart.uuid)

    await act(async () => {
      await expect(orderActions.reconcileBusinessCart(5, 6, {
        sourceUuid: source.uuid,
        expectedDestinationUuid: cart.uuid
      })).resolves.toEqual({ cart, recovered: true })
    })
    expect(post).not.toHaveBeenCalled()
    expect(orderState.carts).toEqual({ 'businessId:6': cart, 'businessId:7': other })
  })

  it('refreshes an occupied rejection without reporting a successful transfer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rejection('cart.destination_occupied')))
    mocks.orderOptionsGet.mockResolvedValueOnce(listResponse([source, cart, other]))
    await prepare()
    await act(async () => {
      await expect(orderActions.changeBusiness(5, 6)).rejects.toMatchObject({ code: 'cart.destination_occupied' })
    })
    expect(orderState.carts).toEqual({ 'businessId:5': source, 'businessId:6': cart, 'businessId:7': other })
  })

  it('returns the same-business code without another request', async () => {
    const post = vi.fn().mockResolvedValue(rejection('cart.same_business'))
    vi.stubGlobal('fetch', post)
    await prepare()
    await act(async () => {
      await expect(orderActions.changeBusiness(5, 5)).rejects.toMatchObject({ code: 'cart.same_business' })
    })
    expect(post).toHaveBeenCalledOnce()
    expect(mocks.orderOptionsGet).not.toHaveBeenCalled()
  })

  it('does not claim a pre-existing destination when another tab removed the source', async () => {
    const occupied = { ...previousDestination, products: [{ line_id: 4 }] }
    const carts = { ...initialCarts, 'businessId:6': occupied }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rejection('cart.not_found')))
    mocks.orderOptionsGet.mockResolvedValueOnce(listResponse([occupied, other]))
    await prepare()
    await act(async () => orderActions.setStateValues({ carts }))
    await act(async () => {
      await expect(orderActions.changeBusiness(5, 6)).rejects.toMatchObject({ code: 'cart.not_found' })
    })
    expect(orderState.carts).toEqual({ 'businessId:6': occupied, 'businessId:7': other })
  })

  it('refreshes when the local source is missing and does not claim another cart as a transfer', async () => {
    const post = vi.fn()
    vi.stubGlobal('fetch', post)
    mocks.orderOptionsGet.mockResolvedValueOnce(listResponse([cart]))
    render(<OrderProvider strategy={strategy}><OrderProbe /></OrderProvider>)
    await act(async () => {
      await expect(orderActions.changeBusiness(5, 6)).rejects.toMatchObject({ code: 'cart.not_found' })
    })
    expect(post).not.toHaveBeenCalled()
    expect(orderState.carts).toEqual({ 'businessId:6': cart })
  })

  it('aborts a timed-out POST and preserves the source when the server did not move it', async () => {
    vi.useFakeTimers()
    const post = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', post)
    mocks.orderOptionsGet.mockResolvedValueOnce(listResponse(Object.values(initialCarts)))
    try {
      await prepare()
      await act(async () => {
        const transfer = expect(orderActions.changeBusiness(5, 6)).rejects.toBeInstanceOf(Error)
        await vi.advanceTimersByTimeAsync(15000)
        await transfer
      })
      expect(post.mock.calls[0][1].signal.aborted).toBe(true)
      expect(orderState.carts).toEqual(initialCarts)
      expect(orderState.orderOptionsStatus).toBe('ready')
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers an invalid POST response and blocks checkout if the verifying read fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: false, result: null }) }))
    mocks.orderOptionsGet
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce(listResponse([cart, other]))
    await prepare()
    await act(async () => {
      await expect(orderActions.changeBusiness(5, 6)).rejects.toMatchObject({ recoveryFailed: true })
    })
    expect(orderState.carts).toEqual(initialCarts)
    expect(orderState.orderOptionsStatus).toBe('error')
    await act(async () => {
      await expect(orderActions.refreshOrderOptions()).resolves.toEqual({ status: 200, carts: [cart, other] })
    })
    expect(orderState.orderOptionsStatus).toBe('ready')
    expect(orderState.carts).toEqual({ 'businessId:6': cart, 'businessId:7': other })
  })

  it('times out a hung reconciliation read and verifies the cart on retry', async () => {
    vi.useFakeTimers()
    const abortRead = vi.fn()
    const post = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', post)
    mocks.orderOptionsGet
      .mockImplementationOnce(({ cancelToken } = {}) => {
        if (cancelToken) cancelToken.cancel = abortRead
        return new Promise(() => {})
      })
      .mockResolvedValueOnce(listResponse([cart, other]))

    try {
      await prepare()
      await act(async () => {
        const outcome = expect(orderActions.changeBusiness(5, 6)).rejects.toMatchObject({ recoveryFailed: true })
        await vi.advanceTimersByTimeAsync(24000)
        await outcome
      })
      expect(abortRead).toHaveBeenCalledOnce()
      expect(orderState.orderOptionsStatus).toBe('error')
      expect(orderState.carts).toEqual(initialCarts)
      await act(async () => {
        await expect(orderActions.refreshOrderOptions()).resolves.toEqual({ status: 200, carts: [cart, other] })
      })
      expect(orderState.orderOptionsStatus).toBe('ready')
      expect(orderState.carts).toEqual({ 'businessId:6': cart, 'businessId:7': other })
      expect(post).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('propagates a caller abort while reconciling the server state', async () => {
    const caller = new AbortController()
    const post = vi.fn().mockImplementation((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', post)
    mocks.orderOptionsGet.mockResolvedValueOnce(listResponse([cart, other]))
    await prepare()
    let transfer
    await act(async () => { transfer = orderActions.changeBusiness(5, 6, { signal: caller.signal }) })
    await act(async () => {
      caller.abort()
      await expect(transfer).resolves.toEqual({ cart, recovered: true })
    })
    expect(orderState.carts).toEqual({ 'businessId:6': cart, 'businessId:7': other })
  })

  it('exposes a pending options load before the first request settles', async () => {
    await prepare()
    expect(orderState.orderOptionsStatus).toBe('loading')
    await act(async () => {
      mocks.orderOptionsGet.mockResolvedValueOnce(listResponse(Object.values(initialCarts)))
      await orderActions.refreshOrderOptions()
    })
    expect(orderState.orderOptionsStatus).toBe('ready')
  })

  it('discards a transfer response after the session changes', async () => {
    let finishRequest
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(resolve => { finishRequest = resolve })))
    const view = await prepare()

    let transfer
    await act(async () => { transfer = orderActions.changeBusiness(5, 6) })
    mocks.sessionToken = 'new-session-token'
    view.rerender(<OrderProvider strategy={strategy}><OrderProbe /></OrderProvider>)
    await act(async () => orderActions.setStateInitialValues())
    await act(async () => {
      finishRequest(successResponse)
      await expect(transfer).rejects.toBeInstanceOf(Error)
    })
    expect(orderState.carts).toEqual({})
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

describe('OrderContext handleLogEvent', () => {
  const strategy = {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    strategy.getItem.mockResolvedValue(null)
    mocks.sessionToken = 'session-token'
    global.fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({}) })
  })

  afterEach(() => {
    mocks.sessionToken = 'session-token'
  })

  it('sends tracking events with the session token', async () => {
    render(
      <OrderProvider strategy={strategy}>
        <OrderProbe />
      </OrderProvider>
    )

    await act(async () => {
      await orderActions.handleLogEvent([{ event: 'click', model: 'Product', object_id: 1 }])
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/tracking_events',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('does not call tracking_events when there is no session token', async () => {
    mocks.sessionToken = null
    render(
      <OrderProvider strategy={strategy}>
        <OrderProbe />
      </OrderProvider>
    )

    await act(async () => {
      await orderActions.handleLogEvent([{ event: 'click', model: 'Product', object_id: 1 }])
    })

    expect(global.fetch).not.toHaveBeenCalledWith(
      'https://api.test/tracking_events',
      expect.anything()
    )
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

describe('OrderContext pickupWithoutAddress', () => {
  const strategy = {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }
  const cart = { business_id: 5 }
  const product = { id: 1, name: 'Taco' }

  const renderProvider = () => render(
    <OrderProvider strategy={strategy}>
      <OrderProbe />
    </OrderProvider>
  )

  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
    strategy.getItem.mockResolvedValue(null)
    mocks.addProduct.mockResolvedValue({
      content: { error: false, result: { business_id: 5, uuid: 'cart-uuid-5' } },
      status: 200
    })
  })

  it('still requires the address for pickup by default', async () => {
    renderProvider()
    await act(async () => { orderActions.setStateValues({ options: { type: 2 } }) })

    let response
    await act(async () => {
      response = await orderActions.addProduct(product, cart, false)
    })

    expect(response).toBe(false)
    expect(mocks.emit).toHaveBeenCalledWith('require_order_address', { orderType: 2 })
    expect(mocks.addProduct).not.toHaveBeenCalled()
  })

  it('skips the address for pickup once enabled, and still requires it for delivery', async () => {
    renderProvider()
    await act(async () => { orderActions.setPickupWithoutAddress(true) })
    await act(async () => { orderActions.setStateValues({ options: { type: 2 } }) })

    let response
    await act(async () => {
      response = await orderActions.addProduct(product, cart, false)
    })

    expect(response).toBe(true)
    expect(mocks.emit).not.toHaveBeenCalledWith('require_order_address', expect.anything())
    expect(mocks.addProduct).toHaveBeenCalledTimes(1)

    mocks.emit.mockClear()
    await act(async () => { orderActions.setStateValues({ options: { type: 1 } }) })
    await act(async () => {
      response = await orderActions.addProduct(product, cart, false)
    })

    expect(response).toBe(false)
    expect(mocks.emit).toHaveBeenCalledWith('require_order_address', { orderType: 1 })
    expect(mocks.addProduct).toHaveBeenCalledTimes(1)
  })

  it('skips the address for the extra unaddressed types, and still requires it for delivery', async () => {
    renderProvider()
    await act(async () => { orderActions.setExtraUnaddressedOrderTypes([2, 3, 4, 5, 6, 8]) })
    await act(async () => { orderActions.setStateValues({ options: { type: 3 } }) })

    let response
    await act(async () => {
      response = await orderActions.addProduct(product, cart, false)
    })

    expect(response).toBe(true)
    expect(mocks.emit).not.toHaveBeenCalledWith('require_order_address', expect.anything())
    expect(mocks.addProduct).toHaveBeenCalledTimes(1)

    mocks.emit.mockClear()
    await act(async () => { orderActions.setStateValues({ options: { type: 1 } }) })
    await act(async () => {
      response = await orderActions.addProduct(product, cart, false)
    })

    expect(response).toBe(false)
    expect(mocks.emit).toHaveBeenCalledWith('require_order_address', { orderType: 1 })
    expect(mocks.addProduct).toHaveBeenCalledTimes(1)
  })

  it('exposes the extra unaddressed types in the state', async () => {
    renderProvider()
    expect(orderState.extraUnaddressedOrderTypes).toEqual([])
    await act(async () => { orderActions.setExtraUnaddressedOrderTypes([2, 3, '4']) })
    expect(orderState.extraUnaddressedOrderTypes).toEqual([2, 3, 4])
    await act(async () => { orderActions.setExtraUnaddressedOrderTypes([]) })
    expect(orderState.extraUnaddressedOrderTypes).toEqual([])
  })

  it('requires the address for eat in by default (no extra unaddressed types)', async () => {
    renderProvider()
    await act(async () => { orderActions.setStateValues({ options: { type: 3 } }) })

    let response
    await act(async () => {
      response = await orderActions.addProduct(product, cart, false)
    })

    expect(response).toBe(false)
    expect(mocks.emit).toHaveBeenCalledWith('require_order_address', { orderType: 3 })
    expect(mocks.addProduct).not.toHaveBeenCalled()
  })

  it('restores the default rule once disabled again', async () => {
    renderProvider()
    await act(async () => { orderActions.setPickupWithoutAddress(true) })
    await act(async () => { orderActions.setPickupWithoutAddress(false) })
    await act(async () => { orderActions.setStateValues({ options: { type: 2 } }) })

    let response
    await act(async () => {
      response = await orderActions.addProduct(product, cart, false)
    })

    expect(response).toBe(false)
    expect(mocks.emit).toHaveBeenCalledWith('require_order_address', { orderType: 2 })
    expect(mocks.addProduct).not.toHaveBeenCalled()
  })
})

describe('OrderContext worker pickup and default order type', () => {
  const strategy = {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }
  const cart = { business_id: 5 }
  const product = { id: 1, name: 'Taco' }

  beforeEach(() => {
    vi.clearAllMocks()
    strategy.getItem.mockResolvedValue(null)
    mocks.orderTypesAllowed = '1|2'
    mocks.defaultOrderType = 'delivery'
    mocks.unaddressedAllowed = '1|2'
    mocks.orderOptionsSave.mockReset().mockImplementation(async (body) => ({
      status: 200,
      content: { error: false, result: { type: body.type, carts: [] } }
    }))
    mocks.addProduct.mockResolvedValue({
      content: { error: false, result: { business_id: 5, uuid: 'cart-uuid-5' } },
      status: 200
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    mocks.orderTypesAllowed = ''
    mocks.defaultOrderType = undefined
    mocks.unaddressedAllowed = undefined
  })

  const renderProvider = (props = {}) => render(
    <OrderProvider strategy={strategy} {...props}>
      <OrderProbe />
    </OrderProvider>
  )

  const savedTypes = () => mocks.orderOptionsSave.mock.calls.map(([body]) => body.type)

  it('starts as pickup when the page comes from the worker and the prop is not set', async () => {
    vi.stubGlobal('__FIRST_LOAD__', {})
    renderProvider()
    expect(orderState.options.type).toBe(2)

    await act(async () => { orderActions.setStateValues({ options: { type: 1 } }) })
    await act(async () => { await orderActions.addProduct(product, cart, false) })
    expect(savedTypes()).toContain(2)
  })

  it('starts as default_order_type with disableWorkerPickup and never forces pickup', async () => {
    vi.stubGlobal('__FIRST_LOAD__', {})
    renderProvider({ disableWorkerPickup: true })
    expect(orderState.options.type).toBe(1)

    await act(async () => { await orderActions.addProduct(product, cart, false) })
    expect(mocks.addProduct).toHaveBeenCalledTimes(1)
    expect(savedTypes()).not.toContain(2)
  })

  it('uses default_order_type when the current type is not allowed and the default is', async () => {
    mocks.orderTypesAllowed = '1|3'
    mocks.defaultOrderType = 'eatin'
    renderProvider()
    await act(async () => { orderActions.setStateValues({ options: { type: 2 } }) })

    await waitFor(() => expect(savedTypes()).toEqual([3]))
  })

  it('falls back to the first allowed type, never the config row type, when the default is not allowed', async () => {
    mocks.orderTypesAllowed = '1|3'
    mocks.defaultOrderType = 'delivery'
    renderProvider()
    await act(async () => { orderActions.setStateValues({ options: { type: 5 } }) })
    await waitFor(() => expect(savedTypes()).toEqual([1]))

    mocks.orderOptionsSave.mockClear()
    mocks.defaultOrderType = 'pickup'
    await act(async () => { orderActions.setStateValues({ options: { type: 4 } }) })
    await waitFor(() => expect(savedTypes()).toEqual([1]))
    expect(savedTypes()).not.toContain(2)
  })

  // SERGIO-1688: the consumer's own list of supported types (the web does not offer seat delivery, 6)
  describe('with supportedOrderTypes, the provider never picks a type the consumer does not support', () => {
    const supported = [1, 2, 3, 4, 5, 7, 8, 9]

    it('replaces a saved type that is no longer supported by the first supported allowed one', async () => {
      mocks.orderTypesAllowed = '6|2'
      mocks.defaultOrderType = 'seatdelivery'
      renderProvider({ supportedOrderTypes: supported })
      await act(async () => { orderActions.setStateValues({ options: { type: 6 } }) })

      await waitFor(() => expect(savedTypes()).toEqual([2]))
      expect(savedTypes()).not.toContain(6)
    })

    it('without the prop the same project keeps the allowed 6: nothing changes for the other consumers', async () => {
      mocks.orderTypesAllowed = '6|2'
      mocks.defaultOrderType = 'seatdelivery'
      renderProvider()
      await act(async () => { orderActions.setStateValues({ options: { type: 6 } }) })

      await waitFor(() => expect(orderState.options.type).toBe(6))
      expect(mocks.orderOptionsSave).not.toHaveBeenCalled()
    })

    describe('a guest', () => {
      beforeEach(() => {
        mocks.guest = true
        mocks.orderTypesAllowed = '6|2'
        mocks.defaultOrderType = 'seatdelivery'
        mocks.guestConfig = {
          loading: false,
          configs: {
            order_types_allowed: { value: '6|2' },
            default_order_type: { key: 'default_order_type', type: 2, value: 'seatdelivery' }
          }
        }
      })

      afterEach(() => {
        mocks.guest = false
        mocks.guestConfig = null
      })

      it('starts in the first supported allowed type, and stores that one', async () => {
        renderProvider({ disableWorkerPickup: true, supportedOrderTypes: supported })
        expect(orderState.options.type).toBe(2)
        await waitFor(() => expect(orderState.loading).toBe(false))
        expect(orderState.options.type).toBe(2)
        expect(strategy.setItem.mock.calls.every(([key, value]) => key !== 'options' || value.type !== 6)).toBe(true)
      })

      it('a guest left without a type takes the first supported one, not the 6 the project lists first', async () => {
        renderProvider({ disableWorkerPickup: true, supportedOrderTypes: supported })
        await waitFor(() => expect(orderState.loading).toBe(false))
        await act(async () => { orderActions.setStateValues({ options: { type: null } }) })
        await waitFor(() => expect(orderState.options.type).toBe(2))
      })

      it('without the prop the project order still wins: it starts in 6 (the behavior the prop is for)', async () => {
        renderProvider({ disableWorkerPickup: true })
        expect(orderState.options.type).toBe(6)
        await waitFor(() => expect(orderState.loading).toBe(false))
      })
    })
  })

  // SERGIO-1681: a write the customer's later change superseded answers late
  describe('a late answer to a superseded type write', () => {
    const deferred = () => {
      let finish
      const promise = new Promise(resolve => { finish = resolve })
      return { promise, resolve: finish }
    }
    const answer = (type) => ({ status: 200, content: { error: false, result: { type, carts: [] } } })

    // writes A (type 2) first and B (type 3) after it, answers B and then A
    const lateAnswer = async (props) => {
      mocks.orderTypesAllowed = '1|2|3'
      const writeA = deferred()
      const writeB = deferred()
      mocks.orderOptionsSave.mockReset()
        .mockReturnValueOnce(writeA.promise)
        .mockReturnValueOnce(writeB.promise)
      renderProvider(props)
      await act(async () => { orderActions.setStateValues({ options: { type: 1 } }) })
      let doneA
      let doneB
      await act(async () => { doneA = orderActions.changeType(2) })
      await waitFor(() => expect(mocks.orderOptionsSave).toHaveBeenCalledTimes(1))
      await act(async () => { doneB = orderActions.changeType(3) })
      await waitFor(() => expect(mocks.orderOptionsSave).toHaveBeenCalledTimes(2))
      await act(async () => { writeB.resolve(answer(3)); await doneB })
      expect(orderState.options.type).toBe(3)
      await act(async () => { writeA.resolve(answer(2)); await doneA })
    }

    it('with ignoreStaleTypeResponses the type the customer chose last stays', async () => {
      await lateAnswer({ ignoreStaleTypeResponses: true })
      expect(orderState.options.type).toBe(3)
      expect(orderState.loading).toBe(false)
    })

    it('without the prop the late answer applies, as before', async () => {
      await lateAnswer()
      expect(orderState.options.type).toBe(2)
    })
  })

  // SERGIO-1681: a write that never answers must not hold `loading` for good
  describe('orderOptionsWriteTimeout', () => {
    const hang = () => {
      mocks.orderOptionsSave.mockReset().mockImplementation(() => new Promise(() => {}))
    }

    afterEach(() => { vi.useRealTimers() })

    it('releases loading and cancels the request when the write does not answer in time; the local type stays', async () => {
      vi.useFakeTimers()
      hang()
      const Alert = vi.fn(() => null)
      renderProvider({ orderOptionsWriteTimeout: 4000, Alert })
      await act(async () => { orderActions.setStateValues({ options: { type: 1 } }) })
      await act(async () => { orderActions.changeType(2) })
      expect(orderState.loading).toBe(true)
      expect(orderState.options.type).toBe(2)
      const transport = mocks.orderOptionsSave.mock.calls[0][1]
      transport.cancelToken.cancel = vi.fn()

      await act(async () => { await vi.advanceTimersByTimeAsync(3999) })
      expect(orderState.loading).toBe(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
      expect(orderState.loading).toBe(false)
      expect(orderState.options.type).toBe(2)
      expect(transport.cancelToken.cancel).toHaveBeenCalledTimes(1)
      expect(Alert.mock.lastCall[0]).toMatchObject({ open: true, content: 'We couldn’t save your order type. Check your connection and try again.' })
    })

    it('a type write that also clears city_id is cut by the deadline too; the local type stays', async () => {
      vi.useFakeTimers()
      hang()
      renderProvider({ orderOptionsWriteTimeout: 4000 })
      await act(async () => { orderActions.setStateValues({ options: { type: 1, city_id: 5 } }) })
      await act(async () => { orderActions.changeType(3) })
      expect(mocks.orderOptionsSave.mock.calls[0][0]).toMatchObject({ type: 3, city_id: null })
      expect(orderState.loading).toBe(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
      expect(orderState.loading).toBe(false)
      expect(orderState.options.type).toBe(3)
    })

    it('a write with no changes has no deadline', async () => {
      vi.useFakeTimers()
      hang()
      renderProvider({ orderOptionsWriteTimeout: 4000 })
      await act(async () => { orderActions.updateOrderOptions({}) })
      expect(mocks.orderOptionsSave).toHaveBeenCalledTimes(1)
      expect(mocks.orderOptionsSave.mock.calls[0][1].cancelToken).toBeUndefined()
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(orderState.loading).toBe(true)
    })

    it('a write that changes more than the type (a moment) is not cut by the deadline', async () => {
      vi.useFakeTimers()
      hang()
      const Alert = vi.fn(() => null)
      renderProvider({ orderOptionsWriteTimeout: 4000, Alert })
      await act(async () => { orderActions.setStateValues({ options: { type: 1 } }) })
      await act(async () => { orderActions.changeMoment(new Date('2030-01-01T10:00:00Z')) })
      expect(orderState.loading).toBe(true)
      expect(mocks.orderOptionsSave.mock.calls[0][1].cancelToken).toBeUndefined()
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(orderState.loading).toBe(true)
      expect(Alert.mock.calls.some(([props]) => props.open)).toBe(false)
    })

    it('does not touch a write that answers in time', async () => {
      vi.useFakeTimers()
      mocks.orderOptionsSave.mockReset().mockResolvedValue({ status: 200, content: { error: false, result: { type: 2, carts: [] } } })
      const Alert = vi.fn(() => null)
      renderProvider({ orderOptionsWriteTimeout: 4000, Alert })
      await act(async () => { orderActions.setStateValues({ options: { type: 1 } }) })
      await act(async () => { await orderActions.changeType(2) })
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(orderState.loading).toBe(false)
      expect(Alert.mock.calls.some(([props]) => props.open)).toBe(false)
    })

    it('without the prop a write that never answers keeps loading, as before', async () => {
      vi.useFakeTimers()
      hang()
      renderProvider()
      await act(async () => { orderActions.setStateValues({ options: { type: 1 } }) })
      await act(async () => { orderActions.changeType(2) })
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(orderState.loading).toBe(true)
    })
  })

  describe('with disableWorkerPickup, a default_order_type that is unknown or not allowed', () => {
    beforeEach(() => {
      mocks.guest = true
    })

    afterEach(() => {
      mocks.guest = false
      mocks.guestConfig = null
    })

    const useGuestConfig = () => {
      mocks.guestConfig = {
        loading: false,
        configs: {
          order_types_allowed: { value: mocks.orderTypesAllowed },
          ...(mocks.defaultOrderType && { default_order_type: { key: 'default_order_type', type: 2, value: mocks.defaultOrderType } })
        }
      }
    }

    it('starts in the first allowed type when the default does not map to an order type', async () => {
      mocks.orderTypesAllowed = '1|2'
      mocks.defaultOrderType = 'reservation'
      useGuestConfig()
      renderProvider({ disableWorkerPickup: true })
      expect(orderState.options.type).toBe(1)
      await waitFor(() => expect(orderState.loading).toBe(false))
      expect(orderState.options.type).toBe(1)
    })

    it('starts in the first allowed type when the default maps to a type that is not allowed', async () => {
      mocks.orderTypesAllowed = '1|3'
      mocks.defaultOrderType = 'pickup'
      useGuestConfig()
      renderProvider({ disableWorkerPickup: true })
      expect(orderState.options.type).toBe(1)
      await waitFor(() => expect(orderState.loading).toBe(false))
      expect(orderState.options.type).toBe(1)
    })

    it('keeps an allowed default_order_type', async () => {
      mocks.orderTypesAllowed = '1|3'
      mocks.defaultOrderType = 'eatin'
      useGuestConfig()
      renderProvider({ disableWorkerPickup: true })
      await waitFor(() => expect(orderState.loading).toBe(false))
      expect(orderState.options.type).toBe(3)
    })

    it('gives a guest left without a type the first allowed one once the options have loaded', async () => {
      mocks.orderTypesAllowed = '2|3'
      mocks.defaultOrderType = 'delivery'
      useGuestConfig()
      renderProvider({ disableWorkerPickup: true })
      await waitFor(() => expect(orderState.loading).toBe(false))
      await act(async () => { orderActions.setStateValues({ options: { type: null } }) })
      await waitFor(() => expect(orderState.options.type).toBe(2))
      expect(strategy.setItem).toHaveBeenCalledWith('options', expect.objectContaining({ type: 2 }), true)
    })

    it('does not touch the type while the saved options are still loading', async () => {
      mocks.orderTypesAllowed = '1|2'
      mocks.defaultOrderType = 'reservation'
      let resolveOptions
      strategy.getItem.mockImplementation(() => new Promise(resolve => { resolveOptions = resolve }))
      useGuestConfig()
      renderProvider({ disableWorkerPickup: true })
      expect(strategy.setItem).not.toHaveBeenCalled()
      await act(async () => { resolveOptions({ type: 2 }) })
      await waitFor(() => expect(orderState.loading).toBe(false))
      expect(orderState.options.type).toBe(2)
    })

    it('without the prop it keeps the previous behavior: no mapped default stays without type', async () => {
      mocks.orderTypesAllowed = '1|2'
      mocks.defaultOrderType = 'reservation'
      useGuestConfig()
      renderProvider()
      expect(orderState.options.type).toBeUndefined()
      await waitFor(() => expect(orderState.loading).toBe(false))
      expect(orderState.options.type).toBeUndefined()
    })

    it('without the prop a not allowed default still goes through the existing fallback', async () => {
      mocks.orderTypesAllowed = '1|3'
      mocks.defaultOrderType = 'pickup'
      useGuestConfig()
      renderProvider()
      expect(orderState.options.type).toBe(2)
      await waitFor(() => expect(orderState.options.type).toBe(1))
    })
  })
})
