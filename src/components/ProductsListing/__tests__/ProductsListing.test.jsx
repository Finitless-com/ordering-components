import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const menu = vi.hoisted(() => {
  const h = require('../../../__tests__/helpers/menuListingTestHelpers')
  const api = h.createMenuListingApiMocks(vi)
  const reset = () => {
    vi.clearAllMocks()
    h.applyDefaultMenuListingMockImplementations(vi, api)
  }
  return {
    ...api,
    mockOrdering: h.buildMenuListingMockOrdering(vi, api),
    reset
  }
})

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [menu.mockOrdering]
}))

import { ProductsListing } from '../index'

describe('ProductsListing', () => {
  beforeEach(() => menu.reset())

  it('loads products and categories on mount', async () => {
    renderController(ProductsListing, { businessId: 5 })
    await waitFor(() => {
      expect(lastControllerProps.productsList.loading).toBe(false)
    })
    expect(lastControllerProps.productsList.products).toHaveLength(2)
    expect(lastControllerProps.categories).toHaveLength(1)
  })

  it('filters products by search value', async () => {
    renderController(ProductsListing, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.productsList.loading).toBe(false))
    lastControllerProps.handlerChangeSearch('burger')
    await waitFor(() => {
      expect(lastControllerProps.productsList.products).toHaveLength(1)
    })
    expect(lastControllerProps.productsList.products[0].name).toBe('Burger')
  })

  it('filters products by selected category', async () => {
    renderController(ProductsListing, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.productsList.loading).toBe(false))
    lastControllerProps.handlerClickCategory({ id: 1 })
    await waitFor(() => {
      expect(lastControllerProps.categoryValue).toBe(true)
    })
  })

  it('keeps an empty catalog as an empty list', async () => {
    menu.mockBusinessProductsListGet.mockImplementation(() => Promise.resolve({
      content: { error: false, result: [] }
    }))
    renderController(ProductsListing, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.productsList.loading).toBe(false))
    expect(lastControllerProps.productsList.products).toEqual([])
    expect(lastControllerProps.productsList.error).toBe(false)
  })

  it('stores a thrown catalog request as an error', async () => {
    const failure = new Error('menu down')
    menu.mockBusinessProductsListGet.mockImplementation(() => Promise.reject(failure))
    renderController(ProductsListing, { businessId: 5 })
    await waitFor(() => expect(lastControllerProps.productsList.loading).toBe(false))
    expect(lastControllerProps.productsList.error).toBe(failure)
    expect(lastControllerProps.productsList.products).toEqual([])
  })
})
