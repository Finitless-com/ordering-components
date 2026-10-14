export const samplePaymethods = [
  {
    paymethod: { id: 1, name: 'Cash', gateway: 'cash', image: 'https://cdn.test/cash.png' },
    data: {},
    sandbox: false
  },
  {
    paymethod: {
      id: 2,
      name: 'Stripe',
      gateway: 'stripe',
      data_template: [{ key: 'image', default_value: 'https://cdn.test/stripe.png' }]
    },
    data: { publishable: 'pk_test' },
    sandbox: true
  },
  {
    paymethod: { id: 3, name: 'Blocked', gateway: 'paypal_express' },
    data: { client_id: 'cid' },
    sandbox: false
  }
]

export function createInitialPaymentOrderState () {
  return {
    loading: false,
    options: { type: 1 },
    carts: {
      'businessId:5': {
        business_id: 5,
        uuid: 'cart-uuid-5',
        total: 42,
        balance: 42
      }
    }
  }
}

export function createPaymentApiMocks (vi) {
  return {
    mockBusinessGet: vi.fn().mockResolvedValue({
      content: {
        error: false,
        result: {
          id: 5,
          paymethods: [{
            paymethod: { id: 1, name: 'Cash', gateway: 'cash' },
            data: {},
            sandbox: false
          }]
        }
      }
    }),
    mockPaymentCardsGet: vi.fn().mockResolvedValue({
      content: {
        result: [{ id: 10, brand: 'visa', last4: '4242', default: true, zipcode: '10001' }]
      }
    }),
    mockPaymentCardsDelete: vi.fn().mockResolvedValue({ content: { error: false } }),
    mockPaymentCards: vi.fn(),
    mockGetCredentials: vi.fn().mockResolvedValue({
      content: { result: { publishable: 'pk_test_123' } }
    }),
    mockUsersGet: vi.fn().mockResolvedValue({
      content: {
        error: false,
        result: { loyalty_level: { id: 1, name: 'Gold' }, loyalty_level_points: 100 }
      }
    }),
    mockGetGiftCardPaymethods: vi.fn().mockResolvedValue([
      { id: 9, name: 'Gift Card', gateway: 'gift_card', image: 'gift.png' }
    ])
  }
}

export function buildPaymentMockOrdering (vi, api) {
  const businessApiChain = {
    select: vi.fn(function () { return businessApiChain }),
    get: (...args) => api.mockBusinessGet(...args)
  }

  const paymentCardsApi = {
    get: (...args) => api.mockPaymentCardsGet(...args),
    getCredentials: (...args) => api.mockGetCredentials(...args),
    delete: (...args) => api.mockPaymentCardsDelete(...args)
  }

  const paymentCards = (...args) => {
    api.mockPaymentCards(...args)
    return paymentCardsApi
  }

  const usersApiChain = {
    select: vi.fn(function () { return usersApiChain }),
    get: (...args) => api.mockUsersGet(...args)
  }

  return {
    appId: 'app',
    appInternalName: 'web',
    root: 'https://api.test',
    project: 'demo',
    businesses: vi.fn(() => businessApiChain),
    setAccessToken: vi.fn(() => ({
      paymentCards: vi.fn(paymentCards)
    })),
    paymentCards: vi.fn(paymentCards),
    users: vi.fn(() => usersApiChain)
  }
}

export function createPaymentFetchMock (vi) {
  return vi.fn(async (url, options = {}) => {
    const method = options.method || 'GET'
    if (url.includes('/payments/stripe/credentials')) {
      return { json: async () => ({ result: { publishable: 'pk_live_test' } }) }
    }
    if (url.includes('/payments/stripe/requirements')) {
      return { json: async () => ({ result: { client_secret: 'sec_test' } }) }
    }
    if (url.includes('/payments/stripe_connect_v2/requirements')) {
      return { json: async () => ({ result: { client_secret: 'sec_connect_v2' } }) }
    }
    if (url.includes('/payments/stripe/cards/default') && method === 'POST') {
      return { json: async () => ({ error: false, result: { success: true } }) }
    }
    if (url.includes('/paymethods') && method === 'GET' && !url.includes('/users/')) {
      return { json: async () => ({ error: false, result: [{ id: 1, name: 'Cash', gateway: 'cash' }] }) }
    }
    if (url.includes('/users/8/wallets') && method === 'GET') {
      return {
        json: async () => ({
          error: false,
          result: [{ id: 3, type: 'cash', business_id: 5 }]
        })
      }
    }
    if (url.includes('/users/8/wallets/3/events')) {
      return { json: async () => ({ error: false, result: [{ id: 1, type: 'credit' }] }) }
    }
    if (url.includes('/carts/cart-uuid-5/wallets') && method === 'POST') {
      return {
        json: async () => ({
          error: false,
          result: { business_id: 5, uuid: 'cart-uuid-5', wallets: [{ id: 3 }] }
        })
      }
    }
    if (url.includes('/carts/cart-uuid-5/wallets/3') && method === 'DELETE') {
      return {
        json: async () => ({
          error: false,
          result: { business_id: 5, uuid: 'cart-uuid-5', wallets: [] }
        })
      }
    }
    if (url.includes('/loyalty_plans')) {
      return { json: async () => ({ error: false, result: [] }) }
    }
    if (url.includes('/loyalty_levels')) {
      return { json: async () => ({ error: false, result: [{ id: 1, name: 'Silver' }] }) }
    }
    if (url.includes('/text_messages/send') && method === 'POST') {
      return { json: async () => ({ error: false, result: { sent: true } }) }
    }
    if (url.includes('/payments/stripe/cards') && method === 'POST') {
      return {
        json: async () => ({
          error: false,
          result: { id: 99, brand: 'visa', last4: '4242' }
        })
      }
    }
    if (url.includes('/payments/stripe_connect_v2/cards') && method === 'POST') {
      return {
        json: async () => ({
          error: false,
          result: { id: 'pm_connect_v2', brand: 'visa', last4: '4242' }
        })
      }
    }
    if (url.includes('/users/8/paymethods/3/paymethods?where=')) {
      return {
        json: async () => ({
          error: false,
          result: [{
            id: 13,
            type: 'card',
            external_id: 'iz_tok',
            type_data: { brand: 'visa', last4: '3333' }
          }]
        })
      }
    }
    if (url.includes('/users/8/paymethods/2/paymethods') && !url.includes('/business/')) {
      return {
        json: async () => ({
          error: false,
          result: [{
            id: 11,
            type: 'card',
            external_id: 'card_tok',
            type_data: { brand: 'visa', last4: '1111' }
          }]
        })
      }
    }
    if (url.includes('/business/5/paymethods/2/users/8/paymethods')) {
      return {
        json: async () => ({
          error: false,
          result: [{
            id: 11,
            type: 'card',
            external_id: 'card_tok',
            type_data: { brand: 'visa', last4: '1111' }
          }]
        })
      }
    }
    return { json: async () => ({ error: false, result: {} }) }
  })
}

