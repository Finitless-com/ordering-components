import { describe, expect, it } from 'vitest'
import {
  deriveFreeDeliveryProgress,
  selectFreeDeliveryOffer
} from '../freeDeliveryProgress'
import * as utils from '../index'
import {
  disabledFreeDeliveryOffer,
  fixedDeliveryDiscountOffer,
  freeDeliveryOffer,
  missingThresholdFreeDeliveryOffer,
  nonAutomaticFreeDeliveryOffer,
  pickupOrderType,
  secondFreeDeliveryOffer,
  wrongBusinessFreeDeliveryOffer
} from '../../hooks/__tests__/fixtures/freeDeliveryOffers'

const business = { id: 6, slug: 'donospizza' }

describe('utils exports', () => {
  it('exposes both free-delivery functions through the utility barrel', () => {
    expect(utils.selectFreeDeliveryOffer).toBe(selectFreeDeliveryOffer)
    expect(utils.deriveFreeDeliveryProgress).toBe(deriveFreeDeliveryProgress)
  })
})

describe('selectFreeDeliveryOffer', () => {
  it('accepts an automatic enabled 100 percent delivery discount with a positive minimum', () => {
    expect(selectFreeDeliveryOffer({
      publicOffers: [freeDeliveryOffer],
      business
    })).toBe(freeDeliveryOffer)
  })

  it.each([
    ['another target', { target: 1 }],
    ['a numeric-string target', { target: '2' }],
    ['a fixed rate type', fixedDeliveryDiscountOffer],
    ['a numeric-string rate type', { rate_type: '1' }],
    ['less than a full discount', { rate: 99.99 }],
    ['a non-automatic offer', nonAutomaticFreeDeliveryOffer],
    ['a disabled offer', disabledFreeDeliveryOffer],
    ['a missing threshold', missingThresholdFreeDeliveryOffer],
    ['a zero threshold', { minimum: 0 }],
    ['a negative threshold', { minimum: -1 }]
  ])('rejects %s', (description, override) => {
    const offer = override.id
      ? override
      : { ...freeDeliveryOffer, ...override }

    expect(selectFreeDeliveryOffer({
      publicOffers: [offer],
      business
    })).toBeNull()
  })

  it('matches an offer business by id', () => {
    const idOnlyBusiness = { id: 6, slug: 'different-slug' }

    expect(selectFreeDeliveryOffer({
      publicOffers: [freeDeliveryOffer],
      business: idOnlyBusiness
    })).toBe(freeDeliveryOffer)
  })

  it('matches an offer business by slug', () => {
    const slugOnlyBusiness = { id: 999, slug: 'donospizza' }

    expect(selectFreeDeliveryOffer({
      publicOffers: [freeDeliveryOffer],
      business: slugOnlyBusiness
    })).toBe(freeDeliveryOffer)
  })

  it('accepts an offer with a global business list', () => {
    const globalOffer = { ...freeDeliveryOffer, businesses: [] }

    expect(selectFreeDeliveryOffer({
      publicOffers: [globalOffer],
      business
    })).toBe(globalOffer)
  })

  it('rejects an offer for another business', () => {
    expect(selectFreeDeliveryOffer({
      publicOffers: [wrongBusinessFreeDeliveryOffer],
      business
    })).toBeNull()
  })

  it('prefers a supported offer already applied to the cart', () => {
    expect(selectFreeDeliveryOffer({
      publicOffers: [freeDeliveryOffer, secondFreeDeliveryOffer],
      cartOffers: [{ id: freeDeliveryOffer.id }],
      business
    })).toBe(freeDeliveryOffer)
  })

  it('uses a supported applied cart offer when no public candidate is available', () => {
    expect(selectFreeDeliveryOffer({
      publicOffers: [],
      cartOffers: [freeDeliveryOffer],
      business
    })).toBe(freeDeliveryOffer)
  })

  it('chooses the lowest positive minimum', () => {
    expect(selectFreeDeliveryOffer({
      publicOffers: [freeDeliveryOffer, secondFreeDeliveryOffer],
      business
    })).toBe(secondFreeDeliveryOffer)
  })

  it('breaks an equal-minimum tie by ascending rank', () => {
    const lowerRankOffer = {
      ...secondFreeDeliveryOffer,
      id: 41,
      minimum: freeDeliveryOffer.minimum,
      rank: 0
    }

    expect(selectFreeDeliveryOffer({
      publicOffers: [freeDeliveryOffer, lowerRankOffer],
      business
    })).toBe(lowerRankOffer)
  })

  it('breaks an equal-minimum and equal-rank tie by ascending id', () => {
    const higherIdOffer = { ...freeDeliveryOffer, id: 100 }

    expect(selectFreeDeliveryOffer({
      publicOffers: [higherIdOffer, freeDeliveryOffer],
      business
    })).toBe(freeDeliveryOffer)
  })

  it('ignores malformed minimum and rate values without partially parsing them', () => {
    const malformedOffers = [
      { ...freeDeliveryOffer, id: 41, minimum: '30oops' },
      { ...freeDeliveryOffer, id: 42, minimum: Number.NaN },
      { ...freeDeliveryOffer, id: 43, rate: '100percent' },
      { ...freeDeliveryOffer, id: 44, rate: Number.POSITIVE_INFINITY }
    ]

    expect(selectFreeDeliveryOffer({
      publicOffers: malformedOffers,
      business
    })).toBeNull()
  })

  it.each(['1e309', '1e-400'])(
    'rejects threshold %s when converting it would lose the positive finite value',
    (minimum) => {
      const unrepresentableOffer = { ...freeDeliveryOffer, minimum }

      expect(selectFreeDeliveryOffer({
        publicOffers: [unrepresentableOffer],
        business
      })).toBeNull()
    }
  )

  it('sorts numeric-string thresholds and ids numerically', () => {
    const offerTen = {
      ...freeDeliveryOffer,
      id: '10',
      minimum: '30.00'
    }
    const offerTwo = {
      ...freeDeliveryOffer,
      id: '2',
      minimum: '30'
    }

    expect(selectFreeDeliveryOffer({
      publicOffers: [offerTen, offerTwo],
      business
    })).toBe(offerTwo)
  })
})

