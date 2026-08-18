import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Ordering } from '../Ordering'

describe('ApiCart', () => {
  let ordering

  beforeEach(() => {
    ordering = new Ordering({ project: 'demo' })
    ordering.get = vi.fn().mockResolvedValue({ content: { error: false, result: { id: 9 } } })
    ordering.post = vi.fn().mockResolvedValue({ content: { error: false, result: { id: 9 } } })
    ordering.put = vi.fn().mockResolvedValue({ content: { error: false, result: { id: 9 } } })
  })

  it('throws when where() is used with cartId', async () => {
    const api = ordering.carts(10)
    api.where([{ attribute: 'id', value: 10 }])
    await expect(api.get()).rejects.toThrow('where` function is not compatible')
  })

  it('requires cartId for place and confirm', async () => {
    await expect(ordering.carts().place({})).rejects.toThrow('cartId` is required')
    await expect(ordering.carts().confirm()).rejects.toThrow('cartId` is required')
    await expect(ordering.carts().getOffers()).rejects.toThrow('cartId` is required')
  })

  it('GETs single cart endpoint when cartId is set', async () => {
    const api = ordering.carts(12)
    await api.get()
    expect(ordering.get).toHaveBeenCalledWith(
      '/carts/12',
      expect.objectContaining({ CastClass: expect.any(Function) })
    )
  })

  it('POSTs cart mutations to expected endpoints', async () => {
    const api = ordering.carts(12)
    await api.addProduct({ product_id: 1 })
    await api.applyCoupon({ code: 'SAVE' })
    await api.changePaymethod({ paymethod_id: 2 })
    expect(ordering.post).toHaveBeenCalledWith('/carts/add_product', { product_id: 1 }, expect.any(Object))
    expect(ordering.post).toHaveBeenCalledWith('/carts/apply_coupon', { code: 'SAVE' }, expect.any(Object))
    expect(ordering.post).toHaveBeenCalledWith('/carts/change_paymethod', { paymethod_id: 2 }, expect.any(Object))
  })

  it('GETs available offers for a cart without casting them as carts', async () => {
    await ordering.carts('cart-uuid').getOffers({
      query: { only_applicable: false }
    })

    expect(ordering.get).toHaveBeenCalledWith(
      '/carts/cart-uuid/offers',
      expect.objectContaining({
        CastClass: null,
        query: { only_applicable: false }
      })
    )
  })

  it('throws for unimplemented save/delete', async () => {
    await expect(ordering.carts(1).save({})).rejects.toThrow('not implemented')
    await expect(ordering.carts(1).delete()).rejects.toThrow('not implemented')
  })
})
