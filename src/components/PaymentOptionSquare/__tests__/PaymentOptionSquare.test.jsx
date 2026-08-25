import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const pay = vi.hoisted(() => {
  const { createPaymentTestContext } = require('../../../__tests__/helpers/paymentTestHelpers')
  return createPaymentTestContext(vi)
})

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [pay.mockOrderState, {
    placeCart: pay.mockPlaceCart,
    confirmCart: pay.mockConfirmCart
  }]
}))

import { PaymentOptionSquare } from '../index'
import { SQUARE_PRODUCTION_SDK_URL, SQUARE_SANDBOX_SDK_URL } from '../../../utils/squareSdk'

describe('PaymentOptionSquare', () => {
  const originalCreateElement = document.createElement.bind(document)
  const squareBody = {
    cartUuid: 'cart-uuid-5',
    paymethod_id: 6,
    amount: 42,
    delivery_zone_id: 0
  }

  const stubSquareWindow = () => {
    window.Square = {
      payments: vi.fn(() => ({
        card: vi.fn().mockResolvedValue({
          attach: vi.fn().mockResolvedValue(undefined),
          tokenize: vi.fn().mockResolvedValue({ status: 'OK', token: 'square-tok' })
        }),
        ach: vi.fn(),
        giftCard: vi.fn()
      }))
    }
  }

  const captureScripts = () => {
    const scripts = []
    document.createElement = vi.fn((tag) => {
      const el = originalCreateElement(tag)
      if (tag === 'script') {
        scripts.push(el)
        queueMicrotask(() => el.onload && el.onload())
      }
      return el
    })
    return scripts
  }

  beforeEach(() => pay.reset())

  afterEach(() => {
    document.createElement = originalCreateElement
    delete window.Square
  })

  it('loads the production Square SDK for production credentials', async () => {
    stubSquareWindow()
    const scripts = captureScripts()
    renderController(PaymentOptionSquare, {
      cartTotal: 42,
      body: squareBody,
      data: { application_id: 'sq0idp-prod', location_id: 'sq-loc' },
      onPlaceOrderClick: vi.fn()
    })
    await waitFor(() => {
      expect(scripts[0]?.src).toBe(SQUARE_PRODUCTION_SDK_URL)
    })
  })

  it('loads the sandbox Square SDK for sandbox credentials', async () => {
    stubSquareWindow()
    const scripts = captureScripts()
    renderController(PaymentOptionSquare, {
      cartTotal: 42,
      body: squareBody,
      data: { application_id: 'sandbox-sq0idb-abc', location_id: 'sq-loc', sandbox: true },
      onPlaceOrderClick: vi.fn()
    })
    await waitFor(() => {
      expect(scripts[0]?.src).toBe(SQUARE_SANDBOX_SDK_URL)
    })
  })

  it('exposes square payment methods and changes selection', async () => {
    const mockCard = {
      attach: vi.fn().mockResolvedValue(undefined),
      tokenize: vi.fn().mockResolvedValue({ status: 'OK', token: 'square-tok' })
    }
    window.Square = {
      payments: vi.fn(() => ({
        card: vi.fn().mockResolvedValue(mockCard),
        ach: vi.fn(),
        giftCard: vi.fn()
      }))
    }
    document.createElement = vi.fn((tag) => {
      const el = originalCreateElement(tag)
      if (tag === 'script') {
        queueMicrotask(() => el.onload && el.onload())
      }
      return el
    })
    document.getElementById = vi.fn((id) => {
      const el = originalCreateElement('button')
      el.id = id
      el.addEventListener = vi.fn()
      el.removeEventListener = vi.fn()
      return el
    })

    const onPlaceOrderClick = vi.fn()
    renderController(PaymentOptionSquare, {
      cartTotal: 42,
      body: {
        cartUuid: 'cart-uuid-5',
        paymethod_id: 6,
        amount: 42,
        delivery_zone_id: 0
      },
      data: { application_id: 'sq-app', location_id: 'sq-loc' },
      onPlaceOrderClick,
      setCreateOrder: vi.fn()
    })
    await waitFor(() => {
      expect(lastControllerProps.isSquareReady).toBe(true)
    })
    expect(lastControllerProps.paymentMethods).toHaveLength(3)
    lastControllerProps.handleChangeMethodSelected('card_payments')
    await waitFor(() => {
      expect(lastControllerProps.methodSelected).toBe('card_payments')
    })
  })
})
