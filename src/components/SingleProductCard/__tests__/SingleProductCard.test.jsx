import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const detail = vi.hoisted(() => {
  const h = require('../../../__tests__/helpers/productDetailTestHelpers')
  const api = h.createProductDetailApiMocks(vi)
  const mockShowToast = vi.fn()
  const mockEmit = vi.fn()
  const mockAddProduct = vi.fn().mockResolvedValue(true)
  const mockUpdateProduct = vi.fn().mockResolvedValue(true)
  const mockLogin = vi.fn()
  const reset = () => {
    vi.clearAllMocks()
    h.applyDefaultProductDetailMockImplementations(vi, api)
    h.setupProductDetailFetchMock(vi)
    mockAddProduct.mockResolvedValue(true)
    mockUpdateProduct.mockResolvedValue(true)
  }
  return {
    ...api,
    mockOrdering: h.buildProductDetailMockOrdering(vi, api),
    mockShowToast,
    mockEmit,
    mockAddProduct,
    mockUpdateProduct,
    mockLogin,
    reset,
    sampleProduct: h.sampleProduct,
    productFormBaseProps: h.productFormBaseProps
  }
})

vi.mock('../../../contexts/EventContext', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useEvent: () => [{ emit: detail.mockEmit }]
  }
})

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false, language: { code: 'en' } }, (key, fallback) => fallback || key]
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => [[], { showToast: detail.mockShowToast }],
  ToastType: { error: 'error', success: 'success' }
}))

const sessionMock = vi.hoisted(() => ({ token: 'session-tok' }))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    user: { id: 8 },
    token: sessionMock.token
  }, { login: detail.mockLogin }]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{
    configs: {
      max_product_amount: { value: '100' }
    }
  }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [detail.defaultOrderState || {
    loading: false,
    options: { type: 1 },
    carts: { 'businessId:5': { business_id: 5, products: [] } }
  }, {
    addProduct: detail.mockAddProduct,
    updateProduct: detail.mockUpdateProduct,
    addMultiProduct: vi.fn().mockResolvedValue(true)
  }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [detail.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-13' })
}))

import { SingleProductCard } from '../index'

describe('SingleProductCard', () => {
  beforeEach(() => {
    detail.reset()
    sessionMock.token = 'session-tok'
  })

  it('tracks product clicks and delegates handler', async () => {
    const onProductClick = vi.fn()
    renderController(SingleProductCard, {
      product: { id: 10, name: 'Burger' },
      onProductClick
    })
    lastControllerProps.onProductClick({ id: 10, name: 'Burger' }, { id: 5 })
    expect(onProductClick).toHaveBeenCalled()
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test/tracking_events',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('does not call tracking_events when there is no token', async () => {
    sessionMock.token = null
    const onProductClick = vi.fn()
    renderController(SingleProductCard, {
      product: { id: 10, name: 'Burger' },
      onProductClick
    })
    lastControllerProps.onProductClick({ id: 10, name: 'Burger' }, { id: 5 })
    expect(onProductClick).toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(global.fetch).not.toHaveBeenCalledWith(
      'https://api.test/tracking_events',
      expect.anything()
    )
  })

  it('adds product to favorites and emits event', async () => {
    const handleUpdateProducts = vi.fn()
    renderController(SingleProductCard, {
      product: { id: 10, name: 'Burger' },
      handleUpdateProducts
    })
    await lastControllerProps.handleFavoriteProduct(true)
    await waitFor(() => {
      expect(detail.mockShowToast).toHaveBeenCalled()
    })
    expect(handleUpdateProducts).toHaveBeenCalledWith(10, { favorite: true })
    expect(detail.mockEmit).toHaveBeenCalledWith('product_added_to_wishlist', { id: 10, name: 'Burger' })
  })

  it('removes favorite using product_id when isProductId is set', async () => {
    const handleUpdateProducts = vi.fn()
    renderController(SingleProductCard, {
      product: { product_id: 42, name: 'Fries' },
      isProductId: true,
      handleUpdateProducts
    })
    await lastControllerProps.handleFavoriteProduct(false)
    await waitFor(() => {
      expect(detail.mockShowToast).toHaveBeenCalled()
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/users/8/favorite_products/42',
      expect.objectContaining({ method: 'DELETE' })
    )
    expect(detail.mockEmit).toHaveBeenCalledWith('product_removed_from_wishlist', { product_id: 42, name: 'Fries' })
  })

  it('shows toast when favorite API returns an error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ error: true, result: 'Favorite failed' })
    })
    renderController(SingleProductCard, {
      product: { id: 10, name: 'Burger' }
    })
    await lastControllerProps.handleFavoriteProduct(true)
    await waitFor(() => {
      expect(detail.mockShowToast).toHaveBeenCalled()
    })
  })
})
