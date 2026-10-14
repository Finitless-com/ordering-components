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

import { PaymentOptionStripe } from '../index'

describe('PaymentOptionStripe', () => {
  const baseProps = () => ({
    businessId: 5,
    gateway: 'stripe',
    publicKey: 'pk_prop',
    onPaymentChange: vi.fn(),
    setCardList: vi.fn(),
    paymethodSelectedInfo: { id: 2, gateway: 'stripe' }
  })

  beforeEach(() => pay.reset())

  it('loads saved cards from API', async () => {
    renderController(PaymentOptionStripe, baseProps())
    await waitFor(() => {
      expect(lastControllerProps.cardsList.loading).toBe(false)
    })
    expect(lastControllerProps.cardsList.cards).toHaveLength(1)
    expect(lastControllerProps.cardDefault.card.last4).toBe('4242')
  })

  it('skips card storage for credomatic gateway', async () => {
    renderController(PaymentOptionStripe, { ...baseProps(), gateway: 'credomatic' })
    await waitFor(() => {
      expect(lastControllerProps.cardsList.loading).toBe(false)
    })
    expect(lastControllerProps.cardsList.cards).toHaveLength(0)
    expect(pay.mockPaymentCardsGet).not.toHaveBeenCalled()
  })

  it('selects a card for checkout', async () => {
    renderController(PaymentOptionStripe, baseProps())
    await waitFor(() => expect(lastControllerProps.cardsList.cards).toHaveLength(1))
    const card = lastControllerProps.cardsList.cards[0]
    lastControllerProps.handleCardClick(card)
    await waitFor(() => {
      expect(lastControllerProps.cardSelected?.id).toBe(10)
    })
    expect(lastControllerProps.cardSelected.card.last4).toBe('4242')
  })

  it('sets default card through API', async () => {
    renderController(PaymentOptionStripe, baseProps())
    await waitFor(() => expect(lastControllerProps.cardsList.cards).toHaveLength(1))
    await lastControllerProps.setDefaultCard(lastControllerProps.cardsList.cards[0])
    await waitFor(() => {
      expect(lastControllerProps.defaultCardSetActionStatus.loading).toBe(false)
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/payments/stripe/cards/default',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('loads business user paymethods when get_cards feature is enabled', async () => {
    renderController(PaymentOptionStripe, {
      ...baseProps(),
      gateway: 'braintree',
      paymethodSelectedInfo: {
        id: 2,
        gateway: 'braintree',
        featured: 'get_cards'
      }
    })
    await waitFor(() => {
      expect(lastControllerProps.cardsList.cards).toHaveLength(1)
    })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/users/8/paymethods/2/paymethods'),
      expect.any(Object)
    )
  })

  it('deletes a saved card and clears selection', async () => {
    const onPaymentChange = vi.fn()
    renderController(PaymentOptionStripe, {
      ...baseProps(),
      paySelected: { data: { id: 10 } },
      onPaymentChange
    })
    await waitFor(() => expect(lastControllerProps.cardsList.cards).toHaveLength(1))
    await lastControllerProps.deleteCard(lastControllerProps.cardsList.cards[0])
    expect(pay.mockPaymentCardsDelete).toHaveBeenCalled()
  })

  it('adds a newly created card to the list', async () => {
    renderController(PaymentOptionStripe, baseProps())
    await waitFor(() => expect(lastControllerProps.cardsList.loading).toBe(false))
    const newCard = { id: 15, brand: 'amex', last4: '0005' }
    lastControllerProps.handleNewCard(newCard)
    await waitFor(() => {
      expect(lastControllerProps.cardSelected?.id).toBe(15)
    })
    expect(lastControllerProps.cardsList.cards[0].id).toBe(15)
  })

  it('keeps the stripe cards endpoints for stripe', async () => {
    renderController(PaymentOptionStripe, { ...baseProps(), publicKey: undefined })
    await waitFor(() => expect(lastControllerProps.cardsList.cards).toHaveLength(1))
    expect(lastControllerProps.cardsGateway).toBe('stripe')
    expect(pay.mockPaymentCards).toHaveBeenCalledWith(5, 8, null, 'stripe')
    expect(pay.mockPaymentCards).toHaveBeenCalledWith(undefined, undefined, null, 'stripe')
    await lastControllerProps.deleteCard(lastControllerProps.cardsList.cards[0])
    expect(pay.mockPaymentCards).toHaveBeenCalledWith(-1, 8, 10, 'stripe')
  })

  it('keeps the stripe cards endpoints for the gateways that reuse them', async () => {
    renderController(PaymentOptionStripe, {
      ...baseProps(),
      gateway: 'stripe_connect',
      paymethodSelectedInfo: { id: 4, gateway: 'stripe_connect' }
    })
    await waitFor(() => expect(lastControllerProps.cardsList.cards).toHaveLength(1))
    expect(lastControllerProps.cardsGateway).toBe('stripe')
    expect(pay.mockPaymentCards).toHaveBeenCalledWith(5, 8, null, 'stripe')
    await lastControllerProps.setDefaultCard(lastControllerProps.cardsList.cards[0])
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/payments/stripe/cards/default',
      expect.objectContaining({ method: 'POST' })
    )
  })

  describe('stripe connect v2', () => {
    const connectProps = () => ({
      ...baseProps(),
      gateway: 'stripe_connect_v2',
      paymethodSelectedInfo: { id: 85, gateway: 'stripe_connect_v2' }
    })

    it('loads the cards of the gateway and the business', async () => {
      renderController(PaymentOptionStripe, connectProps())
      await waitFor(() => expect(lastControllerProps.cardsList.cards).toHaveLength(1))
      expect(lastControllerProps.cardsGateway).toBe('stripe_connect_v2')
      expect(pay.mockPaymentCards).toHaveBeenCalledWith(5, 8, null, 'stripe_connect_v2')
      expect(pay.mockGetCredentials).not.toHaveBeenCalled()
    })

    it('gets the credentials of the gateway when there is no public key', async () => {
      renderController(PaymentOptionStripe, { ...connectProps(), publicKey: undefined })
      await waitFor(() => expect(lastControllerProps.publicKey).toBe('pk_test_123'))
      expect(pay.mockPaymentCards).toHaveBeenCalledWith(undefined, undefined, null, 'stripe_connect_v2')
    })

    it('sets the default card on the gateway', async () => {
      renderController(PaymentOptionStripe, connectProps())
      await waitFor(() => expect(lastControllerProps.cardsList.cards).toHaveLength(1))
      await lastControllerProps.setDefaultCard(lastControllerProps.cardsList.cards[0])
      await waitFor(() => {
        expect(lastControllerProps.defaultCardSetActionStatus.loading).toBe(false)
      })
      const [url, options] = global.fetch.mock.calls.find(([url]) => url.includes('/cards/default'))
      expect(url).toBe('https://api.test/payments/stripe_connect_v2/cards/default')
      expect(JSON.parse(options.body)).toEqual({ business_id: 5, user_id: 8, card_id: 10 })
    })

    it('deletes the card with the business id', async () => {
      const onPaymentChange = vi.fn()
      renderController(PaymentOptionStripe, {
        ...connectProps(),
        paySelected: { data: { id: 10 } },
        onPaymentChange
      })
      await waitFor(() => expect(lastControllerProps.cardsList.cards).toHaveLength(1))
      await lastControllerProps.deleteCard(lastControllerProps.cardsList.cards[0])
      expect(pay.mockPaymentCards).toHaveBeenCalledWith(5, 8, 10, 'stripe_connect_v2')
      expect(pay.mockPaymentCardsDelete).toHaveBeenCalled()
      expect(onPaymentChange).toHaveBeenCalledWith(null)
    })
  })

  it('loads izipay user cards when get_cards feature is enabled', async () => {
    renderController(PaymentOptionStripe, {
      ...baseProps(),
      gateway: 'izipay',
      paymethodSelectedInfo: {
        id: 3,
        gateway: 'izipay',
        featured: 'get_cards'
      }
    })
    await waitFor(() => {
      expect(lastControllerProps.cardsList.cards).toHaveLength(1)
    })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/users/8/paymethods/3/paymethods?where='),
      expect.any(Object)
    )
  })
})
