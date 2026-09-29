export const sampleReviews = [
  { id: 1, total: 5, comment: 'Excellent food', created_at: '2026-01-02 10:00:00' },
  { id: 2, total: 3, comment: 'Okay service', created_at: '2026-01-01 10:00:00' }
]

export const sampleBusiness = {
  id: 5,
  name: 'Pizza Place',
  schedule: Array.from({ length: 7 }, () => ({
    enabled: true,
    lapses: [{ open: { hour: 9, minute: 0 }, close: { hour: 17, minute: 0 } }]
  }))
}

export const sampleProfessional = { id: 12, name: 'Jane', lastname: 'Pro' }

export const mockT = (key, fallback) => fallback || key

export function createInitialConfigState () {
  return {
    stripe_currency: { value: 'USD' },
    dates_general_format: { value: 'YYYY-MM-DD HH:mm:ss' },
    reservation_setting: {
      value: JSON.stringify({
        min_time_reserve_minutes: 30,
        max_time_reserve_days: 7,
        allow_preorder_reservation: true
      })
    }
  }
}

export function createInitialOrderState () {
  return {
    loading: false,
    options: {
      type: 1,
      address: { location: { lat: 40.7, lng: -74 } }
    }
  }
}

export function createAnalyticsCmsApiMocks (vi) {
  return {
    mockPagesGet: vi.fn(),
    mockBusinessGet: vi.fn(),
    mockUsersGet: vi.fn()
  }
}

export function buildAnalyticsCmsMockOrdering (vi, api) {
  const businessApiChain = {
    select: vi.fn(function () { return businessApiChain }),
    get: (...args) => api.mockBusinessGet(...args)
  }

  const pagesApiChain = {
    get: (...args) => api.mockPagesGet(...args)
  }

  const usersSelectChain = {
    select: vi.fn(function () { return usersSelectChain }),
    get: (...args) => api.mockUsersGet(...args)
  }

  return {
    appId: 'app',
    appInternalName: 'web',
    root: 'https://api.test',
    project: 'demo',
    setAccessToken: vi.fn(() => ({
      users: vi.fn((userId) => userId !== undefined
        ? { select: vi.fn(() => usersSelectChain), get: (...args) => api.mockUsersGet(...args) }
        : usersSelectChain)
    })),
    pages: vi.fn(() => pagesApiChain),
    businesses: vi.fn(() => businessApiChain),
    users: vi.fn((userId) => ({
      select: vi.fn(() => usersSelectChain),
      get: (...args) => api.mockUsersGet(...args)
    }))
  }
}

export function createAnalyticsCmsFetchMock (vi) {
  return vi.fn(async (url, options = {}) => {
    const method = options.method || 'GET'
    if (url.includes('/offers/public')) {
      return {
        json: async () => ({
          error: false,
          result: [{
            id: 1,
            name: '10% Off',
            businesses: [{ id: 5, slug: 'pizza-place' }]
          }]
        })
      }
    }
    if (url.includes('/validation_field_order_types')) {
      return { json: async () => ({ error: false, result: [{ id: 1, name: 'guests' }] }) }
    }
    if (url.includes('/users/8/favorite_orders')) {
      return {
        json: async () => ({
          error: false,
          result: [{ object_id: 101 }],
          pagination: { current_page: 1, page_size: 10, total_pages: 1, total: 1, from: 1, to: 1 }
        })
      }
    }
    if (url.includes('/orders?')) {
      return {
        json: async () => ({
          error: false,
          result: [{ id: 101, business_id: 5, status: 1 }]
        })
      }
    }
    if (url.includes('/users/12/user_reviews')) {
      return { json: async () => ({ error: false, result: [{ id: 1, rating: 5 }] }) }
    }
    if (url.includes('/users/8/favorite_users') && method === 'POST') {
      return { json: async () => ({ error: false, result: { success: true } }) }
    }
    if (url.includes('/users/8/favorite_users/12') && method === 'DELETE') {
      return { json: async () => ({ error: false, result: { success: true } }) }
    }
    if (url.includes('/google/conversions/order-completed') && method === 'POST') {
      return { json: async () => ({ error: false, result: { success: true } }) }
    }
    if (url.includes('/frontend/settings')) {
      return {
        json: async () => ({
          result: { settings: { conversion_secret: { value: 'secret-abc' } } }
        })
      }
    }
    return { json: async () => ({ error: false, result: {} }) }
  })
}

export function createMockSocket (vi) {
  return {
    socket: { on: vi.fn(), connected: true },
    getId: () => 'socket-18',
    on: vi.fn(),
    off: vi.fn(),
    join: vi.fn(),
    leave: vi.fn()
  }
}

export function createGetLatestHandler (mockEventsOn) {
  return (eventName) => {
    const handlers = mockEventsOn.mock.calls.filter(([event]) => event === eventName)
    return handlers[handlers.length - 1]?.[1]
  }
}

export function createAnalyticsCmsTestContext (vi) {
  const api = createAnalyticsCmsApiMocks(vi)
  const mockOrderState = createInitialOrderState()
  const mockConfigState = createInitialConfigState()
  const mockSocket = createMockSocket(vi)

  const mocks = {
    mockTrack: vi.fn(),
    mockIdentify: vi.fn(),
    mockFbq: vi.fn(),
    mockShowToast: vi.fn(),
    mockEmit: vi.fn(),
    mockEventsOn: vi.fn(),
    mockEventsOff: vi.fn(),
    mockCreateReservation: vi.fn(),
    mockReorder: vi.fn(),
    mockOnNotFound: vi.fn(),
    mockHandleUpdateProfessionals: vi.fn(),
    mockHandleUpdateFavoriteList: vi.fn()
  }

  const reset = () => {
    vi.clearAllMocks()
    Object.assign(mockOrderState, createInitialOrderState())
    Object.assign(mockConfigState, createInitialConfigState())
    global.fetch = createAnalyticsCmsFetchMock(vi)
    global.fbq = mocks.mockFbq
    sessionStorage.clear()

    api.mockPagesGet.mockImplementation(async (options) => {
      if (options?.cancelToken) {
        options.cancelToken.cancel = vi.fn()
      }
      return {
        content: { error: false, result: { body: '<p>CMS page</p>' } }
      }
    })
    api.mockBusinessGet.mockImplementation(async (options) => {
      if (options?.cancelToken) {
        options.cancelToken.cancel = vi.fn()
      }
      return {
        content: {
          error: false,
          result: {
            reviews: { reviews: sampleReviews }
          }
        }
      }
    })
    api.mockUsersGet.mockResolvedValue({
      content: { error: false, result: sampleProfessional }
    })
    mocks.mockCreateReservation.mockResolvedValue({
      error: false,
      result: { id: 55, reservation: true }
    })
    mocks.mockReorder.mockResolvedValue({
      error: false,
      result: [{ uuid: 'cart-uuid-5' }]
    })
  }

  return {
    ...api,
    ...mocks,
    mockOrderState,
    mockConfigState,
    mockSocket,
    mockOrdering: buildAnalyticsCmsMockOrdering(vi, api),
    getLatestHandler: () => createGetLatestHandler(mocks.mockEventsOn),
    reset,
    sampleReviews,
    sampleBusiness,
    sampleProfessional,
    mockT
  }
}
