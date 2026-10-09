import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const pay = vi.hoisted(() => {
  const { createPaymentTestContext } = require('../../../__tests__/helpers/paymentTestHelpers')
  return createPaymentTestContext(vi)
})

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    loading: false,
    user: { id: 8, name: 'Test User' },
    token: 'session-tok',
    device_code: null
  }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [pay.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-15' })
}))

import { StripeElementsForm } from '../index'

describe('StripeElementsForm', () => {
  beforeEach(() => pay.reset())

  it('loads stripe requirements when saving a card', async () => {
    renderController(StripeElementsForm, { toSave: true, businessId: 5 })
    await waitFor(() => {
      expect(lastControllerProps.requirements).toEqual({ client_secret: 'sec_test' })
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/payments/stripe/requirements?type=add_card',
      expect.any(Object)
    )
  })

  it('keeps the stripe requirements for gateways without their own cards', async () => {
    renderController(StripeElementsForm, { toSave: true, businessId: 5, cardsGateway: 'stripe_connect' })
    await waitFor(() => {
      expect(lastControllerProps.requirements).toEqual({ client_secret: 'sec_test' })
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/payments/stripe/requirements?type=add_card',
      expect.any(Object)
    )
  })

  it('loads the stripe connect v2 requirements of the business', async () => {
    renderController(StripeElementsForm, { toSave: true, businessId: 41, cardsGateway: 'stripe_connect_v2' })
    await waitFor(() => {
      expect(lastControllerProps.requirements).toEqual({ client_secret: 'sec_connect_v2' })
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/payments/stripe_connect_v2/requirements?type=add_card&business_id=41',
      expect.any(Object)
    )
    expect(lastControllerProps.cardsGateway).toBe('stripe_connect_v2')
  })

  it('skips requirements fetch when not saving', () => {
    renderController(StripeElementsForm, { toSave: false, businessId: 5 })
    expect(lastControllerProps.requirements).toBeUndefined()
  })
})
