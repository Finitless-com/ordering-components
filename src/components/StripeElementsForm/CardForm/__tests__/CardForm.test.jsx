import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../../__tests__/helpers/renderController'

const pay = vi.hoisted(() => {
  const { createPaymentTestContext } = require('../../../../__tests__/helpers/paymentTestHelpers')
  return createPaymentTestContext(vi)
})

vi.mock('@stripe/react-stripe-js', () => {
  const { createStripeElementsMock } = require('../../../../__tests__/helpers/paymentTestHelpers')
  return createStripeElementsMock(vi, pay)
})

vi.mock('../../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    loading: false,
    user: { id: 8, name: 'Test User' },
    token: 'session-tok',
    device_code: null
  }]
}))

vi.mock('../../../../contexts/ApiContext', () => ({
  useApi: () => [pay.mockOrdering]
}))

vi.mock('../../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-15' })
}))

vi.mock('../../../../contexts/ValidationsFieldsContext', () => ({
  useValidationFields: () => [{ fields: { card: { zipcode: { required: false } } } }]
}))

import { CardForm } from '../index'

describe('CardForm', () => {
  beforeEach(() => pay.reset())

  it('creates a payment method when requirements are absent', async () => {
    const handleSource = vi.fn()
    renderController(CardForm, {
      businessId: 5,
      handleSource
    })
    const event = { preventDefault: vi.fn() }
    await lastControllerProps.handleSubmit(event)
    expect(pay.mockCreatePaymentMethod).toHaveBeenCalled()
    expect(handleSource).toHaveBeenCalledWith(expect.objectContaining({
      id: 'pm_123',
      type: 'card'
    }))
  })

  it('saves a card through setup intent when requirements are present', async () => {
    const onNewCard = vi.fn()
    renderController(CardForm, {
      businessId: 5,
      toSave: true,
      requirements: 'seti_secret',
      onNewCard
    })
    const event = { preventDefault: vi.fn() }
    await act(async () => {
      await lastControllerProps.handleSubmit(event)
    })
    expect(pay.mockConfirmCardSetup).toHaveBeenCalled()
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test/payments/stripe/cards',
        expect.objectContaining({ method: 'POST' })
      )
    })
    await waitFor(() => {
      expect(onNewCard).toHaveBeenCalled()
    })
    const [, options] = global.fetch.mock.calls.find(([url]) => url.includes('/cards'))
    expect(JSON.parse(options.body)).toEqual({
      business_id: 5,
      gateway: 'stripe',
      token_id: 'pm_setup_1',
      user_id: 8
    })
  })

  it('saves the card on stripe connect v2 with the business id', async () => {
    const onNewCard = vi.fn()
    renderController(CardForm, {
      businessId: 41,
      cardsGateway: 'stripe_connect_v2',
      toSave: true,
      requirements: 'seti_secret',
      onNewCard
    })
    const event = { preventDefault: vi.fn() }
    await act(async () => {
      await lastControllerProps.handleSubmit(event)
    })
    await waitFor(() => {
      expect(onNewCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'pm_connect_v2' }))
    })
    const [url, options] = global.fetch.mock.calls.find(([url]) => url.includes('/cards'))
    expect(url).toBe('https://api.test/payments/stripe_connect_v2/cards')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      business_id: 41,
      gateway: 'stripe_connect_v2',
      token_id: 'pm_setup_1',
      user_id: 8
    })
  })

  it('keeps the stripe endpoint for gateways without their own cards', async () => {
    const onNewCard = vi.fn()
    renderController(CardForm, {
      businessId: 5,
      cardsGateway: 'stripe_direct',
      toSave: true,
      requirements: 'seti_secret',
      onNewCard
    })
    await act(async () => {
      await lastControllerProps.handleSubmit({ preventDefault: vi.fn() })
    })
    await waitFor(() => expect(onNewCard).toHaveBeenCalled())
    const [url, options] = global.fetch.mock.calls.find(([url]) => url.includes('/cards'))
    expect(url).toBe('https://api.test/payments/stripe/cards')
    expect(JSON.parse(options.body).gateway).toBe('stripe')
  })

  it('tracks card element validation errors', async () => {
    renderController(CardForm, { businessId: 5 })
    act(() => {
      lastControllerProps.handleChange({ error: { message: 'Invalid number' }, elementType: 'cardNumber' })
    })
    await waitFor(() => {
      expect(lastControllerProps.error).toBe('Invalid number')
    })
    act(() => {
      lastControllerProps.handleChange({})
    })
    await waitFor(() => {
      expect(lastControllerProps.error).toBeNull()
    })
    act(() => {
      lastControllerProps.handleChangeExpiry({ error: { message: 'Bad expiry' } })
    })
    expect(lastControllerProps.errorExpiry).toBe('Bad expiry')
    act(() => {
      lastControllerProps.handleChangeCvc({ error: { message: 'Bad cvc' } })
    })
    expect(lastControllerProps.errorCvc).toBe('Bad cvc')
  })
})
