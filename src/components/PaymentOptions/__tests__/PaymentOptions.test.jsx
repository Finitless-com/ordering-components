import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const pay = vi.hoisted(() => {
  const { createPaymentTestContext } = require('../../../__tests__/helpers/paymentTestHelpers')
  return createPaymentTestContext(vi)
})

vi.mock('../../../contexts/EventContext', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useEvent: () => [{ emit: pay.mockEmit, on: pay.mockEventsOn, off: pay.mockEventsOff }]
  }
})

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false, language: { code: 'en' } }, (key, fallback) => fallback || key]
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => [[], { showToast: pay.mockShowToast }],
  ToastType: { error: 'error', success: 'success', info: 'info' }
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    loading: false,
    user: { id: 8, name: 'Test User' },
    token: 'session-tok',
    device_code: null
  }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [pay.mockOrderState, {
    changePaymethod: pay.mockChangePaymethod,
    placeCart: pay.mockPlaceCart,
    confirmCart: pay.mockConfirmCart,
    setStateValues: pay.mockSetStateValues
  }]
}))

vi.mock('../../../contexts/UtilsContext', () => ({
  useUtils: () => [{ getGiftCardPaymethods: pay.mockGetGiftCardPaymethods }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [pay.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-15' })
}))

import { PaymentOptions } from '../index'

describe('PaymentOptions', () => {
  beforeEach(() => pay.reset())

  it('parses paymethods from props and filters blocked gateways', async () => {
    const onPaymentChange = vi.fn()
    renderController(PaymentOptions, {
      businessId: 5,
      paymethods: pay.samplePaymethods,
      isLoading: false,
      onPaymentChange
    })
    await waitFor(() => {
      expect(lastControllerProps.paymethodsList.loading).toBe(false)
    })
    expect(lastControllerProps.paymethodsList.paymethods).toHaveLength(2)
    expect(lastControllerProps.orderTotal).toBe(42)
  })

  it('selects a paymethod and emits tracking event', async () => {
    const onPaymentChange = vi.fn()
    renderController(PaymentOptions, {
      businessId: 5,
      paymethods: pay.samplePaymethods,
      isLoading: false,
      onPaymentChange
    })
    await waitFor(() => expect(lastControllerProps.paymethodsList.paymethods).toHaveLength(2))
    const cash = lastControllerProps.paymethodsList.paymethods[0]
    lastControllerProps.handlePaymethodClick(cash, false)
    await waitFor(() => {
      expect(lastControllerProps.paymethodSelected?.gateway).toBe('cash')
    })
    expect(pay.mockEmit).toHaveBeenCalledWith('add_payment_option', cash)
  })

  it('notifies parent when paymethod data changes', async () => {
    const onPaymentChange = vi.fn()
    renderController(PaymentOptions, {
      businessId: 5,
      paymethods: pay.samplePaymethods,
      isLoading: false,
      onPaymentChange
    })
    await waitFor(() => expect(lastControllerProps.paymethodsList.paymethods).toHaveLength(2))
    const cash = lastControllerProps.paymethodsList.paymethods[0]
    lastControllerProps.handlePaymethodClick(cash, false)
    await waitFor(() => {
      expect(lastControllerProps.paymethodSelected?.gateway).toBe('cash')
    })
    lastControllerProps.handlePaymethodDataChange({ token: 'abc' })
    expect(onPaymentChange).toHaveBeenCalledWith(expect.objectContaining({
      gateway: 'cash',
      data: { token: 'abc' }
    }))
  })

  it('loads gift-card paymethods when businessId is -1', async () => {
    const onPaymentChange = vi.fn()
    renderController(PaymentOptions, {
      businessId: -1,
      onPaymentChange
    })
    await waitFor(() => {
      expect(lastControllerProps.paymethodsList.paymethods).toHaveLength(1)
    })
    expect(pay.mockGetGiftCardPaymethods).toHaveBeenCalled()
  })

  it('filters callcenter paymethods in customer mode', async () => {
    renderController(PaymentOptions, {
      businessId: 5,
      paymethods: [
        ...pay.samplePaymethods,
        {
          paymethod: { id: 4, name: 'IVR', gateway: 'ivrpay' },
          data: {},
          sandbox: false
        }
      ],
      isLoading: false,
      isCustomerMode: true
    })
    await waitFor(() => {
      expect(lastControllerProps.paymethodsList.paymethods.some(p => p.gateway === 'ivrpay')).toBe(true)
    })
    expect(lastControllerProps.paymethodsList.paymethods.some(p => p.gateway === 'stripe')).toBe(false)
  })

  it('fetches paymethods from business API when prop is omitted', async () => {
    const onPaymentChange = vi.fn()
    renderController(PaymentOptions, {
      businessId: 5,
      onPaymentChange
    })
    await waitFor(() => {
      expect(lastControllerProps.paymethodsList.loading).toBe(false)
    })
    expect(pay.mockBusinessGet).toHaveBeenCalled()
    expect(lastControllerProps.paymethodsList.paymethods).toHaveLength(1)
  })

  it('opens popup flow for direct payment gateways', async () => {
    renderController(PaymentOptions, {
      businessId: 5,
      paymethods: [
        {
          paymethod: { id: 6, name: 'Square', gateway: 'square' },
          data: { application_id: 'sq' },
          sandbox: false
        }
      ],
      isLoading: false
    })
    await waitFor(() => expect(lastControllerProps.paymethodsList.paymethods).toHaveLength(1))
    const square = lastControllerProps.paymethodsList.paymethods[0]
    lastControllerProps.handlePaymethodClick(square, true)
    await waitFor(() => {
      expect(lastControllerProps.paymethodSelected?.gateway).toBe('square')
    })
  })

  it('filters stripe paymethods missing publishable credentials', async () => {
    renderController(PaymentOptions, {
      businessId: 5,
      paymethods: [
        {
          paymethod: { id: 7, name: 'Stripe', gateway: 'stripe' },
          data: {},
          sandbox: false
        }
      ],
      isLoading: false
    })
    await waitFor(() => {
      expect(lastControllerProps.paymethodsList.paymethods).toHaveLength(0)
    })
  })

  describe('stripe connect v2', () => {
    const connectPaymethod = (data) => ({
      paymethod: { id: 85, name: 'Stripe Connect v2', gateway: 'stripe_connect_v2' },
      data,
      sandbox: true
    })

    it('lists the paymethod with its publishable key', async () => {
      renderController(PaymentOptions, {
        businessId: 5,
        paymethods: [connectPaymethod({ publishable: 'pk_test_connect' })],
        isLoading: false
      })
      await waitFor(() => {
        expect(lastControllerProps.paymethodsList.paymethods).toHaveLength(1)
      })
      expect(lastControllerProps.paymethodsList.paymethods[0]).toEqual(expect.objectContaining({
        id: 85,
        gateway: 'stripe_connect_v2',
        sandbox: true,
        credentials: { publishable: 'pk_test_connect' }
      }))
    })

    it('hides the paymethod without publishable key', async () => {
      renderController(PaymentOptions, {
        businessId: 5,
        paymethods: [...pay.samplePaymethods, connectPaymethod({})],
        isLoading: false
      })
      await waitFor(() => {
        expect(lastControllerProps.paymethodsList.loading).toBe(false)
      })
      const gateways = lastControllerProps.paymethodsList.paymethods.map(paymethod => paymethod.gateway)
      expect(gateways).toEqual(['cash', 'stripe'])
    })

    it('waits for a card before notifying the paymethod', async () => {
      const onPaymentChange = vi.fn()
      renderController(PaymentOptions, {
        businessId: 5,
        paymethods: [connectPaymethod({ publishable: 'pk_test_connect' })],
        isLoading: false,
        onPaymentChange
      })
      await waitFor(() => {
        expect(lastControllerProps.paymethodsList.paymethods).toHaveLength(1)
      })
      const paymethod = lastControllerProps.paymethodsList.paymethods[0]
      act(() => {
        lastControllerProps.handlePaymethodClick(paymethod, false)
      })
      await waitFor(() => {
        expect(lastControllerProps.paymethodSelected?.gateway).toBe('stripe_connect_v2')
      })
      expect(onPaymentChange).not.toHaveBeenCalledWith(expect.objectContaining({ gateway: 'stripe_connect_v2' }))

      const card = { id: 'pm_1', type: 'card', card: { brand: 'visa', last4: '4242' } }
      act(() => {
        lastControllerProps.handlePaymethodDataChange(card)
      })
      expect(onPaymentChange).toHaveBeenCalledWith(expect.objectContaining({
        paymethodId: 85,
        gateway: 'stripe_connect_v2',
        data: card
      }))
    })
  })
})
