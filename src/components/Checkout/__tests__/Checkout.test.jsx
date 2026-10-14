import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

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

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-14' })
}))

// eslint-disable-next-line import/first
import { Checkout } from '../index'

describe('Checkout', () => {
  beforeEach(() => cart.reset())

  it('loads business details on mount', async () => {
    renderController(Checkout, { businessId: 5 })
    await waitFor(() => {
      expect(lastControllerProps.businessDetails.loading).toBe(false)
    })
    expect(cart.mockBusinessGet).toHaveBeenCalled()
  })

  it('updates selected paymethod', async () => {
    renderController(Checkout, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    lastControllerProps.handlePaymethodChange({ paymethodId: 3, gateway: 'cash' })
    await waitFor(() => {
      expect(lastControllerProps.paymethodSelected.paymethodId).toBe(3)
    })
  })

  it('places order through order context', async () => {
    const onPlaceOrderClick = vi.fn()
    renderController(Checkout, {
      businessId: 5,
      onPlaceOrderClick
    })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    lastControllerProps.handlePaymethodChange({ paymethodId: 3, gateway: 'cash', data: {} })
    await lastControllerProps.handlerClickPlaceOrder({}, {}, null, null, lastControllerProps.paymethodSelected)
    expect(cart.mockPlaceCart).toHaveBeenCalledWith('cart-uuid-5', expect.any(Object))
    expect(onPlaceOrderClick).toHaveBeenCalled()
    expect(cart.mockCartSet).not.toHaveBeenCalled()
  })

  it('places a stripe connect v2 order with the card as source', async () => {
    renderController(Checkout, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    const paymethod = {
      paymethodId: 85,
      gateway: 'stripe_connect_v2',
      paymethod: { id: 85, gateway: 'stripe_connect_v2' },
      data: { id: 'pm_1', type: 'card', card: { brand: 'visa', last4: '4242' } }
    }
    await lastControllerProps.handlerClickPlaceOrder({}, {}, null, null, paymethod)
    expect(cart.mockPlaceCart).toHaveBeenCalledWith('cart-uuid-5', expect.objectContaining({
      paymethod_id: 85,
      paymethod_data: { source_id: 'pm_1' }
    }))
  })

  it('waits for eat-in spot save before placing', async () => {
    cart.mockOrderState.options.type = 3
    let resolveSpot
    cart.mockCartSet.mockImplementationOnce(() => new Promise(resolve => {
      resolveSpot = () => resolve({
        content: {
          error: false,
          result: { uuid: 'cart-uuid-5', business_id: 5, spot_number: 12 }
        }
      })
    }))
    const onPlaceOrderClick = vi.fn()
    renderController(Checkout, { businessId: 5, onPlaceOrderClick })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    lastControllerProps.handlePaymethodChange({ paymethodId: 3, gateway: 'cash', data: {} })
    lastControllerProps.setPlaceSpotNumber(12)
    await waitFor(() => expect(lastControllerProps.placeSpotNumber).toBe(12))

    const placePromise = lastControllerProps.handlerClickPlaceOrder(
      {},
      {},
      null,
      null,
      lastControllerProps.paymethodSelected
    )
    await waitFor(() => {
      expect(cart.mockCartSet).toHaveBeenCalledWith({ spot_number: 12 })
    })
    expect(cart.mockPlaceCart).not.toHaveBeenCalled()

    resolveSpot()
    await placePromise
    expect(cart.mockPlaceCart).toHaveBeenCalledWith('cart-uuid-5', expect.any(Object))
    expect(onPlaceOrderClick).toHaveBeenCalled()
  })

  it('does not place when eat-in spot save fails', async () => {
    cart.mockOrderState.options.type = 3
    cart.mockCartSet.mockResolvedValueOnce({
      content: { error: true, result: ['Invalid spot'] }
    })
    const onPlaceOrderClick = vi.fn()
    renderController(Checkout, { businessId: 5, onPlaceOrderClick })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    lastControllerProps.handlePaymethodChange({ paymethodId: 3, gateway: 'cash', data: {} })
    lastControllerProps.setPlaceSpotNumber(12)
    await waitFor(() => expect(lastControllerProps.placeSpotNumber).toBe(12))

    await lastControllerProps.handlerClickPlaceOrder(
      {},
      {},
      null,
      null,
      lastControllerProps.paymethodSelected
    )

    expect(cart.mockCartSet).toHaveBeenCalledWith({ spot_number: 12 })
    expect(cart.mockPlaceCart).not.toHaveBeenCalled()
    expect(onPlaceOrderClick).not.toHaveBeenCalled()
    expect(lastControllerProps.placing).toBe(false)
  })

  it('updates delivery option on cart', async () => {
    renderController(Checkout, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    await lastControllerProps.handleChangeDeliveryOption(2)
    await waitFor(() => {
      expect(lastControllerProps.deliveryOptionSelected).toBe(2)
    })
    expect(cart.mockSetStateValues).toHaveBeenCalled()
  })

  it('does not treat Apple Pay as placed when confirmPayment fails', async () => {
    cart.mockPlaceCart.mockResolvedValue({
      error: false,
      result: {
        uuid: 'cart-uuid-5',
        status: 1,
        paymethod_data: {
          gateway: 'apple_pay',
          result: { client_secret: 'secret_apple' }
        }
      }
    })
    const onPlaceOrderClick = vi.fn()
    const confirmPayment = vi.fn().mockResolvedValue({ error: { message: 'Card declined' } })
    renderController(Checkout, {
      businessId: 5,
      onPlaceOrderClick
    })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    const applePaymethod = { paymethodId: 9, paymethod: { gateway: 'apple_pay' }, data: {} }
    lastControllerProps.handlePaymethodChange(applePaymethod)
    await lastControllerProps.handlerClickPlaceOrder({}, {}, confirmPayment, null, applePaymethod)
    expect(confirmPayment).toHaveBeenCalledWith('secret_apple')
    expect(onPlaceOrderClick).not.toHaveBeenCalled()
  })

  it('still places when Apple Pay confirm only reports the missing applePay parameter', async () => {
    cart.mockPlaceCart.mockResolvedValue({
      error: false,
      result: {
        uuid: 'cart-uuid-5',
        status: 1,
        paymethod_data: {
          gateway: 'apple_pay',
          result: { client_secret: 'secret_apple' }
        }
      }
    })
    const onPlaceOrderClick = vi.fn()
    const confirmPayment = vi.fn().mockResolvedValue({
      error: { message: 'You must provide the `applePay` parameter.' }
    })
    renderController(Checkout, {
      businessId: 5,
      onPlaceOrderClick
    })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    const applePaymethod = { paymethodId: 9, paymethod: { gateway: 'apple_pay' }, data: {} }
    await lastControllerProps.handlerClickPlaceOrder({}, {}, confirmPayment, null, applePaymethod)
    expect(onPlaceOrderClick).toHaveBeenCalled()
  })

  it('blocks duplicate place order while checkout is in progress', async () => {
    cart.mockPlaceCart.mockImplementationOnce(() => new Promise(() => {}))
    const onPlaceOrderClick = vi.fn()
    renderController(Checkout, {
      businessId: 5,
      onPlaceOrderClick
    })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    lastControllerProps.handlePaymethodChange({ paymethodId: 3, gateway: 'cash', data: {} })
    lastControllerProps.handlerClickPlaceOrder({}, {}, null, null, lastControllerProps.paymethodSelected)
    await waitFor(() => {
      expect(lastControllerProps.placing).toBe(true)
    })
    lastControllerProps.handlerClickPlaceOrder({}, {}, null, null, lastControllerProps.paymethodSelected)
    expect(cart.mockShowToast).toHaveBeenCalled()
  })

  it('posts Credomatic amount from remaining cart balance', async () => {
    document.querySelectorAll('form').forEach(form => form.remove())
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    renderController(Checkout, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    await lastControllerProps.handleConfirmCredomaticPage(
      {
        uuid: 'cart-uuid-5',
        total: 40,
        balance: 10,
        paymethod_data: { result: { hash: 'hash1', time: '123' } }
      },
      { data: { ccnumber: '4111111111111111', cvv: '123', ccexp: '1228' } }
    )
    expect(document.querySelector('form input[name="amount"]').value).toBe('10')
    submit.mockRestore()
  })

  it('posts Credomatic amount from total when there is no remainder', async () => {
    document.querySelectorAll('form').forEach(form => form.remove())
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    renderController(Checkout, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    await lastControllerProps.handleConfirmCredomaticPage(
      {
        uuid: 'cart-uuid-5',
        total: 40,
        paymethod_data: { result: { hash: 'hash1', time: '123' } }
      },
      { data: { ccnumber: '4111111111111111', cvv: '123', ccexp: '1228' } }
    )
    expect(document.querySelector('form input[name="amount"]').value).toBe('40')
    submit.mockRestore()
  })
})

describe('Checkout pending cart release', () => {
  const releaseBody = { mercado_pago_data: { status: 'cancelled' } }
  const pendingPaymethodData = { gateway: 'mercado_pago_checkout_pro', status: 2 }

  const setCart = (values) => {
    cart.mockOrderState.carts['businessId:5'] = {
      ...cart.mockOrderState.carts['businessId:5'],
      ...values
    }
  }

  const renderPendingCheckout = async (values = {}) => {
    setCart({ status: 2, paymethod_data: pendingPaymethodData, ...values })
    renderController(Checkout, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
  }

  const release = async () => {
    let response
    await act(async () => {
      response = await lastControllerProps.handleReleasePendingCart()
    })
    return response
  }

  beforeEach(() => {
    cart.reset()
    mockConfirmCart.mockReset()
  })

  it('marks a pending cart of a releasable gateway as releasable', async () => {
    await renderPendingCheckout()
    expect(lastControllerProps.isPendingCartReleasable).toBe(true)
    expect(lastControllerProps.releasingPendingCart).toBe(false)
  })

  it('reads the gateway from paymethod_data sent as a JSON string', async () => {
    await renderPendingCheckout({ paymethod_data: JSON.stringify(pendingPaymethodData) })
    expect(lastControllerProps.isPendingCartReleasable).toBe(true)
  })

  it('is not releasable when the cart is not pending', async () => {
    await renderPendingCheckout({ status: 0 })
    expect(lastControllerProps.isPendingCartReleasable).toBe(false)
  })

  it('is not releasable for a gateway outside the releasable map', async () => {
    await renderPendingCheckout({ paymethod_data: { gateway: 'stripe_redirect', status: 2 } })
    expect(lastControllerProps.isPendingCartReleasable).toBe(false)
  })

  it('is not releasable when the gateway is an inherited object key', async () => {
    await renderPendingCheckout({ paymethod_data: { gateway: '__proto__', status: 2 } })
    expect(lastControllerProps.isPendingCartReleasable).toBe(false)
    expect(await release()).toBeUndefined()
    await renderPendingCheckout({ paymethod_data: { gateway: 'constructor', status: 2 } })
    expect(lastControllerProps.isPendingCartReleasable).toBe(false)
    expect(mockConfirmCart).not.toHaveBeenCalled()
  })

  it('is not releasable when paymethod_data is missing or malformed', async () => {
    await renderPendingCheckout({ paymethod_data: '{not json' })
    expect(lastControllerProps.isPendingCartReleasable).toBe(false)
    setCart({ paymethod_data: null })
    renderController(Checkout, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.businessDetails.loading).toBe(false))
    expect(lastControllerProps.isPendingCartReleasable).toBe(false)
  })

  it('does not call the API when the cart is not releasable', async () => {
    await renderPendingCheckout({ status: 0 })
    expect(await release()).toBeUndefined()
    expect(mockConfirmCart).not.toHaveBeenCalled()
  })

  it('returns released when the API answers with an error and a cancelled cart', async () => {
    const releasedCart = { uuid: 'cart-uuid-5', business_id: 5, status: 4, paymethod_id: null }
    mockConfirmCart.mockResolvedValue({ error: true, result: ['Payment cancelled'], cart: releasedCart })
    await renderPendingCheckout()
    const response = await release()
    expect(mockConfirmCart).toHaveBeenCalledWith('cart-uuid-5', releaseBody)
    expect(response).toEqual({
      outcome: 'released',
      order: undefined,
      cart: releasedCart,
      result: ['Payment cancelled']
    })
    expect(lastControllerProps.releasingPendingCart).toBe(false)
  })

  it('returns released when the API answers without error and a cancelled cart', async () => {
    const releasedCart = { uuid: 'cart-uuid-5', business_id: 5, status: 4, paymethod_id: null }
    mockConfirmCart.mockResolvedValue({ error: false, result: releasedCart })
    await renderPendingCheckout()
    const response = await release()
    expect(response.outcome).toBe('released')
    expect(response.cart).toBe(releasedCart)
  })

  it('returns order_created when the payment was already approved', async () => {
    const paidCart = { uuid: 'cart-uuid-5', business_id: 5, status: 1, order: { uuid: 'order-uuid-1' } }
    mockConfirmCart.mockResolvedValue({ error: false, result: paidCart })
    await renderPendingCheckout()
    const response = await release()
    expect(response).toEqual({
      outcome: 'order_created',
      order: { uuid: 'order-uuid-1' },
      cart: paidCart,
      result: paidCart
    })
  })

  it('returns order_created when the result carries an order without status 1', async () => {
    mockConfirmCart.mockResolvedValue({ error: false, result: { uuid: 'cart-uuid-5', order: { uuid: 'order-uuid-1' } } })
    await renderPendingCheckout()
    const response = await release()
    expect(response.outcome).toBe('order_created')
    expect(response.order).toEqual({ uuid: 'order-uuid-1' })
  })

  it('returns still_pending when the cart stays pending', async () => {
    const pendingCart = { uuid: 'cart-uuid-5', business_id: 5, status: 2 }
    mockConfirmCart.mockResolvedValue({ error: false, result: pendingCart })
    await renderPendingCheckout()
    const response = await release()
    expect(response.outcome).toBe('still_pending')
    expect(response.cart).toBe(pendingCart)
  })

  it('returns error when the request fails without a cart', async () => {
    mockConfirmCart.mockResolvedValue({ error: true, result: ['Network Error'] })
    await renderPendingCheckout()
    const response = await release()
    expect(response).toEqual({
      outcome: 'error',
      order: undefined,
      cart: undefined,
      result: ['Network Error']
    })
    expect(lastControllerProps.releasingPendingCart).toBe(false)
  })

  it('returns error when the API fails and the cart is still pending', async () => {
    mockConfirmCart.mockResolvedValue({
      error: true,
      result: ['Something went wrong'],
      cart: { uuid: 'cart-uuid-5', business_id: 5, status: 2 }
    })
    await renderPendingCheckout()
    const response = await release()
    expect(response.outcome).toBe('error')
  })

  it('does not send a second request while one is in progress', async () => {
    let resolveConfirm
    mockConfirmCart.mockImplementation(() => new Promise(resolve => { resolveConfirm = resolve }))
    await renderPendingCheckout()

    let firstCall
    let sameRenderCall
    act(() => {
      firstCall = lastControllerProps.handleReleasePendingCart()
      sameRenderCall = lastControllerProps.handleReleasePendingCart()
    })
    await waitFor(() => expect(lastControllerProps.releasingPendingCart).toBe(true))
    const nextRenderCall = lastControllerProps.handleReleasePendingCart()

    expect(mockConfirmCart).toHaveBeenCalledTimes(1)
    expect(await sameRenderCall).toBeUndefined()
    expect(await nextRenderCall).toBeUndefined()

    await act(async () => {
      resolveConfirm({ error: false, result: { uuid: 'cart-uuid-5', business_id: 5, status: 2 } })
      await firstCall
    })
    expect((await firstCall).outcome).toBe('still_pending')
    expect(lastControllerProps.releasingPendingCart).toBe(false)

    mockConfirmCart.mockResolvedValue({ error: true, result: ['Network Error'] })
    await release()
    expect(mockConfirmCart).toHaveBeenCalledTimes(2)
  })
})
