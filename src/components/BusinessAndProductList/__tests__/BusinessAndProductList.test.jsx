import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'
import { EventProvider } from '../../../contexts/EventContext'

const menu = vi.hoisted(() => {
  const h = require('../../../__tests__/helpers/menuListingTestHelpers')
  const api = h.createMenuListingApiMocks(vi)
  const mockShowToast = vi.fn()
  const mockCaptureReferral = vi.fn()
  const reset = () => {
    vi.clearAllMocks()
    h.applyDefaultMenuListingMockImplementations(vi, api)
    h.setupMenuListingFetchMock(vi)
  }
  return {
    ...api,
    mockOrdering: h.buildMenuListingMockOrdering(vi, api),
    mockShowToast,
    mockCaptureReferral,
    reset,
    defaultOrderState: h.defaultOrderState,
    sampleBusinessWithSubs: h.sampleBusinessWithSubs,
    lazyBusiness: h.lazyBusiness,
    sampleProducts: h.sampleProducts
  }
})

vi.mock('../../../hooks/useSelectedStudent', () => ({
  useSelectedStudent: () => ({ studentId: null, setStudentId: vi.fn() })
}))

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false, language: { code: 'en' } }, (key, fallback) => fallback || key]
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => [[], { showToast: menu.mockShowToast }],
  ToastType: { error: 'error', success: 'success' }
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    user: { id: 8 },
    token: 'session-tok'
  }]
}))

