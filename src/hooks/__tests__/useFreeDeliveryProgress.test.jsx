/* eslint-disable import/first */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  freeDeliveryOffer,
  secondFreeDeliveryOffer,
  wrongBusinessFreeDeliveryOffer
} from './fixtures/freeDeliveryOffers'

const context = vi.hoisted(() => ({
  ordering: null,
  session: null,
  order: null,
  socket: null
}))

vi.mock('../../contexts/ApiContext', () => ({
  useApi: () => [context.ordering]
}))

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => [context.session]
}))

vi.mock('../../contexts/OrderContext', () => ({
  useOrder: () => [context.order]
}))

vi.mock('../../contexts/WebsocketContext', () => ({
  useWebsocket: () => context.socket
}))

import { useFreeDeliveryProgress } from '../useFreeDeliveryProgress'

const business = { id: 6, slug: 'donospizza' }
const location = { lat: 25.6866, lng: -100.3161 }

const apiResponse = (payload, { ok = true } = {}) => ({
  ok,
  json: vi.fn().mockResolvedValue(payload)
})

const successfulResponse = (result = [freeDeliveryOffer]) => (
  apiResponse({ error: false, result })
)

const deferred = () => {
  let settle
  const promise = new Promise((resolve) => {
    settle = resolve
  })
  return { promise, resolve: settle }
}

const renderProgress = (props = {}) => renderHook(
  (currentProps) => useFreeDeliveryProgress(currentProps),
  {
    initialProps: {
      business,
      cart: null,
      ...props
    }
  }
)

