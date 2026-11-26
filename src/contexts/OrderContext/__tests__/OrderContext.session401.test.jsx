import React from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  orderOptionsGet: vi.fn(),
  setAccessToken: vi.fn(),
  session: null,
  web: true,
  languageLoading: true
}))

vi.mock('../../SessionContext', () => ({
  useSession: () => [mocks.session, { logout: mocks.logout }]
}))

vi.mock('../../ApiContext', () => ({
  useApi: () => [{
    appId: 'app',
    appInternalName: 'web',
    project: 'demo',
    root: 'https://api.test',
    setAccessToken: (token) => {
      mocks.setAccessToken(token)
      return { orderOptions: () => ({ get: mocks.orderOptionsGet }) }
    }
  }]
}))

vi.mock('../../../utils/isWebRuntime', () => ({ isWebRuntime: () => mocks.web }))

vi.mock('../../WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-id', on: vi.fn(), off: vi.fn(), join: vi.fn(), leave: vi.fn() })
}))
vi.mock('../../LanguageContext', () => ({
  useLanguage: () => [{ loading: mocks.languageLoading }, (key, fallback) => fallback || key]
}))
vi.mock('../../EventContext', () => ({ useEvent: () => [{ emit: vi.fn() }] }))
vi.mock('../../ConfigContext', () => ({
  useConfig: () => [{ loading: true, configs: { order_types_allowed: { value: '' } } }]
}))
vi.mock('../../CustomerContext', () => ({
  useCustomer: () => [{ user: null }, { setUserCustomer: vi.fn() }]
}))
vi.mock('../../ToastContext', () => ({
  ToastType: { Error: 'error', Info: 'info' },
  useToast: () => [{}, { showToast: vi.fn() }],
  useToastActions: () => ({ showToast: vi.fn() })
}))

// eslint-disable-next-line import/first
import { OrderProvider, useOrder } from '../index'

let orderState
let orderActions
const Probe = () => {
  [orderState, orderActions] = useOrder()
  return null
}

const signedIn = (token, id) => ({ auth: true, loading: true, token, user: { id } })
const signedOut = () => ({ auth: false, loading: false, token: null, user: null })

const deferred = () => {
  let resolve
  const promise = new Promise((_resolve) => { resolve = _resolve })
  return { promise, resolve }
}
const answer = (status, body) => ({ status, response: { data: body }, content: body })

describe.each([
  ['web (clears the storage and reloads)', false],
  ['native (calls logout)', true]
])('OrderContext 401 on /orderoptions: %s', (name, native) => {
  let strategy
  let view
  const mount = () => {
    view = render(<OrderProvider strategy={strategy} Alert={() => null}><Probe /></OrderProvider>)
  }
  const switchSession = (session) => {
    mocks.session = session
    view.rerender(<OrderProvider strategy={strategy} Alert={() => null}><Probe /></OrderProvider>)
  }
  const settle = async (request, response) => {
    await act(async () => { request.resolve(response); await Promise.resolve() })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }
  const loggedOutTimes = () => native
    ? mocks.logout.mock.calls.length
    : strategy.removeItem.mock.calls.filter(([key]) => key === 'token').length

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.languageLoading = true
    mocks.web = !native
    mocks.session = signedIn('tok-A', 1)
    strategy = { getItem: vi.fn().mockResolvedValue(null), removeItem: vi.fn(), setItem: vi.fn() }
  })
  const startRefresh = async () => {
    const request = deferred()
    mocks.orderOptionsGet.mockReturnValueOnce(request.promise)
    let refreshing
    await act(async () => { refreshing = orderActions.refreshOrderOptions() })
    // the request has been sent (after the storage reads)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(mocks.orderOptionsGet).toHaveBeenCalled()
    return { request, refreshing }
  }

  it('a 401 for the current token logs out once', async () => {
    mount()
    const { request } = await startRefresh()
    expect(mocks.setAccessToken).toHaveBeenLastCalledWith('tok-A')
    await settle(request, answer(401, { error: true, result: ['Unauthorized'] }))
    expect(loggedOutTimes()).toBe(1)
  })

  it('two 401s of the same session log out once', async () => {
    mount()
    const first = await startRefresh()
    const second = await startRefresh()
    await settle(first.request, answer(401, { error: true, result: ['Unauthorized'] }))
    await settle(second.request, answer(401, { error: true, result: ['Unauthorized'] }))
    expect(loggedOutTimes()).toBe(1)
  })

  it('a 401 answered after the session already ended does nothing', async () => {
    mount()
    const { request } = await startRefresh()
    switchSession(signedOut())
    await settle(request, answer(401, { error: true, result: ['Unauthorized'] }))
    expect(loggedOutTimes()).toBe(0)
  })

  it('a 401 for the previous token answered after a new sign-in does not log the new session out nor touch its state', async () => {
    mount()
    const { request } = await startRefresh()
    switchSession(signedOut())
    switchSession(signedIn('tok-B', 1))
    const before = orderState
    await settle(request, answer(401, { error: true, result: ['Unauthorized'] }))
    expect(loggedOutTimes()).toBe(0)
    expect(orderState).toBe(before)
  })

  it('a 200 for the previous token answered after a new sign-in is not applied to the new session', async () => {
    mount()
    const { request } = await startRefresh()
    switchSession(signedOut())
    switchSession(signedIn('tok-B', 2))
    const before = orderState
    await settle(request, answer(200, {
      error: false,
      result: { type: 2, carts: [{ id: 1, uuid: 'old-cart', business_id: 9, products: [] }] }
    }))
    expect(orderState).toBe(before)
    expect(Object.keys(orderState.carts)).toEqual([])
    expect(orderState.options.type).not.toBe(2)
  })

  it('a plain success is applied as before', async () => {
    mount()
    const { request, refreshing } = await startRefresh()
    await settle(request, answer(200, {
      error: false,
      result: { type: 2, carts: [{ id: 1, uuid: 'cart-1', business_id: 9, products: [] }] }
    }))
    await act(async () => { await refreshing })
    expect(loggedOutTimes()).toBe(0)
    expect(orderState.options.type).toBe(2)
    expect(orderState.loading).toBe(false)
    expect(Object.values(orderState.carts).map(cart => cart.uuid)).toEqual(['cart-1'])
  })
})

describe('OrderContext reloads the options when the token of the session changes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.web = false
    mocks.languageLoading = false
    mocks.session = { ...signedIn('tok-A', 1), loading: false }
    mocks.orderOptionsGet.mockResolvedValue(answer(200, { error: false, result: { type: 1, carts: [] } }))
  })
  afterEach(() => { mocks.languageLoading = true })

  it('loads on sign in, not again for the same session, and again when only the token changes', async () => {
    const strategy = { getItem: vi.fn().mockResolvedValue(null), removeItem: vi.fn(), setItem: vi.fn() }
    const ui = () => <OrderProvider strategy={strategy} Alert={() => null}><Probe /></OrderProvider>
    const view = render(ui())
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(mocks.orderOptionsGet).toHaveBeenCalledTimes(1)
    mocks.session = { ...mocks.session }
    view.rerender(ui())
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(mocks.orderOptionsGet).toHaveBeenCalledTimes(1)
    mocks.session = { ...mocks.session, token: 'tok-B' }
    view.rerender(ui())
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(mocks.orderOptionsGet).toHaveBeenCalledTimes(2)
    expect(mocks.setAccessToken).toHaveBeenLastCalledWith('tok-B')
  })
})