vi.mock('../../../contexts/CustomerContext', () => ({
  useCustomer: () => [{ user: { id: 12 } }]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{
    configs: {
      use_parent_category: { value: '0' }
    }
  }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [menu.defaultOrderState, { removeProduct: vi.fn(), captureReferral: menu.mockCaptureReferral }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [menu.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-12' })
}))

import { BusinessAndProductList } from '../index'

describe('BusinessAndProductList', () => {
  const baseProps = {
    slug: 'taco-shop',
    ordering: menu.mockOrdering,
    businessProps: ['id', 'name', 'categories', 'slug'],
    avoidBusinessLoading: false
  }

  beforeEach(() => menu.reset())

  it('loads business and exposes product list handlers', async () => {
    renderController(BusinessAndProductList, baseProps)
    await waitFor(() => {
      expect(lastControllerProps.businessState.loading).toBe(false)
    })
    expect(lastControllerProps.businessState.business.name).toBe('Taco Shop')
    expect(typeof lastControllerProps.handleChangeSearch).toBe('function')
    expect(typeof lastControllerProps.handleChangeCategory).toBe('function')
  })

  it('reports the loaded store as the one the visit opened', async () => {
    renderController(BusinessAndProductList, baseProps)
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    expect(menu.mockCaptureReferral).toHaveBeenCalledWith(lastControllerProps.businessState.business.id)
  })

  it('filters products when search changes', async () => {
    renderController(BusinessAndProductList, baseProps)
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    await waitFor(() => expect(lastControllerProps.categoryState.loading).toBe(false))
    lastControllerProps.handleChangeSearch('burger')
    await waitFor(() => {
      expect(lastControllerProps.searchValue).toBe('burger')
    })
  })

  it('updates products in local state', async () => {
    renderController(BusinessAndProductList, baseProps)
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    await waitFor(() => expect(lastControllerProps.categoryState.products?.length).toBeGreaterThan(0))
    lastControllerProps.handleUpdateProducts(10, { name: 'Double Burger' })
    await waitFor(() => {
      const updated = lastControllerProps.categoryState.products.find((p) => p.id === 10)
      expect(updated?.name).toBe('Double Burger')
    })
  })

  it('sorts products when sort option changes', async () => {
    renderController(BusinessAndProductList, baseProps)
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    await waitFor(() => expect(lastControllerProps.categoryState.products?.length).toBeGreaterThan(0))
    lastControllerProps.handleChangeSortBy('a-z')
    await waitFor(() => {
      expect(lastControllerProps.sortByValue).toBe('a-z')
    })
  })

  it('adds business to favorites', async () => {
    const onChangeBusinessSelected = vi.fn()
    renderController(BusinessAndProductList, {
      ...baseProps,
      onChangeBusinessSelected
    })
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    await lastControllerProps.handleFavoriteBusiness(true)
    await waitFor(() => {
      expect(lastControllerProps.businessState.business.favorite).toBe(true)
    })
    expect(menu.mockShowToast).toHaveBeenCalled()
  })

  it('toggles subcategory sections when a parent category is selected', async () => {
    menu.mockBusinessGet.mockResolvedValue({
      content: { error: false, result: menu.sampleBusinessWithSubs }
    })
    renderController(BusinessAndProductList, baseProps)
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    const parentCategory = lastControllerProps.businessState.business.categories[0]
    lastControllerProps.handleChangeCategory(parentCategory)
    await waitFor(() => {
      expect(lastControllerProps.openCategories).toContain(2)
    })
    lastControllerProps.handleChangeCategory(parentCategory)
    await waitFor(() => {
      expect(lastControllerProps.openCategories).not.toContain(2)
    })
  })

  it('loads featured products when featured category is selected', async () => {
    renderController(BusinessAndProductList, baseProps)
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    lastControllerProps.handleChangeCategory({ id: 'featured', name: 'Featured' })
    await waitFor(() => {
      expect(lastControllerProps.categorySelected.id).toBe('featured')
    })
    await waitFor(() => {
      expect(lastControllerProps.categoryState.products?.length).toBeGreaterThan(0)
    })
  })

  it('applies price and menu filters', async () => {
    renderController(BusinessAndProductList, baseProps)
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    lastControllerProps.handleChangePriceFilterValues('min', '5')
    lastControllerProps.handleChangeFilterByMenus(1)
    await waitFor(() => {
      expect(lastControllerProps.priceFilterValues.min).toBe('5')
      expect(lastControllerProps.filterByMenus).toBe(1)
    })
  })

  it('updates store product and category from dashboard actions', async () => {
    renderController(BusinessAndProductList, baseProps)
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    await waitFor(() => expect(lastControllerProps.categoryState.products?.length).toBeGreaterThan(0))
    await lastControllerProps.updateStoreProduct(1, 10, { enabled: false })
    await lastControllerProps.updateStoreCategory(1, { enabled: false })
    await waitFor(() => {
      expect(menu.mockProductSave).toHaveBeenCalled()
      expect(menu.mockCategorySave).toHaveBeenCalled()
    })
  })

  it('loads products lazily when business recommends lazy loading', async () => {
    menu.mockBusinessGet.mockResolvedValue({
      content: { error: false, result: menu.lazyBusiness }
    })
    menu.mockCategoriesGet.mockResolvedValue({
      content: {
        error: false,
        result: [{ id: 1, name: 'Mains', products: menu.sampleProducts }],
        pagination: { current_page: 1, page_size: 20, total_pages: 1, total: 2 }
      }
    })
    renderController(BusinessAndProductList, baseProps)
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    await waitFor(() => {
      expect(lastControllerProps.categoryState.loading).toBe(false)
    })
    expect(menu.mockCategoriesGet).toHaveBeenCalled()
  })

  it('skips product loading when notLoadProducts is enabled', async () => {
    renderController(BusinessAndProductList, { ...baseProps, notLoadProducts: true })
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    await waitFor(() => {
      expect(lastControllerProps.categoryState.loading).toBe(false)
    })
  })

  describe('showMenuWhenClosed', () => {
    const closedBusiness = { id: 5, slug: 'taco-shop', name: 'Taco Shop', open: false, categories: [] }
    const reopenedBusiness = {
      id: 5,
      slug: 'taco-shop',
      name: 'Taco Shop',
      open: true,
      categories: [{ id: 1, name: 'Mains', products: menu.sampleProducts, subcategories: [] }]
    }

    // All params calls recorded on the business-by-slug chain, in request order
    const getBusinessRequestParamsCalls = () => {
      const { calls, results } = menu.mockOrdering.businesses.mock
      const paramsCalls = []
      calls.forEach(([arg], i) => {
        if (arg === baseProps.slug) {
          paramsCalls.push(...results[i].value.parameters.mock.calls.map((call) => call[0]))
        }
      })
      return paramsCalls
    }

    // Renders the controller directly (bypassing lastControllerProps) so we can inspect every
    // intermediate render, not just the last one, and prove loading never flips to false early
    const renderWithProbe = (props) => {
      const renders = []
      const ProbeUI = (probeProps) => {
        renders.push({
          loading: probeProps.businessState.loading,
          business: probeProps.businessState.business,
          businessCallCount: menu.mockBusinessGet.mock.calls.length
        })
        return null
      }
      render(
        <EventProvider>
          <BusinessAndProductList UIComponent={ProbeUI} {...props} />
        </EventProvider>
      )
      return renders
    }

    afterEach(() => {
      delete menu.defaultOrderState.options.moment
    })

    it('retries with ignore_menu_schedule when true, ASAP and the business answers closed, without ever exposing the empty first result', async () => {
      menu.mockBusinessGet
        .mockResolvedValueOnce({ content: { error: false, result: closedBusiness } })
        .mockResolvedValueOnce({ content: { error: false, result: reopenedBusiness } })
      const renders = renderWithProbe({ ...baseProps, showMenuWhenClosed: true })

      await waitFor(() => expect(renders[renders.length - 1].loading).toBe(false))

      expect(menu.mockBusinessGet).toHaveBeenCalledTimes(2)
      const paramsCalls = getBusinessRequestParamsCalls()
      expect(paramsCalls).toHaveLength(2)
      expect(paramsCalls[0].ignore_menu_schedule).toBeUndefined()
      expect(paramsCalls[1].ignore_menu_schedule).toBe(1)

      // the final render must carry the retried (open) business, never the closed one
      const lastRender = renders[renders.length - 1]
      expect(lastRender.business.open).toBe(true)
      expect(lastRender.business.categories).toHaveLength(1)

      // no render reported loading:false before the second request had already happened
      const prematureFalseRender = renders.find((r) => r.loading === false && r.businessCallCount < 2)
      expect(prematureFalseRender).toBeUndefined()
    })

    it('sends a single request without ignore_menu_schedule when true, ASAP and the business is open', async () => {
      const openBusiness = { id: 5, slug: 'taco-shop', name: 'Taco Shop', open: true, categories: [] }
      menu.mockBusinessGet.mockResolvedValueOnce({ content: { error: false, result: openBusiness } })
      const renders = renderWithProbe({ ...baseProps, showMenuWhenClosed: true })

      await waitFor(() => expect(renders[renders.length - 1].loading).toBe(false))

      expect(menu.mockBusinessGet).toHaveBeenCalledTimes(1)
      const paramsCalls = getBusinessRequestParamsCalls()
      expect(paramsCalls).toHaveLength(1)
      expect(paramsCalls[0].ignore_menu_schedule).toBeUndefined()
    })

    it('sends a single request with timestamp and no ignore_menu_schedule when a valid moment is set', async () => {
      menu.defaultOrderState.options.moment = '2026-01-01 10:00:00'
      const renders = renderWithProbe({ ...baseProps, showMenuWhenClosed: true })

      await waitFor(() => expect(renders[renders.length - 1].loading).toBe(false))

      expect(menu.mockBusinessGet).toHaveBeenCalledTimes(1)
      const paramsCalls = getBusinessRequestParamsCalls()
      expect(paramsCalls).toHaveLength(1)
      expect(typeof paramsCalls[0].timestamp).toBe('number')
      expect(paramsCalls[0].ignore_menu_schedule).toBeUndefined()
    })

    it('sends a single request without ignore_menu_schedule when the prop is absent, even if the business is closed', async () => {
      menu.mockBusinessGet.mockResolvedValueOnce({ content: { error: false, result: closedBusiness } })
      const renders = renderWithProbe(baseProps)

      await waitFor(() => expect(renders[renders.length - 1].loading).toBe(false))

      expect(menu.mockBusinessGet).toHaveBeenCalledTimes(1)
      const paramsCalls = getBusinessRequestParamsCalls()
      expect(paramsCalls).toHaveLength(1)
      expect(paramsCalls[0].ignore_menu_schedule).toBeUndefined()
    })
  })
})