describe('useFreeDeliveryProgress', () => {
  beforeEach(() => {
    context.ordering = {
      root: 'https://api.ordering.test',
      appId: 'marketplace-app',
      appInternalName: 'marketplace-web'
    }
    context.session = {
      loading: false,
      token: 'session-token'
    }
    context.order = {
      loading: false,
      options: {
        type: 1,
        address: { location }
      }
    }
    context.socket = {
      getId: vi.fn(() => 'socket-id')
    }
    globalThis.fetch = vi.fn().mockResolvedValue(successfulResponse())
  })

  it.each([
    ['the session token is missing', () => { context.session.token = null }, {}],
    ['OrderContext is loading', () => { context.order.loading = true }, {}],
    ['Delivery is not selected', () => { context.order.options.type = 2 }, {}],
    ['the delivery location is missing', () => { context.order.options.address = null }, {}],
    ['the business is missing', () => {}, { business: null }]
  ])('does not request offers while %s', async (description, arrange, props) => {
    arrange()

    const { result } = renderProgress(props)

    await act(async () => {})
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(result.current.status).toBe('hidden')
    expect(result.current.offer).toBeNull()
  })

  it.each([
    ['latitude', 90.0001, location.lng],
    ['latitude', -90.0001, location.lng],
    ['longitude', location.lat, 180.0001],
    ['longitude', location.lat, -180.0001]
  ])('does not request when %s is outside its valid range', async (description, lat, lng) => {
    context.order.options.address.location = { lat, lng }

    const { result } = renderProgress()

    await act(async () => {})
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({
      status: 'hidden',
      diagnosticReason: 'missing-location'
    })
  })

  it.each([
    [90, 180],
    [-90, -180]
  ])('accepts the inclusive coordinate boundary at %s, %s', async (lat, lng) => {
    context.order.options.address.location = { lat, lng }

    const { result } = renderProgress()

    await waitFor(() => expect(result.current.status).toBe('awareness'))
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('requests only the public eligibility fields and selects the open business', async () => {
    globalThis.fetch.mockResolvedValue(successfulResponse([
      wrongBusinessFreeDeliveryOffer,
      freeDeliveryOffer
    ]))

    const { result } = renderProgress({ franchiseId: 91 })

    await waitFor(() => expect(result.current.status).toBe('awareness'))

    expect(result.current.offer).toBe(freeDeliveryOffer)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [requestUrl, requestOptions] = globalThis.fetch.mock.calls[0]
    const parsedUrl = new URL(requestUrl)
    expect(`${parsedUrl.origin}${parsedUrl.pathname}`).toBe('https://api.ordering.test/offers/public')
    expect(requestUrl).toContain(`location=${encodeURIComponent(JSON.stringify(location))}`)
    expect(Object.fromEntries(parsedUrl.searchParams)).toEqual({
      enabled: 'true',
      params: 'id,name,businesses,minimum,target,rate,rate_type,auto,enabled,rank,condition_type',
      location: JSON.stringify(location),
      order_type_id: '1',
      franchise_id: '91'
    })
    expect(requestOptions).toEqual({
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer session-token',
        'X-App-X': 'marketplace-app',
        'X-INTERNAL-PRODUCT-X': 'marketplace-web',
        'X-Socket-Id-X': 'socket-id'
      }
    })
  })

  it('omits the optional franchise query when none is supplied', async () => {
    renderProgress()

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))

    const parsedUrl = new URL(globalThis.fetch.mock.calls[0][0])
    expect(parsedUrl.searchParams.has('franchise_id')).toBe(false)
  })

  it('hides the old candidate synchronously when the request key changes and ignores its stale response', async () => {
    const oldRequest = deferred()
    const newRequest = deferred()
    const newBusiness = { id: 7, slug: 'new-business' }
    const newOffer = {
      ...freeDeliveryOffer,
      id: 70,
      businesses: [newBusiness]
    }
    globalThis.fetch
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => newRequest.promise)

    const hook = renderProgress()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))

    hook.rerender({ business: newBusiness, cart: null })

    expect(hook.result.current.status).toBe('hidden')
    expect(hook.result.current.offer).toBeNull()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2))

    await act(async () => {
      newRequest.resolve(successfulResponse([newOffer]))
    })
    await waitFor(() => expect(hook.result.current.offer).toBe(newOffer))

    await act(async () => {
      oldRequest.resolve(successfulResponse([freeDeliveryOffer]))
    })
    expect(hook.result.current.offer).toBe(newOffer)
  })

  it('lets the newest refresh win when refresh requests finish out of order', async () => {
    const hook = renderProgress()
    await waitFor(() => expect(hook.result.current.offer).toBe(freeDeliveryOffer))

    const firstRefresh = deferred()
    const secondRefresh = deferred()
    globalThis.fetch
      .mockImplementationOnce(() => firstRefresh.promise)
      .mockImplementationOnce(() => secondRefresh.promise)

    act(() => hook.result.current.refresh())
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2))
    expect(hook.result.current.status).toBe('hidden')

    act(() => hook.result.current.refresh())
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(3))

    await act(async () => {
      secondRefresh.resolve(successfulResponse([secondFreeDeliveryOffer]))
    })
    await waitFor(() => expect(hook.result.current.minimum).toBe(20))

    await act(async () => {
      firstRefresh.resolve(successfulResponse([freeDeliveryOffer]))
    })
    expect(hook.result.current.minimum).toBe(20)
  })

  it('keeps the public candidate across add, update, and remove cart renders without refetching', async () => {
    const hook = renderProgress()
    await waitFor(() => expect(hook.result.current.status).toBe('awareness'))

    hook.rerender({
      business,
      cart: { products: [{ id: 1 }], subtotal: 10, offers: [] }
    })
    expect(hook.result.current).toMatchObject({
      status: 'progress',
      currentAmount: 10,
      remainingAmount: 20
    })

    hook.rerender({
      business,
      cart: { products: [{ id: 1, quantity: 2 }], subtotal: 20, offers: [] }
    })
    expect(hook.result.current).toMatchObject({
      status: 'progress',
      currentAmount: 20,
      remainingAmount: 10
    })

    hook.rerender({ business, cart: { products: [], subtotal: 0, offers: [] } })
    expect(hook.result.current.status).toBe('awareness')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('accepts a complete applied cart offer on direct mount only after current-key public eligibility succeeds', async () => {
    const request = deferred()
    globalThis.fetch.mockImplementationOnce(() => request.promise)
    const cart = {
      products: [{ id: 1 }],
      subtotal: 30,
      offers: [freeDeliveryOffer]
    }

    const hook = renderProgress({ cart })

    expect(hook.result.current.status).toBe('hidden')
    await act(async () => {
      request.resolve(successfulResponse([]))
    })
    await waitFor(() => expect(hook.result.current.status).toBe('unlocked'))
    expect(hook.result.current.offer).toBe(freeDeliveryOffer)
  })

  it('retains a direct-mount applied candidate through decrease, removal, and re-add without arithmetic unlocking or refetching', async () => {
    globalThis.fetch.mockResolvedValue(successfulResponse([]))
    const hook = renderProgress({
      cart: { products: [{ id: 1 }], subtotal: 35, offers: [freeDeliveryOffer] }
    })
    await waitFor(() => expect(hook.result.current.status).toBe('unlocked'))

    context.order.loading = true
    hook.rerender({ business, cart: { products: [{ id: 1 }], subtotal: 20, offers: [] } })
    expect(hook.result.current.status).toBe('hidden')
    context.order.loading = false
    hook.rerender({ business, cart: { products: [{ id: 1 }], subtotal: 20, offers: [] } })
    expect(hook.result.current).toMatchObject({ status: 'progress', remainingAmount: 10 })

    hook.rerender({ business, cart: { products: [], subtotal: 0, offers: [] } })
    expect(hook.result.current).toMatchObject({ status: 'awareness', minimum: 30 })
    hook.rerender({ business, cart: { products: [{ id: 1 }], subtotal: 35, offers: [] } })
    expect(hook.result.current).toMatchObject({ status: 'unconfirmed', diagnosticReason: 'threshold-not-applied' })
    hook.rerender({ business, cart: { products: [{ id: 1 }], subtotal: 35, offers: [{ id: freeDeliveryOffer.id }] } })
    expect(hook.result.current.status).toBe('unlocked')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['business', (hook) => hook.rerender({ business: { id: 7, slug: 'other' }, cart: null })],
    ['session', (hook) => { context.session.token = 'new-session'; hook.rerender({ business, cart: null }) }],
    ['location', (hook) => { context.order.options.address.location = { lat: 20, lng: -99 }; hook.rerender({ business, cart: null }) }],
    ['app', (hook) => { context.ordering.appId = 'other-app'; hook.rerender({ business, cart: null }) }],
    ['franchise', (hook) => hook.rerender({ business, cart: null, franchiseId: 91 })],
    ['refresh', (hook) => { hook.rerender({ business, cart: null }); act(() => hook.result.current.refresh()) }],
    ['disable', (hook) => { hook.rerender({ business, cart: null, enabled: false }); hook.rerender({ business, cart: null }) }]
  ])('does not retain applied fallback across a new %s eligibility generation', async (description, changeContext) => {
    globalThis.fetch.mockResolvedValue(successfulResponse([]))
    const hook = renderProgress({
      cart: { products: [{ id: 1 }], subtotal: 35, offers: [freeDeliveryOffer] }
    })
    await waitFor(() => expect(hook.result.current.status).toBe('unlocked'))
    hook.rerender({ business, cart: null })
    expect(hook.result.current.status).toBe('awareness')

    changeContext(hook)
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(hook.result.current.diagnosticReason).toBe('unsupported-offer'))
    expect(hook.result.current.offer).toBeNull()
  })

  it('discards retained applied fallback after failed refresh and does not restore it on retry', async () => {
    globalThis.fetch.mockResolvedValue(successfulResponse([]))
    const hook = renderProgress({
      cart: { products: [{ id: 1 }], subtotal: 35, offers: [freeDeliveryOffer] }
    })
    await waitFor(() => expect(hook.result.current.status).toBe('unlocked'))
    hook.rerender({ business, cart: null })
    expect(hook.result.current.status).toBe('awareness')
    globalThis.fetch.mockRejectedValueOnce(new Error('network failure'))
    act(() => hook.result.current.refresh())
    await waitFor(() => expect(hook.result.current.diagnosticReason).toBe('request-error'))
    act(() => hook.result.current.refresh())
    await waitFor(() => expect(hook.result.current.diagnosticReason).toBe('unsupported-offer'))
    expect(hook.result.current.offer).toBeNull()
    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
  })

  it('prefers an ID-only applied non-lowest public candidate on direct mount', async () => {
    globalThis.fetch.mockResolvedValueOnce(successfulResponse([
      freeDeliveryOffer,
      secondFreeDeliveryOffer
    ]))
    const cart = {
      products: [{ id: 1 }],
      subtotal: 30,
      offers: [{ id: freeDeliveryOffer.id }]
    }

    const hook = renderProgress({ cart })

    await waitFor(() => expect(hook.result.current.status).toBe('unlocked'))
    expect(hook.result.current).toMatchObject({
      offer: freeDeliveryOffer,
      minimum: 30,
      remainingAmount: 0,
      progressPercent: 100
    })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('reselects all retained public candidates from the latest applied cart offer without refetching', async () => {
    globalThis.fetch.mockResolvedValueOnce(successfulResponse([
      freeDeliveryOffer,
      secondFreeDeliveryOffer
    ]))
    const hook = renderProgress({
      cart: { products: [{ id: 1 }], subtotal: 10, offers: [] }
    })
    await waitFor(() => expect(hook.result.current.status).toBe('progress'))
    expect(hook.result.current).toMatchObject({
      offer: secondFreeDeliveryOffer,
      minimum: 20,
      remainingAmount: 10
    })

    hook.rerender({
      business,
      cart: {
        products: [{ id: 1 }],
        subtotal: 30,
        offers: [{ id: freeDeliveryOffer.id }]
      }
    })
    expect(hook.result.current).toMatchObject({
      status: 'unlocked',
      offer: freeDeliveryOffer,
      minimum: 30
    })

    hook.rerender({
      business,
      cart: { products: [{ id: 1 }], subtotal: 10, offers: [] }
    })
    expect(hook.result.current).toMatchObject({
      status: 'progress',
      offer: secondFreeDeliveryOffer,
      minimum: 20,
      remainingAmount: 10
    })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not refetch for equivalent API, business, location, socket, or cart object identities', async () => {
    const hook = renderProgress()
    await waitFor(() => expect(hook.result.current.status).toBe('awareness'))

    context.ordering = { ...context.ordering }
    context.order = {
      ...context.order,
      options: {
        ...context.order.options,
        address: {
          location: { lat: String(location.lat), lng: String(location.lng) }
        }
      }
    }
    context.socket = { getId: vi.fn(() => 'replacement-socket-id') }
    hook.rerender({
      business: { id: String(business.id), slug: business.slug },
      cart: { products: [{ id: 1 }], subtotal: 5, offers: [] }
    })

    expect(hook.result.current.status).toBe('progress')
    await act(async () => {})
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['OrderContext', () => { context.order.loading = true }, () => { context.order.loading = false }],
    ['SessionContext', () => { context.session.loading = true }, () => { context.session.loading = false }]
  ])('retains successful eligibility across temporary %s loading', async (description, startLoading, finishLoading) => {
    const hook = renderProgress()
    await waitFor(() => expect(hook.result.current.status).toBe('awareness'))
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    startLoading()
    hook.rerender({ business, cart: null })
    expect(hook.result.current.status).toBe('hidden')

    finishLoading()
    hook.rerender({ business, cart: null })
    expect(hook.result.current.status).toBe('awareness')
    await act(async () => {})
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['OrderContext', () => { context.order.loading = true }, () => { context.order.loading = false }],
    ['SessionContext', () => { context.session.loading = true }, () => { context.session.loading = false }]
  ])('retries a canceled pending request when %s loading stabilizes', async (description, startLoading, finishLoading) => {
    const canceledRequest = deferred()
    globalThis.fetch
      .mockImplementationOnce(() => canceledRequest.promise)
      .mockResolvedValueOnce(successfulResponse())
    const hook = renderProgress()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))

    startLoading()
    hook.rerender({ business, cart: null })
    expect(hook.result.current.status).toBe('hidden')

    finishLoading()
    hook.rerender({ business, cart: null })
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(hook.result.current.status).toBe('awareness'))

    await act(async () => {
      canceledRequest.resolve(successfulResponse([secondFreeDeliveryOffer]))
    })
    expect(hook.result.current.offer).toBe(freeDeliveryOffer)
  })

  it.each(['root', 'appId', 'appInternalName'])(
    'keys the cached candidate by the API %s',
    async (identityField) => {
      const hook = renderProgress()
      await waitFor(() => expect(hook.result.current.status).toBe('awareness'))
      const changedRequest = deferred()
      globalThis.fetch.mockImplementationOnce(() => changedRequest.promise)

      context.ordering = {
        ...context.ordering,
        [identityField]: `${context.ordering[identityField]}-changed`
      }
      hook.rerender({ business, cart: null })

      expect(hook.result.current.status).toBe('hidden')
      expect(hook.result.current.offer).toBeNull()
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2))
    }
  )

  it.each([
    ['the hook becomes disabled', (hook) => hook.rerender({ business, cart: null, enabled: false })],
    ['OrderContext starts loading', (hook) => {
      context.order.loading = true
      hook.rerender({ business, cart: null })
    }]
  ])('invalidates an in-flight response when %s', async (description, invalidate) => {
    const request = deferred()
    globalThis.fetch.mockImplementationOnce(() => request.promise)
    const hook = renderProgress()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))

    invalidate(hook)
    expect(hook.result.current.status).toBe('hidden')

    await act(async () => {
      request.resolve(successfulResponse())
    })
    expect(hook.result.current.status).toBe('hidden')
    expect(hook.result.current.offer).toBeNull()
  })

  it('returns a silent hidden state and retries after a network error', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('private network detail'))
    const hook = renderProgress()

    await waitFor(() => expect(hook.result.current.diagnosticReason).toBe('request-error'))
    expect(hook.result.current.status).toBe('hidden')
    expect(hook.result.current.offer).toBeNull()
    expect(hook.result.current.refresh).toEqual(expect.any(Function))

    globalThis.fetch.mockResolvedValueOnce(successfulResponse())
    act(() => hook.result.current.refresh())

    await waitFor(() => expect(hook.result.current.status).toBe('awareness'))
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('returns a silent hidden state for an API error even when the cart contains an offer', async () => {
    globalThis.fetch.mockResolvedValueOnce(apiResponse({
      error: true,
      result: ['private API detail']
    }))
    const cart = {
      products: [{ id: 1 }],
      subtotal: 30,
      offers: [freeDeliveryOffer]
    }

    const hook = renderProgress({ cart })

    await waitFor(() => expect(hook.result.current.diagnosticReason).toBe('request-error'))
    expect(hook.result.current.status).toBe('hidden')
    expect(hook.result.current.offer).toBeNull()
  })

  it('does not treat an HTTP failure as successful eligibility for direct-cart fallback', async () => {
    globalThis.fetch.mockResolvedValueOnce(apiResponse(
      { error: false, result: [] },
      { ok: false }
    ))
    const cart = {
      products: [{ id: 1 }],
      subtotal: 30,
      offers: [freeDeliveryOffer]
    }

    const hook = renderProgress({ cart })

    await waitFor(() => expect(hook.result.current.diagnosticReason).toBe('request-error'))
    expect(hook.result.current.status).toBe('hidden')
    expect(hook.result.current.offer).toBeNull()
  })

  it.each([
    ['a missing payload', null],
    ['a non-array result', { error: false, result: { id: freeDeliveryOffer.id } }],
    ['a missing result', { error: false }]
  ])('does not treat %s as successful eligibility for direct-cart fallback', async (description, payload) => {
    globalThis.fetch.mockResolvedValueOnce(apiResponse(payload))
    const cart = {
      products: [{ id: 1 }],
      subtotal: 30,
      offers: [freeDeliveryOffer]
    }

    const hook = renderProgress({ cart })

    await waitFor(() => expect(hook.result.current.diagnosticReason).toBe('request-error'))
    expect(hook.result.current.status).toBe('hidden')
    expect(hook.result.current.offer).toBeNull()
  })
})
