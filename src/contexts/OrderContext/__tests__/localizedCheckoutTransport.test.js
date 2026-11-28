import { afterEach, describe, expect, it, vi } from 'vitest'
import { Ordering } from '../../../sdk/lib/classes/Ordering'
import { checkoutRequestOptions } from '../localizedCheckoutErrors'

const cases = [
  ['add product', '/carts/add_product', (sdk, options) => sdk.carts().addProduct({ product_id: 3 }, options)],
  ['apply coupon', '/carts/apply_coupon', (sdk, options) => sdk.carts().applyCoupon({ coupon: 'FIXTURE' }, options)],
  ['place cart', '/carts/17/place', (sdk, options) => sdk.carts(17).place({ paymethod_id: 5 }, options)],
  ['reorder', '/orders/17/reorder', (sdk, options) => sdk.orders(17).reorder(options)]
]

describe('checkout display metadata through the SDK transport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(cases)('%s keeps result and opts in using the URL query', async (_name, path, request) => {
    const original = {
      error: true,
      result: ['E_LEGACY', 'Another legacy error.'],
      error_codes: ['checkout.legacy'],
      localized_errors: [{ index: 1, message: 'Traducción de presentación.' }]
    }
    const sent = []
    class FakeRequest {
      open (method, url) {
        this.method = method
        this.url = url
        this.headers = {}
      }

      setRequestHeader (key, value) {
        this.headers[key] = value
      }

      send () {
        sent.push(this)
        this.status = 400
        this.statusText = 'Bad Request'
        this.response = JSON.stringify(original)
        this.onload()
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeRequest)
    const sdk = new Ordering({ project: 'fixture' })
    const options = { query: { user_id: 7 }, headers: { 'X-Fixture': 'fixture' } }

    const legacy = await request(sdk, checkoutRequestOptions(options, false))
    const optedIn = await request(sdk, checkoutRequestOptions(options, true))

    expect(sent).toHaveLength(2)
    for (const item of sent) {
      expect(item.method).toBe('POST')
      expect(new URL(item.url).pathname).toMatch(new RegExp(path + '$'))
      expect(new URL(item.url).searchParams.get('user_id')).toBe('7')
      expect(item.headers['X-Fixture']).toBe('fixture')
    }
    expect(new URL(sent[0].url).searchParams.has('localized_errors')).toBe(false)
    expect(new URL(sent[1].url).searchParams.getAll('localized_errors')).toEqual(['1'])
    expect(legacy.content.result).toEqual(original.result)
    expect(optedIn.status).toBe(400)
    expect(optedIn.content).toEqual(original)
    expect(options.query).toEqual({ user_id: 7 })
  })
})
