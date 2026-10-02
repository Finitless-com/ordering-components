import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const menu = vi.hoisted(() => {
  const h = require('../../../__tests__/helpers/menuListingTestHelpers')
  const api = h.createMenuListingApiMocks(vi)
  const mockShowToast = vi.fn()
  const reset = () => {
    vi.clearAllMocks()
    h.applyDefaultMenuListingMockImplementations(vi, api)
    h.setupMenuListingFetchMock(vi)
  }
  return {
    ...api,
    mockOrdering: h.buildMenuListingMockOrdering(vi, api),
    mockShowToast,
    reset
  }
})

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false, language: { code: 'en' } }, (key, fallback) => fallback || key]
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => [[], { showToast: menu.mockShowToast }],
  ToastType: { error: 'error', success: 'success' }
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [menu.mockOrdering]
}))

import { StoreProductList } from '../index'

describe('StoreProductList', () => {
  beforeEach(() => menu.reset())

  it('loads business and filters categories by search', async () => {
    renderController(StoreProductList, {
      slug: 'taco-shop',
      businessProps: ['id', 'name', 'categories']
    })
    await waitFor(() => {
      expect(lastControllerProps.businessState.loading).toBe(false)
    })
    expect(lastControllerProps.businessState.business.name).toBe('Taco Shop')
    lastControllerProps.handleChangeCategorySearch('main')
    await waitFor(() => {
      expect(lastControllerProps.categories).toHaveLength(1)
    })
  })

  it('loads products when a category is selected', async () => {
    renderController(StoreProductList, {
      slug: 'taco-shop',
      businessProps: ['id', 'name', 'categories']
    })
    await waitFor(() => expect(lastControllerProps.businessState.business?.id).toBe(5))
    lastControllerProps.handleChangeCategory({ id: 1, name: 'Mains' })
    await waitFor(() => {
      expect(lastControllerProps.productsList.products).toHaveLength(2)
    })
    expect(menu.mockProductsGet).toHaveBeenCalled()
  })

  it('updates a store product through the SDK', async () => {
    renderController(StoreProductList, {
      slug: 'taco-shop',
      businessProps: ['id', 'name', 'categories']
    })
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    lastControllerProps.handleChangeCategory({ id: 1, name: 'Mains' })
    await waitFor(() => expect(lastControllerProps.productsList.products).toHaveLength(2))
    await lastControllerProps.updateStoreProduct(1, 10, { enabled: false })
    await waitFor(() => {
      expect(menu.mockShowToast).toHaveBeenCalled()
    })
    expect(menu.mockProductSave).toHaveBeenCalled()
  })

  it('updates a store category through the SDK', async () => {
    renderController(StoreProductList, {
      slug: 'taco-shop',
      businessProps: ['id', 'name', 'categories']
    })
    await waitFor(() => expect(lastControllerProps.businessState.business?.id).toBe(5))
    await lastControllerProps.updateStoreCategory(1, { enabled: false })
    await waitFor(() => {
      expect(menu.mockCategorySave).toHaveBeenCalled()
      expect(menu.mockShowToast).toHaveBeenCalled()
    })
  })

  it('searches products by name when product search changes', async () => {
    renderController(StoreProductList, {
      slug: 'taco-shop',
      businessProps: ['id', 'name', 'categories']
    })
    await waitFor(() => expect(lastControllerProps.businessState.business?.id).toBe(5))
    lastControllerProps.handleChangeCategory({ id: 1, name: 'Mains' })
    await waitFor(() => expect(lastControllerProps.productsList.products).toHaveLength(2))
    lastControllerProps.handleChangeProductSearch('burger')
    await waitFor(() => {
      expect(menu.mockProductsGet).toHaveBeenCalled()
    })
  })

  it('reloads products when the same category object is selected again', async () => {
    renderController(StoreProductList, {
      slug: 'taco-shop',
      businessProps: ['id', 'name', 'categories']
    })
    await waitFor(() => expect(lastControllerProps.businessState.business?.id).toBe(5))
    const category = { id: 1, name: 'Mains' }
    act(() => lastControllerProps.handleChangeCategory(category))
    await waitFor(() => expect(lastControllerProps.productsList.products).toHaveLength(2))
    expect(menu.mockProductsGet).toHaveBeenCalledTimes(1)
    act(() => lastControllerProps.handleChangeCategory(category))
    expect(lastControllerProps.productsList.loading).toBe(true)
    await waitFor(() => {
      expect(lastControllerProps.productsList.loading).toBe(false)
      expect(lastControllerProps.productsList.products).toHaveLength(2)
    })
    expect(menu.mockProductsGet).toHaveBeenCalledTimes(2)
  })
})
