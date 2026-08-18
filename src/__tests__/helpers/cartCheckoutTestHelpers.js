export const sampleCart = {
  business_id: 5,
  uuid: 'cart-uuid-5'
}

export const sampleProduct = {
  id: 1,
  code: 'p1',
  quantity: 1,
  business_id: 5,
  balance: 1,
  inventoried: false,
  stock: 10
}

export function createInitialOrderState () {
  return {
    loading: false,
    options: { type: 1 },
    carts: {
      'businessId:5': {
        business_id: 5,
        uuid: 'cart-uuid-5',
        valid: true,
        status: 0,
        total: 25,
        balance: 25,
        coupon: { code: 'SAVE10' },
        products: [{
          id: 1,
          code: 'p1',
          quantity: 1,
          business_id: 5,
          balance: 1,
          inventoried: false
        }]
      },
      'businessId:6': {
        business_id: 6,
        uuid: 'cart-uuid-6',
        valid: true,
        status: 0,
        total: 15,
        balance: 15
      }
    }
  }
}

export function createInitialConfigState () {
  return {
    configs: {
      max_product_amount: { value: '100' },
      advanced_offers_module: { value: '0' }
    },
    order: { quantity: 0 }
  }
}

export function createCartCheckoutApiMocks (vi) {
  return {
    mockBusinessGet: vi.fn().mockResolvedValue({
      content: { error: false, result: { id: 5, name: 'Pizza Place', paymethods: [] } }
    }),
    mockProductsGet: vi.fn().mockResolvedValue({
      content: {
        error: false,
        result: [
          { id: 20, name: 'Fries', upselling: true, inventoried: false },
          { id: 21, name: 'Soda', upselling: false, inventoried: false }
        ]
      }
    }),
    mockGetBusinesses: vi.fn().mockResolvedValue({
      content: {
        error: false,
        result: [
          { id: 5, name: 'Store Alpha' },
          { id: 7, name: 'Store Beta' }
        ]
      }
    }),
    mockCartSet: vi.fn().mockResolvedValue({
      content: {
        error: false,
        result: {
          uuid: 'cart-uuid-5',
          business_id: 7,
          business: { slug: 'store-beta' }
        }
      }
    }),
    mockCartOffersGet: vi.fn().mockResolvedValue({
      content: {
        error: false,
        result: [{
          id: 50,
          coupon: 'SAVE10',
          name: 'Save 10%',
          applicable: true,
          stackable: false
        }]
      }
    })
  }
}

export function buildCartCheckoutMockOrdering (vi, api) {
  const productsApiChain = {
    parameters: vi.fn(function () { return productsApiChain }),
    get: (...args) => api.mockProductsGet(...args)
  }

  const businessApiChain = {
    select: vi.fn(function () { return businessApiChain }),
    parameters: vi.fn(function () { return businessApiChain }),
    products: vi.fn(() => productsApiChain),
    get: (...args) => api.mockBusinessGet(...args)
  }

  const cartsApiChain = {
    getBusinesses: (...args) => api.mockGetBusinesses(...args),
    getOffers: (...args) => api.mockCartOffersGet(...args),
    set: (...args) => api.mockCartSet(...args)
  }

  return {
    appId: 'app',
    appInternalName: 'web',
    root: 'https://api.test',
    project: 'demo',
    language: 'en',
    setAccessToken: vi.fn(() => ({
      carts: vi.fn(() => cartsApiChain)
    })),
    businesses: vi.fn(() => businessApiChain)
  }
}

export function createCartCheckoutFetchMock (vi) {
  return vi.fn(async (url, options = {}) => {
    const method = options.method || 'GET'
    if (url.includes('/cart_groups') && method === 'POST') {
      return { json: async () => ({ error: false, result: { uuid: 'group-uuid-1' } }) }
    }
    if (url.includes('/cart_groups/group-uuid-1/prepare')) {
      return {
        json: async () => ({
          error: false,
          result: { paymethods: [{ id: 1 }], wallets: [{ id: 2 }] }
        })
      }
    }
    if (url.includes('/cart_groups/group-uuid-1')) {
      return {
        json: async () => ({
          error: false,
          result: {
            uuid: 'group-uuid-1',
            balance: 40,
            carts: [
              { uuid: 'cart-uuid-5', business_id: 5, valid: true, status: 0, total: 25, delivery_price_with_discount: 2 },
              { uuid: 'cart-uuid-6', business_id: 6, valid: true, status: 0, total: 15, delivery_price_with_discount: 1 }
            ]
          }
        })
      }
    }
    if (url.includes('/users/8/wallets')) {
      return {
        json: async () => ({
          error: false,
          result: [{ id: 3, type: 'cash', business_id: 5 }]
        })
      }
    }
    if (url.includes('/loyalty_plans')) {
      return { json: async () => ({ error: false, result: [] }) }
    }
    if (url.includes('/delivery_options')) {
      return { json: async () => ({ error: false, result: [{ id: 2, name: 'Leave at door', enabled: true }] }) }
    }
    if (url.includes('/validation_field_order_types')) {
      return { json: async () => ({ error: false, result: [] }) }
    }
    if (url.includes('/carts/cart-uuid-5') && method === 'PUT') {
      return {
        json: async () => ({
          error: false,
          result: { business_id: 5, uuid: 'cart-uuid-5', comment: 'No onions', delivery_option_id: 2 }
        })
      }
    }
    if (url.includes('/carts/cart-uuid-5/upselling')) {
      return {
        json: async () => ({
          error: false,
          result: [{ id: 30, name: 'Cookie', upselling: true, inventoried: false }]
        })
      }
    }
    return { json: async () => ({ error: false, result: {} }) }
  })
}

