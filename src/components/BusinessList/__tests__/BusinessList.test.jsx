import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const biz = vi.hoisted(() => {
  const h = require('../../../__tests__/helpers/businessDiscoveryTestHelpers')
  const api = h.createBusinessApiMocks(vi)
  const state = { testAdvancedSearch: '0', configOverride: {}, orderState: null }
  const reset = () => {
    state.testAdvancedSearch = '0'
    state.configOverride = {}
    state.orderState = null
    vi.clearAllMocks()
    h.applyDefaultBusinessMockImplementations(vi, api)
    h.setupFetchMock(vi)
  }
  return {
    ...api,
    mockOrdering: h.buildBusinessMockOrdering(vi, api),
    mockSocket: h.createBusinessMockSocket(vi),
    state,
    reset,
    discoveryConfigs: h.discoveryConfigs,
    defaultOrderState: h.defaultOrderState
  }
})

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ language: { code: 'en' } }, (key, fallback) => fallback || key]
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    user: { id: 8 },
    token: 'session-tok'
  }, { refreshUserInfo: vi.fn() }]
}))

vi.mock('../../../contexts/OrderingThemeContext', () => ({
  useOrderingTheme: () => [{ theme: { business_listing_view: { components: { cities: { hidden: true } } } } }]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{ configs: { ...biz.discoveryConfigs(biz.state), ...biz.state.configOverride } }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [biz.state.orderState || biz.defaultOrderState, { changeAddress: vi.fn() }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [biz.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => biz.mockSocket
}))

import { BusinessList } from '../index'

describe('BusinessList', () => {
  beforeEach(() => biz.reset())

  it('loads businesses when order state is ready', async () => {
    renderController(BusinessList, { isOrderStateReady: true, avoidRefreshUserInfo: true })
    await waitFor(() => {
      expect(lastControllerProps.businessesList.loading).toBe(false)
    })
    expect(lastControllerProps.businessesList.businesses).toHaveLength(1)
    expect(lastControllerProps.businessesList.businesses[0].name).toBe('Pizza Place')
  })

  it('changes business type filter', async () => {
    renderController(BusinessList, { isOrderStateReady: true, avoidRefreshUserInfo: true })
    await waitFor(() => expect(lastControllerProps.businessesList.loading).toBe(false))
    lastControllerProps.handleChangeBusinessType(2)
    await waitFor(() => {
      expect(lastControllerProps.businessTypeSelected).toBe(2)
    })
  })

  it('updates search value', async () => {
    renderController(BusinessList, { isOrderStateReady: true, avoidRefreshUserInfo: true })
    lastControllerProps.handleChangeSearch('pizza')
    await waitFor(() => {
      expect(lastControllerProps.searchValue).toBe('pizza')
    })
  })

  it('toggles price level selection', async () => {
    renderController(BusinessList, { isOrderStateReady: true, avoidRefreshUserInfo: true })
    lastControllerProps.handleChangePriceLevel('$$')
    await waitFor(() => expect(lastControllerProps.priceLevelSelected).toBe('$$'))
    lastControllerProps.handleChangePriceLevel('$$')
    await waitFor(() => expect(lastControllerProps.priceLevelSelected).toBe(null))
  })

  it('updates a business in the list', async () => {
    renderController(BusinessList, { isOrderStateReady: true, avoidRefreshUserInfo: true })
    await waitFor(() => expect(lastControllerProps.businessesList.businesses).toHaveLength(1))
    lastControllerProps.handleUpdateBusinessList(1, { open: false })
    await waitFor(() => {
      expect(lastControllerProps.businessesList.businesses[0].open).toBe(false)
    })
  })

  it('delegates business click', () => {
    const onBusinessClick = vi.fn()
    renderController(BusinessList, { isOrderStateReady: true, onBusinessClick, avoidRefreshUserInfo: true })
    lastControllerProps.handleBusinessClick({ id: 9 })
    expect(onBusinessClick).toHaveBeenCalledWith({ id: 9 })
  })

  it('sorts businesses by review count when isSortByReview is enabled', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        error: false,
        result: [
          { id: 1, name: 'Low', reviews: { total: 2 }, offers: [] },
          { id: 2, name: 'High', reviews: { total: 20 }, offers: [] }
        ],
        pagination: { current_page: 1, page_size: 10, total_pages: 1, total: 2 }
      })
    })
    renderController(BusinessList, { isOrderStateReady: true, isSortByReview: true, avoidRefreshUserInfo: true })
    await waitFor(() => expect(lastControllerProps.businessesList.loading).toBe(false))
    expect(lastControllerProps.businessesList.businesses[0].name).toBe('High')
  })

  it('filters to businesses with offers when isOfferBusinesses is enabled', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        error: false,
        result: [
          { id: 1, name: 'No Offer', offers: [] },
          { id: 2, name: 'Has Offer', offers: [{ id: 1 }] }
        ],
        pagination: { current_page: 1, page_size: 10, total_pages: 1, total: 2 }
      })
    })
    renderController(BusinessList, { isOrderStateReady: true, isOfferBusinesses: true, avoidRefreshUserInfo: true })
    await waitFor(() => expect(lastControllerProps.businessesList.loading).toBe(false))
    expect(lastControllerProps.businessesList.businesses).toHaveLength(1)
    expect(lastControllerProps.businessesList.businesses[0].name).toBe('Has Offer')
  })

  it('loads businesses through SDK when asDashboard is true', async () => {
    renderController(BusinessList, { asDashboard: true, isOrderStateReady: true, avoidRefreshUserInfo: true })
    await waitFor(() => expect(lastControllerProps.businessesList.loading).toBe(false))
    expect(biz.mockBusinessesListGet).toHaveBeenCalled()
    expect(lastControllerProps.businessesList.businesses[0].name).toBe('SDK Store')
  })

  it('uses advanced search SDK path when search term is long enough', async () => {
    biz.state.testAdvancedSearch = '1'
    renderController(BusinessList, { isOrderStateReady: true, showSearchBar: true, avoidRefreshUserInfo: true })
    await waitFor(() => expect(lastControllerProps.businessesList.loading).toBe(false))
    lastControllerProps.handleChangeSearch('pizza hut')
    await waitFor(() => {
      expect(biz.mockBusinessesListGet).toHaveBeenCalled()
    })
  })

  it('updates orderBy, time limit, and max delivery fee filters', async () => {
    renderController(BusinessList, { isOrderStateReady: true, avoidRefreshUserInfo: true })
    await waitFor(() => expect(lastControllerProps.businessesList.loading).toBe(false))
    lastControllerProps.handleChangeOrderBy('distance')
    await waitFor(() => expect(lastControllerProps.orderByValue).toBe('distance'))
    lastControllerProps.handleChangeTimeLimit('0:30')
    await waitFor(() => expect(lastControllerProps.timeLimitValue).toBe('0:30'))
    lastControllerProps.handleChangeMaxDeliveryFee(5)
    await waitFor(() => expect(lastControllerProps.maxDeliveryFee).toBe(5))
  })

  it('applies initial filter key values on mount', async () => {
    renderController(BusinessList, {
      isOrderStateReady: true,
      avoidRefreshUserInfo: true,
      initialFilterKey: 'search',
      initialFilterValue: 'tacos'
    })
    await waitFor(() => {
      expect(lastControllerProps.searchValue).toBe('tacos')
    })
  })

  it('moves actualSlug business to the front of the list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        error: false,
        result: [
          { id: 1, slug: 'first', reviews: { total: 1 }, offers: [] },
          { id: 2, slug: 'featured', reviews: { total: 1 }, offers: [] }
        ],
        pagination: { current_page: 1, page_size: 10, total_pages: 1, total: 2 }
      })
    })
    renderController(BusinessList, { isOrderStateReady: true, actualSlug: 'featured', avoidRefreshUserInfo: true })
    await waitFor(() => expect(lastControllerProps.businessesList.businesses).toHaveLength(2))
    expect(lastControllerProps.businessesList.businesses[0].slug).toBe('featured')
  })

  it('loads favorite businesses for the current user', async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes('favorite_businesses')) {
        return Promise.resolve({
          json: async () => ({
            error: false,
            result: [{ object_id: 1 }],
            pagination: { current_page: 1, page_size: 10, total_pages: 1, total: 1 }
          })
        })
      }
      if (String(url).includes('/businesses')) {
        return Promise.resolve({
          json: async () => ({
            error: false,
            result: [{ id: 1, name: 'Favorite Store', slug: 'fav', offers: [] }],
            pagination: { current_page: 1, page_size: 10, total_pages: 1, total: 1 }
          })
        })
      }
      return Promise.resolve({ json: async () => ({ error: false, result: [] }) })
    })
    renderController(BusinessList, { isOrderStateReady: true, avoidRefreshUserInfo: true })
    await waitFor(() => expect(lastControllerProps.businessesList.loading).toBe(false))
    await lastControllerProps.getFavoriteList(1)
    await waitFor(() => {
      expect(lastControllerProps.businessesList.businesses[0].name).toBe('Favorite Store')
    })
  })

  it('enables franchise mode after franchise metadata loads', async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/franchises/9')) {
        return Promise.resolve({
          json: async () => ({ error: false, result: { enabled: true } })
        })
      }
      if (String(url).includes('/businesses')) {
        return Promise.resolve({
          json: async () => ({
            error: false,
            result: [{ id: 3, name: 'Franchise Store', slug: 'franchise', offers: [] }],
            pagination: { current_page: 1, page_size: 10, total_pages: 1, total: 1 }
          })
        })
      }
      return Promise.resolve({ json: async () => ({ error: false, result: [] }) })
    })
    renderController(BusinessList, { franchiseId: 9, isOrderStateReady: true, avoidRefreshUserInfo: true })
    await waitFor(() => expect(lastControllerProps.franchiseEnabled).toBe(true))
    await waitFor(() => expect(lastControllerProps.businessesList.businesses).toHaveLength(1))
  })

  it('appends the next page when getBusinesses is called without newFetch', async () => {
    let call = 0
    global.fetch = vi.fn().mockImplementation(() => {
      call += 1
      return Promise.resolve({
        json: async () => ({
          error: false,
          result: [{ id: call, name: `Store ${call}`, slug: `store-${call}`, offers: [], reviews: { total: 1 } }],
          pagination: { current_page: call, page_size: 1, total_pages: 2, total: 2 }
        })
      })
    })
    renderController(BusinessList, { isOrderStateReady: true, avoidRefreshUserInfo: true })
    await waitFor(() => expect(lastControllerProps.businessesList.businesses).toHaveLength(1))
    await lastControllerProps.getBusinesses(false)
    await waitFor(() => expect(lastControllerProps.businessesList.businesses).toHaveLength(2))
  })

  describe('unaddressed order types of the consumer', () => {
    const noAddressState = (extra = {}) => ({
      loading: false,
      options: { type: 2, user_id: 8 },
      ...extra
    })

    it('does not list businesses without an address when pickup is not unaddressed and there are no extras', async () => {
      biz.state.configOverride = { unaddressed_order_types_allowed: { value: '5' } }
      biz.state.orderState = noAddressState()
      renderController(BusinessList, { isOrderStateReady: true, avoidRefreshUserInfo: true })
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(lastControllerProps.businessesList.businesses).toHaveLength(0)
    })

    it('lists businesses without an address when extraUnaddressedOrderTypes includes the order type', async () => {
      biz.state.configOverride = { unaddressed_order_types_allowed: { value: '5' } }
      biz.state.orderState = noAddressState({ extraUnaddressedOrderTypes: [2, 3, 4] })
      renderController(BusinessList, { isOrderStateReady: true, avoidRefreshUserInfo: true })
      await waitFor(() => expect(lastControllerProps.businessesList.loading).toBe(false))
      expect(lastControllerProps.businessesList.businesses).toHaveLength(1)
    })

    it('lists businesses without an address for pickup when pickupWithoutAddress is on, even with an empty config', async () => {
      biz.state.configOverride = { unaddressed_order_types_allowed: { value: '' } }
      biz.state.orderState = noAddressState({ pickupWithoutAddress: true })
      renderController(BusinessList, { isOrderStateReady: true, avoidRefreshUserInfo: true })
      await waitFor(() => expect(lastControllerProps.businessesList.loading).toBe(false))
      expect(lastControllerProps.businessesList.businesses).toHaveLength(1)
    })
  })
})
