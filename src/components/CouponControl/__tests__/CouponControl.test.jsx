import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const cart = vi.hoisted(() => {
  const { createCartCheckoutTestContext } = require('../../../__tests__/helpers/cartCheckoutTestHelpers')
  return createCartCheckoutTestContext(vi)
})
const sessionState = vi.hoisted(() => ({
  auth: true,
  token: 'session-token',
  user: { id: 8 }
}))

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false, language: { code: 'en' } }, (key, fallback) => fallback || key]
}))

vi.mock('../../../contexts/CustomerContext', () => ({
  useCustomer: () => [{ user: { id: 12 } }]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [cart.mockConfigState, { refreshConfigs: vi.fn() }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [cart.mockOrderState, {
    applyCoupon: cart.mockApplyCoupon,
    applyOffer: cart.mockApplyOffer,
    removeOffer: cart.mockRemoveOffer
  }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [cart.mockOrdering]
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [sessionState]
}))

// eslint-disable-next-line import/first
import { CouponControl } from '../index'

describe('CouponControl', () => {
  beforeEach(() => {
    cart.reset()
    Object.assign(sessionState, {
      auth: true,
      token: 'session-token',
      user: { id: 8 }
    })
  })

  it('exposes coupon from cart state', () => {
    renderController(CouponControl, { businessId: 5, price: 10 })
    expect(lastControllerProps.couponDefault).toEqual({ code: 'SAVE10' })
  })

  it('removes coupon from cart', () => {
    renderController(CouponControl, { businessId: 5, price: 10 })
    lastControllerProps.handleRemoveCouponClick()
    expect(cart.mockApplyCoupon).toHaveBeenCalledWith({ business_id: 5, coupon: null })
  })

  it('keeps manual coupon application for projects without advanced offers', async () => {
    renderController(CouponControl, { businessId: 5, price: 10 })

    await act(async () => {
      lastControllerProps.onChangeInputCoupon('SAVE10')
    })
    await act(async () => {
      lastControllerProps.handleButtonApplyClick()
    })

    expect(cart.mockApplyCoupon).toHaveBeenCalledWith(
      {
        business_id: 5,
        coupon: 'SAVE10'
      },
      {
        businessId: 5,
        userId: 12
      }
    )
  })

  it('applies offers when advanced offers module is enabled', async () => {
    cart.mockConfigState.configs.advanced_offers_module.value = '1'
    renderController(CouponControl, { businessId: 5, price: 10 })
    await act(async () => {
      lastControllerProps.handleButtonApplyClick()
    })
    expect(cart.mockApplyOffer).toHaveBeenCalledWith(expect.objectContaining({
      business_id: 5,
      force: true,
      userId: 12
    }))
  })

  it('loads cart offers on demand when the user is authenticated', async () => {
    cart.mockConfigState.configs.advanced_offers_module.value = '1'
    renderController(CouponControl, { businessId: 5, price: 10 })

    expect(lastControllerProps.canLoadOffers).toBe(true)

    await act(async () => {
      await lastControllerProps.handleLoadOffers()
    })

    expect(cart.mockOrdering.setAccessToken).toHaveBeenCalledWith('session-token')
    expect(cart.mockCartOffersGet).toHaveBeenCalledWith({
      query: { only_applicable: false }
    })
    expect(lastControllerProps.offersState).toEqual(expect.objectContaining({
      loading: false,
      error: null,
      offers: [expect.objectContaining({ id: 50 })]
    }))
  })

  it('does not load saved offers for guests or grouped carts', async () => {
    cart.mockConfigState.configs.advanced_offers_module.value = '1'
    sessionState.auth = false
    renderController(CouponControl, { businessId: 5, price: 10 })

    await act(async () => {
      await lastControllerProps.handleLoadOffers()
    })

    expect(lastControllerProps.canLoadOffers).toBe(false)
    expect(cart.mockCartOffersGet).not.toHaveBeenCalled()
  })

  it('applies an offer by id and forces non-stackable replacement', async () => {
    cart.mockConfigState.configs.advanced_offers_module.value = '1'
    cart.mockOrderState.carts['businessId:5'].offers = [{ id: 20 }]
    renderController(CouponControl, { businessId: 5, price: 10 })

    await act(async () => {
      await lastControllerProps.handleOfferApplyClick({
        id: 50,
        stackable: false
      })
    })

    expect(cart.mockApplyOffer).toHaveBeenCalledWith({
      business_id: 5,
      offer_id: 50,
      force: true,
      userId: 12
    })
    expect(cart.mockCartOffersGet).toHaveBeenCalledTimes(1)
    expect(lastControllerProps.applyingOfferId).toBe(null)
  })

  it('removes an applied offer by id and refreshes available offers', async () => {
    cart.mockConfigState.configs.advanced_offers_module.value = '1'
    renderController(CouponControl, { businessId: 5, price: 10 })

    await act(async () => {
      await lastControllerProps.handleOfferRemoveClick(50)
    })

    expect(cart.mockRemoveOffer).toHaveBeenCalledWith({
      business_id: 5,
      offer_id: 50,
      user_id: 12
    })
    expect(cart.mockCartOffersGet).toHaveBeenCalledTimes(1)
    expect(lastControllerProps.removingOfferId).toBe(null)
  })

  it('deduplicates concurrent offer-list requests', async () => {
    cart.mockConfigState.configs.advanced_offers_module.value = '1'
    let resolveRequest
    cart.mockCartOffersGet.mockReturnValue(new Promise(resolve => {
      resolveRequest = resolve
    }))
    renderController(CouponControl, { businessId: 5, price: 10 })

    let firstRequest
    let secondRequest
    await act(async () => {
      firstRequest = lastControllerProps.handleLoadOffers()
      secondRequest = lastControllerProps.handleLoadOffers()
      resolveRequest({ content: { error: false, result: [] } })
      await Promise.all([firstRequest, secondRequest])
    })

    expect(cart.mockCartOffersGet).toHaveBeenCalledTimes(1)
  })

  it('exposes offer-list request errors for the consumer UI', async () => {
    cart.mockConfigState.configs.advanced_offers_module.value = '1'
    cart.mockCartOffersGet.mockResolvedValue({
      content: {
        error: true,
        result: ['API_ERROR_YOU_HAVE_NOT_CART']
      }
    })
    renderController(CouponControl, { businessId: 5, price: 10 })

    await act(async () => {
      await lastControllerProps.handleLoadOffers()
    })

    expect(lastControllerProps.offersState).toEqual(expect.objectContaining({
      loading: false,
      offers: [],
      error: ['API_ERROR_YOU_HAVE_NOT_CART']
    }))
  })

  it('opens confirm dialog when discounted price is negative', async () => {
    renderController(CouponControl, { businessId: 5, price: -1 })
    await waitFor(() => {
      expect(lastControllerProps.confirm.open).toBe(true)
    })
    expect(cart.mockApplyCoupon).toHaveBeenCalledWith({ business_id: 5, coupon: null })
  })
})
