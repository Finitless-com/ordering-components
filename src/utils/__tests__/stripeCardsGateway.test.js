import { describe, expect, it } from 'vitest'
import { getCardsGateway, isBusinessCardsGateway } from '../stripeCardsGateway'

describe('getCardsGateway', () => {
  it('keeps stripe as the cards gateway when none is given', () => {
    expect(getCardsGateway()).toBe('stripe')
    expect(getCardsGateway(null)).toBe('stripe')
    expect(getCardsGateway('')).toBe('stripe')
  })

  it('keeps stripe for the gateways that reuse the stripe cards endpoints', () => {
    const gateways = ['stripe', 'stripe_direct', 'stripe_connect', 'credomatic', 'izipay', 'braintree']
    gateways.forEach(gateway => expect(getCardsGateway(gateway)).toBe('stripe'))
  })

  it('uses its own segment for stripe connect v2', () => {
    expect(getCardsGateway('stripe_connect_v2')).toBe('stripe_connect_v2')
  })
})

describe('isBusinessCardsGateway', () => {
  it('is true only for the gateways that need a business id', () => {
    expect(isBusinessCardsGateway('stripe_connect_v2')).toBe(true)
    expect(isBusinessCardsGateway('stripe')).toBe(false)
    expect(isBusinessCardsGateway('stripe_connect')).toBe(false)
    expect(isBusinessCardsGateway()).toBe(false)
  })
})
