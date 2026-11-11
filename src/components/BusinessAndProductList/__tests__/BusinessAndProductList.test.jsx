import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

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
})
