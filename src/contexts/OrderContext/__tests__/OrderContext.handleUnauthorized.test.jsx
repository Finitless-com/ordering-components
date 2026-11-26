import React from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  session: null,
  web: true
}))

vi.mock('../../SessionContext', () => ({
  useSession: () => [mocks.session, { logout: mocks.logout }]
}))
vi.mock('../../ApiContext', () => ({
  useApi: () => [{ appId: 'app', appInternalName: 'web', project: 'demo', root: 'https://api.test', setAccessToken: () => ({}) }]
}))
vi.mock('../../../utils/isWebRuntime', () => ({ isWebRuntime: () => mocks.web }))
vi.mock('../../WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-id', on: vi.fn(), off: vi.fn(), join: vi.fn(), leave: vi.fn() })
}))
vi.mock('../../LanguageContext', () => ({
  useLanguage: () => [{ loading: true }, (key, fallback) => fallback || key]
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
import { OrderProvider, useOrder, useOrderActions } from '../index'

let orderActions
let stableActions
const Probe = () => {
  [, orderActions] = useOrder()
  stableActions = useOrderActions()
  return null
}

const signedIn = (token, id = 1) => ({ auth: true, loading: false, token, user: { id } })
const signedOut = () => ({ auth: false, loading: false, token: null, user: null })

describe.each([
  ['web (clears the storage and reloads, never calls logout)', true],
  ['native (calls logout)', false]
])('OrderContext.handleUnauthorized: %s', (name, web) => {
  let strategy
  let view
  let reload
  const ui = () => <OrderProvider strategy={strategy} Alert={() => null}><Probe /></OrderProvider>
  const switchSession = (session) => {
    mocks.session = session
    view.rerender(ui())
  }
  const endedTimes = () => web
    ? strategy.removeItem.mock.calls.filter(([key]) => key === 'token').length
    : mocks.logout.mock.calls.length

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.web = web
    mocks.session = signedIn('tok-A')
    strategy = { getItem: vi.fn().mockResolvedValue(null), removeItem: vi.fn(), setItem: vi.fn() }
    reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    view = render(ui())
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('ends the session of the token that was answered 401, and says so', async () => {
    let ended
    await act(async () => { ended = await orderActions.handleUnauthorized('tok-A') })
    expect(ended).toBe(true)
    expect(endedTimes()).toBe(1)
    if (web) {
      expect(strategy.removeItem.mock.calls.map(([key]) => key)).toEqual(['token', 'user', 'device_code'])
      expect(reload).toHaveBeenCalledTimes(1)
      expect(mocks.logout).not.toHaveBeenCalled()
    } else {
      expect(reload).not.toHaveBeenCalled()
      expect(strategy.removeItem).not.toHaveBeenCalled()
    }
  })

  it('ends the session once for several reports of the same token, even when they arrive together', async () => {
    const results = []
    await act(async () => {
      results.push(...await Promise.all([
        orderActions.handleUnauthorized('tok-A'),
        orderActions.handleUnauthorized('tok-A'),
        stableActions.handleUnauthorized('tok-A')
      ]))
    })
    expect(results).toEqual([true, false, false])
    expect(endedTimes()).toBe(1)
    expect(reload).toHaveBeenCalledTimes(web ? 1 : 0)
  })

  it('does nothing for a token that is no longer the session\'s', async () => {
    switchSession(signedIn('tok-B'))
    let ended
    await act(async () => { ended = await orderActions.handleUnauthorized('tok-A') })
    expect(ended).toBe(false)
    expect(endedTimes()).toBe(0)
    expect(reload).not.toHaveBeenCalled()
  })

  it('does nothing when the session is gone by the time the answer is reported (the action sent earlier still sees the latest session)', async () => {
    const staleAction = orderActions.handleUnauthorized
    switchSession(signedOut())
    let ended
    await act(async () => { ended = await staleAction('tok-A') })
    expect(ended).toBe(false)
    expect(endedTimes()).toBe(0)
  })

  it('does nothing when nobody is signed in (guest, no token)', async () => {
    switchSession(signedOut())
    const results = []
    await act(async () => {
      results.push(await orderActions.handleUnauthorized(null), await orderActions.handleUnauthorized(undefined), await orderActions.handleUnauthorized('tok-A'))
    })
    expect(results).toEqual([false, false, false])
    expect(endedTimes()).toBe(0)
    expect(reload).not.toHaveBeenCalled()
  })

  it('a new session with a new token can be ended again', async () => {
    await act(async () => { await orderActions.handleUnauthorized('tok-A') })
    switchSession(signedIn('tok-B'))
    await act(async () => { await orderActions.handleUnauthorized('tok-B') })
    expect(endedTimes()).toBe(2)
  })
})
