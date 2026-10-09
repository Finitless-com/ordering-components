import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockOrdering } from '../../../../__tests__/helpers/mockOrdering'

describe('ApiPaymentCards', () => {
  let ordering

  beforeEach(() => {
    ordering = createMockOrdering()
    vi.clearAllMocks()
  })

  describe('without gateway', () => {
    it('GETs the stripe cards of a user', async () => {
      await ordering.paymentCards(5, 8).get()
      expect(ordering.get).toHaveBeenCalledWith('/payments/stripe/cards?business_id=5&user_id=8', expect.any(Object))
    })

    it('DELETEs a stripe card', async () => {
      await ordering.paymentCards(-1, 8, 'card_1').delete()
      expect(ordering.delete).toHaveBeenCalledWith(
        '/payments/stripe/cards?business_id=-1&user_id=8&card_id=card_1',
        expect.any(Object)
      )
    })

    it('GETs the stripe credentials', async () => {
      await ordering.paymentCards().getCredentials()
      expect(ordering.get).toHaveBeenCalledWith('/payments/stripe/credentials', expect.any(Object))
    })

    it('falls back to stripe when the gateway is empty', async () => {
      await ordering.paymentCards(5, 8, null, null).get()
      await ordering.paymentCards(5, 8, null, '').get()
      expect(ordering.get).toHaveBeenNthCalledWith(1, '/payments/stripe/cards?business_id=5&user_id=8', expect.any(Object))
      expect(ordering.get).toHaveBeenNthCalledWith(2, '/payments/stripe/cards?business_id=5&user_id=8', expect.any(Object))
    })
  })

  describe('with gateway', () => {
    it('GETs the cards of that gateway', async () => {
      await ordering.paymentCards(41, 8, null, 'stripe_connect_v2').get()
      expect(ordering.get).toHaveBeenCalledWith(
        '/payments/stripe_connect_v2/cards?business_id=41&user_id=8',
        expect.any(Object)
      )
    })

    it('DELETEs a card of that gateway', async () => {
      await ordering.paymentCards(41, 8, 'pm_1', 'stripe_connect_v2').delete()
      expect(ordering.delete).toHaveBeenCalledWith(
        '/payments/stripe_connect_v2/cards?business_id=41&user_id=8&card_id=pm_1',
        expect.any(Object)
      )
    })

    it('GETs the credentials of that gateway', async () => {
      await ordering.paymentCards(undefined, undefined, null, 'stripe_connect_v2').getCredentials()
      expect(ordering.get).toHaveBeenCalledWith('/payments/stripe_connect_v2/credentials', expect.any(Object))
    })
  })

  it('requires businessId and userId to get cards', async () => {
    await expect(ordering.paymentCards().get()).rejects.toThrow('You must provide the `businessId` and `userId` param')
  })

  it('requires cardId to delete a card', async () => {
    await expect(ordering.paymentCards(5, 8).delete()).rejects.toThrow('You must provide the `businessId`, `userId`, `cardId` param')
  })

  it('does not implement save', async () => {
    await expect(ordering.paymentCards(5, 8).save({})).rejects.toThrow('is not implemented')
  })

  it('replaces the business id', () => {
    const api = ordering.paymentCards(5, 8)
    api.setModelId(9)
    expect(api.businessId).toBe(9)
  })
})
