import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// SERGIO-1688 / SERGIO-1681: the REAL OrderingProvider with the REAL OrderProvider
// (only the leaf contexts around them are replaced): the optional props it accepts
// reach the order provider, observed by what that provider does with them, and
// without them nothing changes.

const mocks = vi.hoisted(() => ({
  auth: false,
  save: undefined,
  config: undefined,
  session: undefined
}))

const passthrough = ({ children }) => <>{children}</>

vi.mock('../../SiteContext', () => ({ SiteProvider: passthrough }))
vi.mock('../../SessionContext', () => ({ SessionProvider: passthrough, useSession: () => mocks.session }))
vi.mock('../../WebsocketContext', () => ({
  WebsocketProvider: passthrough,
  useWebsocket: () => ({ getId: () => 'socket-id', on: vi.fn(), off: vi.fn(), join: vi.fn(), leave: vi.fn() })
}))
vi.mock('../../LanguageContext', () => ({
  LanguageProvider: passthrough,
  useLanguage: () => [{ loading: true }, (key, fallback) => fallback || key]
}))
vi.mock('../../ApiContext', () => ({
  ApiProvider: passthrough,
  useApi: () => [{
    appId: 'app',
    project: 'demo',
    setAccessToken: () => ({
      carts: () => ({}),
      orderOptions: () => ({ get: vi.fn(), save: (...args) => mocks.save(...args) })
    })
  }]
}))
vi.mock('../../EventContext', () => ({ EventProvider: passthrough, useEvent: () => [{ emit: vi.fn() }] }))
vi.mock('../../CustomerContext', () => ({
  CustomerProvider: passthrough,
  useCustomer: () => [{ user: null }, { setUserCustomer: vi.fn() }]
}))
vi.mock('../../ToastContext', () => ({
  ToastProvider: passthrough,
  ToastType: { Error: 'error', Info: 'info' },
  useToast: () => [{}, { showToast: vi.fn() }],
  useToastActions: () => ({ showToast: vi.fn() })
}))
vi.mock('../../BusinessContext', () => ({ BusinessProvider: passthrough }))
vi.mock('../../ConfigContext', () => ({ ConfigProvider: passthrough, useConfig: () => [mocks.config] }))
vi.mock('../../ValidationsFieldsContext', () => ({ ValidationFieldsProvider: passthrough }))
vi.mock('../../OrderingThemeContext', () => ({ OrderingThemeProvider: passthrough }))
vi.mock('../../OptimizationLoadContext', () => ({ OptimizationLoadProvider: passthrough }))
vi.mock('../../UtilsContext', () => ({ UtilsProviders: passthrough }))
vi.mock('../../../webStrategy', () => ({
  WebStrategy: class {
    getItem = vi.fn().mockResolvedValue(null)
    setItem = vi.fn().mockResolvedValue(undefined)
    removeItem = vi.fn()
  }
}))

const { OrderingProvider } = await import('../index')
const { useOrder } = await import('../../OrderContext')

const settings = { api: {}, socket: {} }
const supported = [1, 2, 3, 4, 5, 7, 8, 9]

let orderState
let orderActions
const Probe = () => {
  [orderState, orderActions] = useOrder()
  return null
}

const renderOrdering = (props = {}) => render(
  <OrderingProvider settings={settings} disableWorkerPickup {...props}>
    <Probe />
  </OrderingProvider>
)

describe('OrderingProvider passes its optional order props to the real OrderProvider', () => {
  beforeEach(() => {
    mocks.config = {
      loading: false,
      configs: {
        order_types_allowed: { value: '6|2' },
        default_order_type: { key: 'default_order_type', type: 2, value: 'seatdelivery' }
      }
    }
    mocks.session = [{ auth: false, loading: false, token: 'token' }, { logout: vi.fn() }]
    mocks.save = vi.fn()
  })

  afterEach(() => { vi.useRealTimers() })

  it('supportedOrderTypes: the type it starts in is the first allowed one it supports, never the 6', async () => {
    renderOrdering({ supportedOrderTypes: supported })
    await waitFor(() => expect(orderState.loading).toBe(false))
    expect(orderState.options.type).toBe(2)
  })

  it('without the props nothing changes: the project order still wins (6)', async () => {
    renderOrdering()
    await waitFor(() => expect(orderState.loading).toBe(false))
    expect(orderState.options.type).toBe(6)
  })

  it('orderOptionsWriteTimeout: a write that never answers stops holding loading when it runs out', async () => {
    vi.useFakeTimers()
    mocks.config.configs.order_types_allowed = { value: '1|2' }
    mocks.config.configs.default_order_type = { key: 'default_order_type', type: 2, value: 'delivery' }
    mocks.session = [{ auth: true, loading: false, token: 'token', user: { id: 8 } }, { logout: vi.fn() }]
    mocks.save = vi.fn(() => new Promise(() => {}))
    renderOrdering({ orderOptionsWriteTimeout: 4000 })
    await act(async () => { orderActions.setStateValues({ options: { type: 1 } }) })
    await act(async () => { orderActions.changeType(2) })
    expect(orderState.loading).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(orderState.loading).toBe(false)
    expect(orderState.options.type).toBe(2)
  })

  it('without orderOptionsWriteTimeout that write keeps loading, as before', async () => {
    vi.useFakeTimers()
    mocks.config.configs.order_types_allowed = { value: '1|2' }
    mocks.config.configs.default_order_type = { key: 'default_order_type', type: 2, value: 'delivery' }
    mocks.session = [{ auth: true, loading: false, token: 'token', user: { id: 8 } }, { logout: vi.fn() }]
    mocks.save = vi.fn(() => new Promise(() => {}))
    renderOrdering()
    await act(async () => { orderActions.setStateValues({ options: { type: 1 } }) })
    await act(async () => { orderActions.changeType(2) })
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(orderState.loading).toBe(true)
  })

  it('ignoreStaleTypeResponses: the answer of a superseded type write does not undo the later one', async () => {
    mocks.config.configs.order_types_allowed = { value: '1|2|3' }
    mocks.config.configs.default_order_type = { key: 'default_order_type', type: 2, value: 'delivery' }
    mocks.session = [{ auth: true, loading: false, token: 'token', user: { id: 8 } }, { logout: vi.fn() }]
    const answers = []
    mocks.save = vi.fn(() => new Promise((resolve) => { answers.push(resolve) }))
    const answer = (type) => ({ status: 200, content: { error: false, result: { type, carts: [] } } })

    const run = async (props) => {
      answers.length = 0
      mocks.save.mockClear()
      const view = renderOrdering(props)
      await act(async () => { orderActions.setStateValues({ options: { type: 1 } }) })
      let first
      let second
      await act(async () => { first = orderActions.changeType(2) })
      await waitFor(() => expect(answers).toHaveLength(1))
      await act(async () => { second = orderActions.changeType(3) })
      await waitFor(() => expect(answers).toHaveLength(2))
      await act(async () => { answers[1](answer(3)); await second })
      await act(async () => { answers[0](answer(2)); await first })
      const type = orderState.options.type
      view.unmount()
      return type
    }

    expect(await run({ ignoreStaleTypeResponses: true })).toBe(3)
    expect(await run()).toBe(2)
  })
})