describe('deriveFreeDeliveryProgress', () => {
  it('returns awareness before a product cart exists', () => {
    expect(deriveFreeDeliveryProgress({
      offer: freeDeliveryOffer,
      cart: null,
      orderType: 1,
      hasLocation: true
    })).toEqual({
      status: 'awareness',
      offer: freeDeliveryOffer,
      minimum: 30,
      currentAmount: 0,
      remainingAmount: 30,
      progressPercent: 0,
      diagnosticReason: null
    })
  })

  it('returns progress from the cart subtotal using decimal-safe arithmetic', () => {
    const decimalOffer = { ...freeDeliveryOffer, minimum: 0.3 }

    expect(deriveFreeDeliveryProgress({
      offer: decimalOffer,
      cart: { products: [{ id: 1 }], subtotal: 0.1, offers: [] },
      orderType: 1,
      hasLocation: true
    })).toEqual({
      status: 'progress',
      offer: decimalOffer,
      minimum: 0.3,
      currentAmount: 0.1,
      remainingAmount: 0.2,
      progressPercent: 33.333333333333336,
      diagnosticReason: null
    })
  })

  it('returns unlocked only when the selected offer id is present in cart offers', () => {
    expect(deriveFreeDeliveryProgress({
      offer: freeDeliveryOffer,
      cart: {
        products: [{ id: 1 }],
        subtotal: 30,
        offers: [{ id: '34' }]
      },
      orderType: 1,
      hasLocation: true
    })).toEqual({
      status: 'unlocked',
      offer: freeDeliveryOffer,
      minimum: 30,
      currentAmount: 30,
      remainingAmount: 0,
      progressPercent: 100,
      diagnosticReason: null
    })
  })

  it('hides a numeric threshold match that the cart did not confirm', () => {
    expect(deriveFreeDeliveryProgress({
      offer: freeDeliveryOffer,
      cart: { products: [{ id: 1 }], subtotal: 31, offers: [] },
      orderType: 1,
      hasLocation: true
    })).toEqual({
      status: 'hidden',
      offer: freeDeliveryOffer,
      minimum: 30,
      currentAmount: 31,
      remainingAmount: 0,
      progressPercent: 100,
      diagnosticReason: 'threshold-not-applied'
    })
  })

  it('hides Pickup orders', () => {
    expect(deriveFreeDeliveryProgress({
      offer: freeDeliveryOffer,
      cart: null,
      orderType: pickupOrderType,
      hasLocation: true
    }).status).toBe('hidden')
  })

  it('hides when no usable location is selected', () => {
    expect(deriveFreeDeliveryProgress({
      offer: freeDeliveryOffer,
      cart: null,
      orderType: 1,
      hasLocation: false
    }).status).toBe('hidden')
  })

  it('hides when no supported offer is available', () => {
    expect(deriveFreeDeliveryProgress({
      offer: null,
      cart: null,
      orderType: 1,
      hasLocation: true
    }).status).toBe('hidden')
  })

  it('hides an empty reservation shell', () => {
    expect(deriveFreeDeliveryProgress({
      offer: freeDeliveryOffer,
      cart: { products: [], reservation: {} },
      orderType: 1,
      hasLocation: true
    })).toMatchObject({
      status: 'hidden',
      diagnosticReason: 'reservation-only'
    })
  })

  it.each([false, 0])('treats reservation value %s as an empty product cart', (reservation) => {
    expect(deriveFreeDeliveryProgress({
      offer: freeDeliveryOffer,
      cart: { products: [], reservation },
      orderType: 1,
      hasLocation: true
    }).status).toBe('awareness')
  })

  it.each([
    ['a missing subtotal', undefined],
    ['a partially numeric subtotal', '12oops'],
    ['a non-finite subtotal', Number.POSITIVE_INFINITY],
    ['a negative subtotal', -1]
  ])('hides a product cart with %s', (description, subtotal) => {
    expect(deriveFreeDeliveryProgress({
      offer: freeDeliveryOffer,
      cart: { products: [{ id: 1 }], subtotal, offers: [] },
      orderType: 1,
      hasLocation: true
    })).toMatchObject({
      status: 'hidden',
      diagnosticReason: 'invalid-subtotal'
    })
  })

  it('hides a subtotal that cannot be returned as a finite JavaScript number', () => {
    expect(deriveFreeDeliveryProgress({
      offer: freeDeliveryOffer,
      cart: { products: [{ id: 1 }], subtotal: '1e309', offers: [] },
      orderType: 1,
      hasLocation: true
    })).toMatchObject({
      status: 'hidden',
      diagnosticReason: 'invalid-subtotal'
    })
  })
})