export function setupCartCheckoutWindowLocation () {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { pathname: '/store/old-store', search: '', href: 'http://localhost/store/old-store' }
  })
}

export function createCartCheckoutTestContext (vi) {
  const api = createCartCheckoutApiMocks(vi)
  const mockOrderState = createInitialOrderState()
  const mockConfigState = createInitialConfigState()

  const mocks = {
    mockShowToast: vi.fn(),
    mockEmit: vi.fn(),
    mockRemoveProduct: vi.fn().mockResolvedValue(true),
    mockUpdateProduct: vi.fn().mockResolvedValue(true),
    mockRemoveOffer: vi.fn(),
    mockSetStateValues: vi.fn(),
    mockPlaceCart: vi.fn().mockResolvedValue({
      error: false,
      result: { uuid: 'cart-uuid-5', status: 1, business_id: 5, total: 25 }
    }),
    mockPlaceMultiCarts: vi.fn().mockResolvedValue({
      error: false,
      result: { status: 'completed', id: 99, balance: 40 }
    }),
    mockApplyCoupon: vi.fn(),
    mockApplyOffer: vi.fn().mockResolvedValue(true),
    mockRefreshOrderOptions: vi.fn().mockResolvedValue(true)
  }

  const reset = () => {
    vi.clearAllMocks()
    Object.assign(mockOrderState, createInitialOrderState())
    Object.assign(mockConfigState, createInitialConfigState())
    api.mockBusinessGet.mockImplementation(async () => ({
      content: { error: false, result: { id: 5, name: 'Pizza Place', paymethods: [] } }
    }))
    api.mockProductsGet.mockResolvedValue({
      content: {
        error: false,
        result: [
          { id: 20, name: 'Fries', upselling: true, inventoried: false },
          { id: 21, name: 'Soda', upselling: false, inventoried: false }
        ]
      }
    })
    api.mockGetBusinesses.mockImplementation(async (options = {}) => {
      if (options.cancelToken) options.cancelToken.cancel = vi.fn()
      return {
        content: {
          error: false,
          result: [
            { id: 5, name: 'Store Alpha' },
            { id: 7, name: 'Store Beta' }
          ]
        }
      }
    })
    api.mockCartSet.mockResolvedValue({
      content: {
        error: false,
        result: {
          uuid: 'cart-uuid-5',
          business_id: 7,
          business: { slug: 'store-beta' }
        }
      }
    })
    api.mockCartOffersGet.mockResolvedValue({
      content: {
        error: false,
        result: [{
          id: 50,
          coupon: 'SAVE10',
          name: 'Save 10%',
          applicable: true,
          stackable: false
        }]
      }
    })
    mocks.mockRemoveProduct.mockResolvedValue(true)
    mocks.mockUpdateProduct.mockResolvedValue(true)
    mocks.mockApplyCoupon.mockResolvedValue(true)
    mocks.mockApplyOffer.mockResolvedValue(true)
    mocks.mockPlaceCart.mockResolvedValue({
      error: false,
      result: { uuid: 'cart-uuid-5', status: 1, business_id: 5, total: 25 }
    })
    mocks.mockPlaceMultiCarts.mockResolvedValue({
      error: false,
      result: { status: 'completed', id: 99, balance: 40 }
    })
    mocks.mockRefreshOrderOptions.mockResolvedValue(true)
    global.fetch = createCartCheckoutFetchMock(vi)
    setupCartCheckoutWindowLocation()
  }

  return {
    ...api,
    ...mocks,
    mockOrderState,
    mockConfigState,
    mockOrdering: buildCartCheckoutMockOrdering(vi, api),
    reset,
    sampleCart,
    sampleProduct
  }
}
