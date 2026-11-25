import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const cart = vi.hoisted(() => {
  const { createCartCheckoutTestContext } = require('../../../__tests__/helpers/cartCheckoutTestHelpers')
  return createCartCheckoutTestContext(vi)
})

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
    updateProduct: cart.mockUpdateProduct,
    removeProduct: cart.mockRemoveProduct,
    clearCart: vi.fn(),
    removeOffer: cart.mockRemoveOffer,
    setStateValues: cart.mockSetStateValues,
    placeCart: cart.mockPlaceCart,
    placeMultiCarts: cart.mockPlaceMultiCarts,
    confirmMultiCarts: vi.fn(),
    applyCoupon: cart.mockApplyCoupon,
    applyOffer: cart.mockApplyOffer,
    refreshOrderOptions: cart.mockRefreshOrderOptions,
    changePaymethod: vi.fn()
  }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [cart.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-14' })
}))

// eslint-disable-next-line import/first
import { Cart } from '../index'

describe('Cart', () => {
  beforeEach(() => cart.reset())
  afterEach(() => vi.useRealTimers())

  it('updates product quantity through order context', async () => {
    const callback = vi.fn()
    renderController(Cart, { cart: cart.sampleCart, businessConfigs: [], callbackAfterUpdateCart: callback })
    await lastControllerProps.changeQuantity(cart.sampleProduct, 2)
    expect(cart.mockUpdateProduct).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2 }), cart.sampleCart)
    expect(callback).toHaveBeenCalled()
  })

  it('removes product when quantity is zero', async () => {
    renderController(Cart, { cart: cart.sampleCart, businessConfigs: [] })
    await lastControllerProps.changeQuantity(cart.sampleProduct, 0)
    expect(cart.mockRemoveProduct).toHaveBeenCalledWith(cart.sampleProduct, cart.sampleCart)
  })

  it('calculates max quantity for inventoried products', () => {
    renderController(Cart, { cart: cart.sampleCart, businessConfigs: [] })
    const max = lastControllerProps.getProductMax({
      ...cart.sampleProduct,
      inventoried: true,
      stock: 5,
      quantity: 2,
      balance: 2
    })
    expect(max).toBeGreaterThanOrEqual(2)
  })

  it('persists cart comments after debounce', async () => {
    vi.useFakeTimers()
    renderController(Cart, { cart: cart.sampleCart, businessConfigs: [], commentDelayTime: 100 })
    lastControllerProps.handleChangeComment('No onions')
    await vi.advanceTimersByTimeAsync(150)
    expect(lastControllerProps.commentState.loading).toBe(false)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/carts/cart-uuid-5',
      expect.objectContaining({ method: 'PUT' })
    )
    expect(cart.mockSetStateValues).toHaveBeenCalledWith({
      carts: {
        'businessId:5': expect.objectContaining({
          business_id: 5,
          comment: 'No onions'
        })
      }
    })
    expect(Object.keys(cart.mockSetStateValues.mock.calls[0][0].carts)).toEqual(['businessId:5'])
    expect(cart.mockOrderState.carts['businessId:5'].comment).toBeUndefined()
    expect(cart.mockOrderState.carts['businessId:6']).toEqual(expect.objectContaining({
      business_id: 6,
      uuid: 'cart-uuid-6'
    }))
  })

  it('delegates offer removal to order context', () => {
    renderController(Cart, { cart: cart.sampleCart, businessConfigs: [] })
    lastControllerProps.handleRemoveOfferClick(99, 12)
    expect(cart.mockRemoveOffer).toHaveBeenCalledWith({
      business_id: 5,
      offer_id: 99,
      user_id: 12
    })
  })

  describe('max_product_amount', () => {
    const maxFor = (product = {}) => {
      renderController(Cart, { cart: cart.sampleCart, businessConfigs: [] })
      return lastControllerProps.getProductMax({ ...cart.sampleProduct, quantity: 1, balance: 1, ...product })
    }

    it('reads the value of the setting', () => {
      cart.mockConfigState.configs = { max_product_amount: { value: '5' } }
      expect(maxFor()).toBe(5)
    })

    it('discounts the units already in the order', () => {
      cart.mockConfigState.configs = { max_product_amount: { value: '5' } }
      cart.mockConfigState.order = { quantity: 2 }
      expect(maxFor()).toBe(3)
    })

    it('uses 100 without the setting', () => {
      cart.mockConfigState.configs = {}
      expect(maxFor()).toBe(100)
    })

    it('uses 100 when the value is not a number', () => {
      cart.mockConfigState.configs = { max_product_amount: { value: 'many' } }
      expect(maxFor()).toBe(100)
    })

    it('lets the stock of an inventoried product win over the setting', () => {
      cart.mockConfigState.configs = { max_product_amount: { value: '5' } }
      expect(maxFor({ inventoried: true, stock: 3 })).toBe(3)
    })
  })
})