export function createPaymentTestContext (vi) {
  const api = createPaymentApiMocks(vi)
  const mockOrderState = createInitialPaymentOrderState()

  const mocks = {
    mockShowToast: vi.fn(),
    mockEmit: vi.fn(),
    mockChangePaymethod: vi.fn(),
    mockPlaceCart: vi.fn().mockResolvedValue({
      error: false,
      result: { pay_reference: 'pay-ref-1', uuid: 'cart-uuid-5' }
    }),
    mockConfirmCart: vi.fn().mockResolvedValue({
      error: false,
      result: { order: { uuid: 'order-uuid-1' } }
    }),
    mockSetStateValues: vi.fn(),
    mockEventsOn: vi.fn(),
    mockEventsOff: vi.fn(),
    mockCreatePaymentMethod: vi.fn().mockResolvedValue({
      error: null,
      paymentMethod: { id: 'pm_123', card: { brand: 'visa', last4: '4242' } }
    }),
    mockConfirmCardSetup: vi.fn().mockResolvedValue({
      error: null,
      setupIntent: { payment_method: 'pm_setup_1' }
    }),
    mockGetElement: vi.fn(() => ({}))
  }

  const reset = () => {
    vi.clearAllMocks()
    Object.assign(mockOrderState, createInitialPaymentOrderState())
    global.fetch = createPaymentFetchMock(vi)
    api.mockBusinessGet.mockImplementation(async () => ({
      content: {
        error: false,
        result: {
          id: 5,
          paymethods: [{
            paymethod: { id: 1, name: 'Cash', gateway: 'cash' },
            data: {},
            sandbox: false
          }]
        }
      }
    }))
    api.mockPaymentCardsGet.mockResolvedValue({
      content: {
        result: [{ id: 10, brand: 'visa', last4: '4242', default: true, zipcode: '10001' }]
      }
    })
    api.mockPaymentCardsDelete.mockResolvedValue({ content: { error: false } })
    api.mockGetCredentials.mockResolvedValue({
      content: { result: { publishable: 'pk_test_123' } }
    })
    api.mockUsersGet.mockResolvedValue({
      content: {
        error: false,
        result: { loyalty_level: { id: 1, name: 'Gold' }, loyalty_level_points: 100 }
      }
    })
    mocks.mockPlaceCart.mockResolvedValue({
      error: false,
      result: { pay_reference: 'pay-ref-1', uuid: 'cart-uuid-5' }
    })
    mocks.mockConfirmCart.mockResolvedValue({
      error: false,
      result: { order: { uuid: 'order-uuid-1' } }
    })
    mocks.mockCreatePaymentMethod.mockResolvedValue({
      error: null,
      paymentMethod: { id: 'pm_123', card: { brand: 'visa', last4: '4242' } }
    })
    mocks.mockConfirmCardSetup.mockResolvedValue({
      error: null,
      setupIntent: { payment_method: 'pm_setup_1' }
    })
    window.paypal = undefined
    window.Square = undefined
  }

  return {
    ...api,
    ...mocks,
    mockOrderState,
    mockOrdering: buildPaymentMockOrdering(vi, api),
    reset,
    samplePaymethods
  }
}

export const createStripeElementsMock = (vi, pay) => ({
  CardElement: 'CardElement',
  CardNumberElement: 'CardNumberElement',
  useStripe: () => ({
    createPaymentMethod: pay.mockCreatePaymentMethod,
    confirmCardSetup: pay.mockConfirmCardSetup
  }),
  useElements: () => ({
    getElement: pay.mockGetElement,
    update: vi.fn()
  })
})
