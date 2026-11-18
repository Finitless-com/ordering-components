import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    productFormBaseProps: h.productFormBaseProps,
    defaultOrderState: h.defaultOrderState
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

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    user: { id: 8 },
    token: 'session-tok'
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
  useOrder: () => [detail.defaultOrderState, {
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

import { ProductForm } from '../index'

describe('ProductForm', () => {
  const baseProps = () => ({
    ...detail.productFormBaseProps,
    onSave: vi.fn()
  })

  beforeEach(() => detail.reset())

  it('builds product cart from product prop', async () => {
    renderController(ProductForm, baseProps())
    await waitFor(() => {
      expect(lastControllerProps.productCart.quantity).toBeGreaterThan(0)
    })
    expect(lastControllerProps.productCart.name).toBe('Burger')
  })

  it('increments and decrements cart quantity', async () => {
    renderController(ProductForm, baseProps())
    await waitFor(() => expect(lastControllerProps.productCart.quantity).toBeGreaterThan(0))
    const initialQty = lastControllerProps.productCart.quantity
    lastControllerProps.increment()
    await waitFor(() => {
      expect(lastControllerProps.productCart.quantity).toBe(initialQty + 1)
    })
    lastControllerProps.decrement()
    await waitFor(() => {
      expect(lastControllerProps.productCart.quantity).toBe(initialQty)
    })
  })

  it('updates comment and ingredient state', async () => {
    renderController(ProductForm, baseProps())
    await waitFor(() => expect(lastControllerProps.productCart.name).toBe('Burger'))
    lastControllerProps.handleChangeCommentState({ target: { value: 'No onions' } })
    await waitFor(() => {
      expect(lastControllerProps.productCart.comment).toBe('No onions')
    })
    lastControllerProps.handleChangeIngredientState({ selected: false }, { id: 1, name: 'Lettuce' })
    await waitFor(() => {
      expect(lastControllerProps.productCart.ingredients['id:1'].selected).toBe(false)
    })
  })

  it('evaluates whether options should be shown', async () => {
    renderController(ProductForm, baseProps())
    await waitFor(() => expect(lastControllerProps.productObject.product).toBeTruthy())
    const visibleOption = detail.sampleProduct.extras[0].options[0]
    expect(lastControllerProps.showOption(visibleOption)).toBe(true)
    expect(lastControllerProps.showOption({ ...visibleOption, suboptions: [] })).toBe(false)
  })

  it('saves through order context and onSave callback', async () => {
    const onSave = vi.fn()
    renderController(ProductForm, {
      ...baseProps(),
      useOrderContext: true,
      onSave
    })
    await waitFor(() => expect(lastControllerProps.productCart.total).toBeGreaterThan(0))
    await lastControllerProps.handleSave()
    expect(onSave).toHaveBeenCalled()
    expect(detail.mockAddProduct).toHaveBeenCalled()
  })

  it('loads product by id when product prop is omitted', async () => {
    renderController(ProductForm, {
      businessId: 5,
      categoryId: 1,
      productId: 10,
      useOrderContext: false
    })
    await waitFor(() => {
      expect(lastControllerProps.productObject.loading).toBe(false)
    })
    expect(detail.mockProductGet).toHaveBeenCalled()
    expect(lastControllerProps.productObject.product.name).toBe('Burger')
  })

  it('adds product to favorites', async () => {
    renderController(ProductForm, baseProps())
    await waitFor(() => expect(lastControllerProps.productObject.product).toBeTruthy())
    await lastControllerProps.handleFavoriteProduct(detail.sampleProduct, true)
    await waitFor(() => {
      expect(detail.mockShowToast).toHaveBeenCalled()
    })
  })

  it('removes product from favorites', async () => {
    renderController(ProductForm, baseProps())
    await waitFor(() => expect(lastControllerProps.productObject.product).toBeTruthy())
    await lastControllerProps.handleFavoriteProduct(detail.sampleProduct, false)
    await waitFor(() => {
      expect(detail.mockShowToast).toHaveBeenCalled()
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/users/8/favorite_products/10',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('updates suboption state and cart totals', async () => {
    renderController(ProductForm, baseProps())
    await waitFor(() => expect(lastControllerProps.productCart.total).toBeGreaterThan(0))
    const option = detail.sampleProduct.extras[0].options[0]
    const suboption = option.suboptions[0]
    lastControllerProps.handleChangeSuboptionState({
      id: suboption.id,
      name: suboption.name,
      price: suboption.price,
      quantity: 1,
      selected: true,
      total: suboption.price
    }, suboption, option)
    await waitFor(() => {
      expect(lastControllerProps.productCart.options[`id:${option.id}`]).toBeTruthy()
    })
  })

  it('sets cart quantity directly', async () => {
    renderController(ProductForm, baseProps())
    await waitFor(() => expect(lastControllerProps.productCart.quantity).toBeGreaterThan(0))
    lastControllerProps.handleChangeProductCartQuantity(3)
    await waitFor(() => {
      expect(lastControllerProps.productCart.quantity).toBe(3)
    })
  })

  it('hides conditioned options until parent suboption is selected', async () => {
    const conditionedProduct = {
      ...detail.sampleProduct,
      extras: [{
        options: [
          {
            id: 20,
            name: 'Size',
            min: 1,
            max: 1,
            suboptions: [{ id: 201, name: 'Large', price: 2, preselected: true }]
          },
          {
            id: 21,
            name: 'Extra',
            respect_to: 201,
            min: 0,
            max: 1,
            suboptions: [{ id: 211, name: 'Cheese', price: 1 }]
          }
        ]
      }]
    }
    renderController(ProductForm, { ...baseProps(), product: conditionedProduct })
    await waitFor(() => expect(lastControllerProps.productCart.total).toBeGreaterThan(0))
    const childOption = conditionedProduct.extras[0].options[1]
    expect(lastControllerProps.showOption(childOption)).toBe(true)
  })

  it('blocks save when required options are missing', async () => {
    const productNeedsOption = {
      id: 11,
      name: 'Salad',
      price: 5,
      category_id: 1,
      ingredients: {},
      maximum_per_order: 10,
      minimum_per_order: 1,
      extras: [{
        options: [{
          id: 30,
          name: 'Dressing',
          min: 1,
          max: 2,
          suboptions: [
            { id: 301, name: 'Ranch', price: 0 },
            { id: 302, name: 'Caesar', price: 1 }
          ]
        }]
      }]
    }
    renderController(ProductForm, {
      ...baseProps(),
      productId: 11,
      product: productNeedsOption,
      useOrderContext: true
    })
    await waitFor(() => expect(lastControllerProps.productObject.product).toBeTruthy())
    await lastControllerProps.handleSave()
    expect(detail.mockAddProduct).not.toHaveBeenCalled()
  })

  it('updates an existing cart line when productCart has a code', async () => {
    renderController(ProductForm, {
      ...baseProps(),
      useOrderContext: true,
      productCart: {
        code: 'line-1',
        quantity: 2,
        options: {
          'id:20': {
            id: 20,
            suboptions: {
              'id:201': { id: 201, selected: true, quantity: 1, price: 2, total: 2 }
            }
          }
        }
      }
    })
    await waitFor(() => expect(lastControllerProps.productCart.code).toBe('line-1'))
    await lastControllerProps.handleSave()
    expect(detail.mockUpdateProduct).toHaveBeenCalled()
    expect(detail.mockAddProduct).not.toHaveBeenCalled()
  })

  it('lazy-loads product details when load_type is lazy', async () => {
    detail.mockProductGet.mockImplementationOnce((options = {}) => {
      if (options.cancelToken) options.cancelToken.cancel = vi.fn()
      return Promise.resolve({
        content: {
          error: false,
          result: {
            ...detail.sampleProduct,
            extras: [{
              rank: 2,
              options: [{
                id: 20,
                rank: 2,
                suboptions: [{ id: 201, name: 'Large', price: 2, rank: 2, preselected: true }]
              }]
            }, {
              rank: 1,
              options: [{
                id: 21,
                rank: 1,
                suboptions: [{ id: 211, name: 'Small', price: 0, rank: 1 }]
              }]
            }]
          }
        }
      })
    })
    renderController(ProductForm, {
      businessId: 5,
      categoryId: 1,
      productId: 10,
      product: { ...detail.sampleProduct, load_type: 'lazy' },
      useOrderContext: false
    })
    await waitFor(() => {
      expect(lastControllerProps.productObject.loading).toBe(false)
    })
    expect(detail.mockProductGet).toHaveBeenCalled()
    expect(lastControllerProps.productObject.product.extras[0].rank).toBe(1)
  })

  it('creates a guest user and logs in', async () => {
    renderController(ProductForm, baseProps())
    await waitFor(() => expect(lastControllerProps.productObject.product).toBeTruthy())
    await lastControllerProps.handleCreateGuestUser({ email: 'guest@test.com', name: 'Guest' })
    await waitFor(() => {
      expect(lastControllerProps.actionStatus.loading).toBe(false)
    })
    expect(detail.mockLogin).toHaveBeenCalled()
  })

  describe('showMenuWhenClosed', () => {
    // All params passed to .parameters() on the products() endpoint of every businesses() call
    const getLoadProductParamsCalls = () => {
      const paramsCalls = []
      detail.mockOrdering.businesses.mock.results.forEach((businessResult) => {
        businessResult.value.categories.mock.results.forEach((catResult) => {
          catResult.value.products.mock.results.forEach((prodResult) => {
            paramsCalls.push(...prodResult.value.parameters.mock.calls.map((call) => call[0]))
          })
        })
      })
      return paramsCalls
    }

    afterEach(() => {
      delete detail.defaultOrderState.options.moment
    })

    it('adds ignore_menu_schedule when closed, ASAP, and the prop is set', async () => {
      renderController(ProductForm, {
        businessId: 5,
        categoryId: 1,
        productId: 10,
        useOrderContext: false,
        showMenuWhenClosed: true,
        business: { id: 5, open: false }
      })
      await waitFor(() => expect(lastControllerProps.productObject.loading).toBe(false))
      const paramsCalls = getLoadProductParamsCalls()
      expect(paramsCalls).toHaveLength(1)
      expect(paramsCalls[0].ignore_menu_schedule).toBe(1)
    })

    it('does not add ignore_menu_schedule when the business is open', async () => {
      renderController(ProductForm, {
        businessId: 5,
        categoryId: 1,
        productId: 10,
        useOrderContext: false,
        showMenuWhenClosed: true,
        business: { id: 5, open: true }
      })
      await waitFor(() => expect(lastControllerProps.productObject.loading).toBe(false))
      const paramsCalls = getLoadProductParamsCalls()
      expect(paramsCalls).toHaveLength(1)
      expect(paramsCalls[0].ignore_menu_schedule).toBeUndefined()
    })

    it('sends timestamp and no ignore_menu_schedule when a valid moment is set, even if the business is closed', async () => {
      detail.defaultOrderState.options.moment = '2026-01-01 10:00:00'
      renderController(ProductForm, {
        businessId: 5,
        categoryId: 1,
        productId: 10,
        useOrderContext: false,
        showMenuWhenClosed: true,
        business: { id: 5, open: false }
      })
      await waitFor(() => expect(lastControllerProps.productObject.loading).toBe(false))
      const paramsCalls = getLoadProductParamsCalls()
      expect(paramsCalls).toHaveLength(1)
      expect(typeof paramsCalls[0].timestamp).toBe('number')
      expect(paramsCalls[0].ignore_menu_schedule).toBeUndefined()
    })

    it('does not add ignore_menu_schedule when the prop is absent, even if the business is closed', async () => {
      renderController(ProductForm, {
        businessId: 5,
        categoryId: 1,
        productId: 10,
        useOrderContext: false,
        business: { id: 5, open: false }
      })
      await waitFor(() => expect(lastControllerProps.productObject.loading).toBe(false))
      const paramsCalls = getLoadProductParamsCalls()
      expect(paramsCalls).toHaveLength(1)
      expect(paramsCalls[0].ignore_menu_schedule).toBeUndefined()
    })
  })

  it('loads professionals for service bookings', async () => {
    renderController(ProductForm, {
      ...baseProps(),
      isService: true,
      isCartProduct: true
    })
    await waitFor(() => {
      expect(lastControllerProps.professionalListState.loading).toBe(false)
    })
    expect(lastControllerProps.professionalListState.professionals).toEqual([])
  })
})
