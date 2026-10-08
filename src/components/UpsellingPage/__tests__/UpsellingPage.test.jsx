import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const cart = vi.hoisted(() => {
  const { createCartCheckoutTestContext } = require('../../../__tests__/helpers/cartCheckoutTestHelpers')
  return createCartCheckoutTestContext(vi)
})

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    user: { id: 8 },
    token: 'session-tok'
  }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [cart.mockOrderState, {
    removeOffer: cart.mockRemoveOffer
  }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [cart.mockOrdering]
}))

import { UpsellingPage } from '../index'

describe('UpsellingPage', () => {
  beforeEach(() => cart.reset())

  it('filters upselling products and excludes cart duplicates', async () => {
    cart.mockOrderState.loading = true
    renderController(UpsellingPage, {
      businessId: 5,
      products: [
        { id: 20, name: 'Fries', upselling: true, inventoried: false },
        { id: 21, name: 'Soda', upselling: false, inventoried: false },
        { id: 22, name: 'Cookie', upselling: true, inventoried: false }
      ],
      cartProducts: [{ id: 20 }]
    })
    await waitFor(() => {
      expect(lastControllerProps.upsellingProducts.products).toHaveLength(1)
    })
    expect(lastControllerProps.upsellingProducts.products[0].id).toBe(22)
  })

  it('loads suggestive upselling products from API', async () => {
    renderController(UpsellingPage, {
      businessId: 5,
      useSuggestiveUpselling: true,
      cartProducts: [{ id: 1, name: 'Burger' }]
    })
    await waitFor(() => {
      expect(lastControllerProps.upsellingProducts.loading).toBe(false)
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/carts/cart-uuid-5/upselling',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('sends the app id header on suggestive upselling requests', async () => {
    renderController(UpsellingPage, {
      businessId: 5,
      useSuggestiveUpselling: true,
      cartProducts: [{ id: 1, name: 'Burger' }]
    })
    await waitFor(() => {
      expect(lastControllerProps.upsellingProducts.loading).toBe(false)
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/carts/cart-uuid-5/upselling',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer session-tok',
          'X-App-X': 'app'
        })
      })
    )
  })

  it('stops loading suggestive upselling when the cart has no uuid', async () => {
    renderController(UpsellingPage, {
      businessId: 999,
      useSuggestiveUpselling: true,
      cartProducts: [{ id: 1, name: 'Burger' }]
    })
    await waitFor(() => {
      expect(lastControllerProps.upsellingProducts.loading).toBe(false)
    })
    expect(lastControllerProps.upsellingProducts.products).toEqual([])
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/upselling'),
      expect.anything()
    )
  })

  it('delegates product form and offer removal', () => {
    const onSave = vi.fn()
    renderController(UpsellingPage, {
      businessId: 5,
      products: [{ id: 20, name: 'Fries', upselling: true }],
      onSave
    })
    const product = { id: 20, name: 'Fries' }
    lastControllerProps.handleFormProduct(product)
    lastControllerProps.handleRemoveOfferClick(55)
    expect(onSave).toHaveBeenCalledWith(product)
    expect(cart.mockRemoveOffer).toHaveBeenCalledWith({ business_id: 5, offer_id: 55 })
  })
})
