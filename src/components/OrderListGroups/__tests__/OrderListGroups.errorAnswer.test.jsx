import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The REAL OrderProvider is mounted around the REAL OrderListGroups: the 401 of a list ends the session
// through the order context, so what is under test is the two together. Only the contexts that talk to
// the network, the socket or the storage are replaced.
const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  ordersGet: vi.fn(),
  setAccessToken: vi.fn(),
  session: null,
  web: false
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [mocks.session, { logout: mocks.logout }]
}))
vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [{
    appId: 'app',
    appInternalName: 'driver_app',
    project: 'demo',
    root: 'https://api.test',
    setAccessToken: (token) => {
      mocks.setAccessToken(token)
      return { orders: () => ({ get: (options) => mocks.ordersGet(token, options) }) }
    }
  }]
}))
vi.mock('../../../utils/isWebRuntime', () => ({ isWebRuntime: () => mocks.web }))
vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => ({ getId: () => 'socket-id', on: vi.fn(), off: vi.fn(), join: vi.fn(), leave: vi.fn() })
}))
vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: true }, (key, fallback) => fallback || key]
}))
vi.mock('../../../contexts/EventContext', () => ({
  useEvent: () => [{ emit: vi.fn(), on: vi.fn(), off: vi.fn() }]
}))
vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{ loading: true, configs: { order_types_allowed: { value: '' } } }]
}))
vi.mock('../../../contexts/CustomerContext', () => ({
  useCustomer: () => [{ user: null }, { setUserCustomer: vi.fn() }]
}))
vi.mock('../../../contexts/ToastContext', () => ({
  ToastType: { Error: 'error', Info: 'info', Success: 'success' },
  useToast: () => [{}, { showToast: vi.fn() }],
  useToastActions: () => ({ showToast: vi.fn() })
}))

// eslint-disable-next-line import/first
import { OrderProvider, useOrder } from '../../../contexts/OrderContext'
// eslint-disable-next-line import/first
import { OrderListGroups } from '../index'

let list
const UI = (props) => {
  list = props
  return null
}

const signedIn = (token, id = 1) => ({ auth: true, loading: false, token, user: { id, level: 4 } })
const signedOut = () => ({ auth: false, loading: false, token: null, user: null })

const deferred = () => {
  let resolve
  const promise = new Promise((_resolve) => { resolve = _resolve })
  return { promise, resolve }
}
const answer = (status, body) => ({ status, response: { data: body }, content: body })
const order = (id, status = 0) => ({ id, status, products: [], customer: { id: 5 }, business: { id: 6 } })
const page = (current, totalPages, total, orders) => answer(200, {
  error: false,
  result: orders,
  pagination: { current_page: current, page_size: 10, total_pages: totalPages, total, from: (current - 1) * 10 + 1, to: current * 10 }
})
const apiError = (status, result = ['Unauthorized']) => answer(status, { error: true, result })

const settle = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

let strategy
let view
const ui = (props = {}) => (
  <OrderProvider strategy={strategy} Alert={() => null}>
    <OrderListGroups UIComponent={UI} isDriverApp isNetConnected {...props} />
  </OrderProvider>
)
const mount = async () => {
  view = render(ui())
  await settle()
}
const switchSession = (session) => {
  mocks.session = session
  view.rerender(ui())
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.web = false
  mocks.session = signedIn('tok-A')
  strategy = { getItem: vi.fn().mockResolvedValue(null), removeItem: vi.fn(), setItem: vi.fn() }
  list = null
})
afterEach(() => { vi.unstubAllGlobals() })

const INITIAL_PAGINATION = { currentPage: 1, pageSize: 10, total: null }
const PAGE_1 = { currentPage: 1, pageSize: 10, totalPages: 3, total: 25, from: 1, to: 10 }
const PAGE_2 = { currentPage: 2, pageSize: 10, totalPages: 3, total: 25, from: 11, to: 20 }
const hasNoUndefinedField = (value) => Object.values(value).every(field => field !== undefined)

describe('a success of the list is what it was', () => {
  it('the tab load', async () => {
    mocks.ordersGet.mockResolvedValue(page(1, 3, 25, [order(1), order(2)]))
    await mount()
    expect(list.ordersGroup.pending).toEqual({
      loading: false,
      error: null,
      orders: [order(2), order(1)],
      pagination: PAGE_1,
      defaultFilter: [0, 13],
      currentFilter: [0, 13],
      fetched: true
    })
    expect(mocks.logout).not.toHaveBeenCalled()
  })

  it('the load of the next page', async () => {
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(1)]))
    await mount()
    mocks.ordersGet.mockResolvedValueOnce(page(2, 3, 25, [order(2)]))
    await act(async () => { await list.loadOrders() })
    expect(list.ordersGroup.pending.orders.map(o => o.id)).toEqual([2, 1])
    expect(list.ordersGroup.pending.pagination).toEqual(PAGE_2)
    expect(list.ordersGroup.pending.error).toBeNull()
    expect(list.ordersGroup.pending.loading).toBe(false)
  })

  it('the filtered load', async () => {
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(1)]))
    await mount()
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(7), order(8)]))
    await act(async () => { list.onFiltered({ id: '7' }) })
    await settle()
    expect(list.ordersFiltered).toEqual({
      loading: false,
      error: false,
      orders: [order(8), order(7)],
      pagination: PAGE_1
    })
  })

  it('the load of the next page of the filtered list', async () => {
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(1)]))
    await mount()
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(7)]))
    await act(async () => { list.onFiltered({ id: '7' }) })
    await settle()
    mocks.ordersGet.mockResolvedValueOnce(page(2, 3, 25, [order(9)]))
    await act(async () => { await list.loadMoreOrders({ allStatusses: true }) })
    expect(list.ordersFiltered.orders.map(o => o.id)).toEqual([7, 9])
    expect(list.ordersFiltered.pagination).toEqual(PAGE_2)
    expect(list.ordersFiltered.loading).toBe(false)
    expect(list.ordersFiltered.error).toBe(false)
  })
})

// An answer of the API with `error: true` has a `result` (the messages) and NO pagination.
// The SDK resolves every status below 500; the 500 case is here for a body that answers with one.
describe.each([
  [401, ['Unauthorized']],
  [403, ['You do not have permission']],
  [404, ['Not found']],
  [422, 'The where is invalid'],
  [500, ['Something failed']]
])('an error answer (HTTP %i) of the list is an error, not a crash', (status, message) => {
  const failure = () => apiError(status, message)

  it('the tab load: the API\'s message, loading released, the pagination of the tab as it was', async () => {
    mocks.ordersGet.mockResolvedValueOnce(failure())
    await mount()
    const tab = list.ordersGroup.pending
    expect(tab.error).toEqual(message)
    expect(tab.loading).toBe(false)
    expect(tab.fetched).toBe(true)
    expect(tab.orders).toEqual([])
    expect(tab.pagination).toEqual(INITIAL_PAGINATION)
    expect(hasNoUndefinedField(tab.pagination)).toBe(true)
  })

  it('the tab load of the next page keeps the orders and the pagination it had', async () => {
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(1), order(2)]))
    await mount()
    mocks.ordersGet.mockResolvedValueOnce(failure())
    await act(async () => { await list.loadOrders() })
    const tab = list.ordersGroup.pending
    expect(tab.error).toEqual(message)
    expect(tab.loading).toBe(false)
    expect(tab.orders.map(o => o.id)).toEqual([2, 1])
    expect(tab.pagination).toEqual(PAGE_1)
  })

  it('the tab "load more" keeps the orders and the pagination it had', async () => {
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(1), order(2)]))
    await mount()
    mocks.ordersGet.mockResolvedValueOnce(failure())
    await act(async () => { await list.loadMoreOrders() })
    const tab = list.ordersGroup.pending
    expect(tab.error).toEqual(message)
    expect(tab.loading).toBe(false)
    expect(tab.orders.map(o => o.id)).toEqual([2, 1])
    expect(tab.pagination).toEqual(PAGE_1)
  })

  it('a refresh of the tab (new fetch) empties it as the code intends for an error, with the message', async () => {
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(1)]))
    await mount()
    mocks.ordersGet.mockResolvedValueOnce(failure())
    await act(async () => { await list.loadOrders({ newFetchCurrent: true }) })
    const tab = list.ordersGroup.pending
    expect(tab.error).toEqual(message)
    expect(tab.loading).toBe(false)
    expect(tab.orders).toEqual([])
    expect(hasNoUndefinedField(tab.pagination)).toBe(true)
  })

  it('the filtered load: the API\'s message, loading released, the pagination of the filter as it was', async () => {
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(1)]))
    await mount()
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(7)]))
    await act(async () => { list.onFiltered({ id: '7' }) })
    await settle()
    expect(list.ordersFiltered.pagination).toEqual(PAGE_1)
    mocks.ordersGet.mockResolvedValueOnce(failure())
    await act(async () => { list.onFiltered({ id: '8' }) })
    await settle()
    expect(list.ordersFiltered.error).toEqual(message)
    expect(list.ordersFiltered.loading).toBe(false)
    expect(list.ordersFiltered.orders).toEqual([])
    expect(list.ordersFiltered.pagination).toEqual(PAGE_1)
  })

  it('the filtered load before any answer keeps the initial pagination', async () => {
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(1)]))
    await mount()
    mocks.ordersGet.mockResolvedValueOnce(failure())
    await act(async () => { list.onFiltered({ id: '8' }) })
    await settle()
    expect(list.ordersFiltered.error).toEqual(message)
    expect(list.ordersFiltered.loading).toBe(false)
    expect(list.ordersFiltered.pagination).toEqual({ currentPage: 0, pageSize: 10, total: null })
  })

  it('the filtered "load more" keeps the orders and the pagination it had', async () => {
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(1)]))
    await mount()
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(7)]))
    await act(async () => { list.onFiltered({ id: '7' }) })
    await settle()
    mocks.ordersGet.mockResolvedValueOnce(failure())
    await act(async () => { await list.loadMoreOrders({ allStatusses: true }) })
    expect(list.ordersFiltered.error).toEqual(message)
    expect(list.ordersFiltered.loading).toBe(false)
    expect(list.ordersFiltered.orders.map(o => o.id)).toEqual([7])
    expect(list.ordersFiltered.pagination).toEqual(PAGE_1)
  })

  it('never shows a JavaScript error as the error of the list', async () => {
    mocks.ordersGet.mockResolvedValueOnce(failure())
    await mount()
    expect(JSON.stringify(list.ordersGroup.pending.error)).not.toMatch(/current_page|undefined|Cannot read/)
  })
})

describe('an error answer without a message still shows an error', () => {
  it('uses ERROR when the API sent none', async () => {
    mocks.ordersGet.mockResolvedValueOnce(apiError(403, []))
    await mount()
    expect(list.ordersGroup.pending.error).toEqual(['ERROR'])
  })
})

describe.each([
  ['web (clears the storage and reloads)', true],
  ['native (calls logout)', false]
])('a 401 of the list ends the session: %s', (name, web) => {
  let reload
  const endedTimes = () => web
    ? strategy.removeItem.mock.calls.filter(([key]) => key === 'token').length
    : mocks.logout.mock.calls.length

  beforeEach(() => {
    mocks.web = web
    reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
  })

  it('a 401 answered with the current token ends the session once and the list shows the API\'s message', async () => {
    mocks.ordersGet.mockResolvedValueOnce(apiError(401, ['Unauthorized']))
    await mount()
    await waitFor(() => expect(endedTimes()).toBe(1))
    expect(mocks.ordersGet).toHaveBeenCalledWith('tok-A', expect.anything())
    expect(list.ordersGroup.pending.error).toEqual(['Unauthorized'])
    expect(list.ordersGroup.pending.loading).toBe(false)
    if (web) {
      expect(strategy.removeItem.mock.calls.map(([key]) => key)).toEqual(['token', 'user', 'device_code'])
      expect(reload).toHaveBeenCalledTimes(1)
      expect(mocks.logout).not.toHaveBeenCalled()
    } else {
      expect(reload).not.toHaveBeenCalled()
      expect(strategy.removeItem).not.toHaveBeenCalled()
    }
  })

  it('three lists that fail together with the same token end the session once', async () => {
    const requests = [deferred(), deferred(), deferred()]
    mocks.ordersGet.mockImplementation(() => requests[mocks.ordersGet.mock.calls.length - 1].promise)
    await mount()
    await act(async () => { list.setCurrentTabSelected('inProgress') })
    await act(async () => { list.setCurrentTabSelected('completed') })
    await waitFor(() => expect(mocks.ordersGet).toHaveBeenCalledTimes(3))
    await act(async () => {
      requests.forEach(request => request.resolve(apiError(401)))
      await Promise.resolve()
    })
    await settle()
    expect(endedTimes()).toBe(1)
    expect(mocks.ordersGet.mock.calls.map(([token]) => token)).toEqual(['tok-A', 'tok-A', 'tok-A'])
  })

  it('a 401 for a token that is no longer the session\'s does nothing but show the list\'s error', async () => {
    const request = deferred()
    mocks.ordersGet.mockReturnValueOnce(request.promise)
    await mount()
    await waitFor(() => expect(mocks.ordersGet).toHaveBeenCalledTimes(1))
    switchSession(signedOut())
    switchSession(signedIn('tok-B'))
    await act(async () => { request.resolve(apiError(401)); await Promise.resolve() })
    await settle()
    expect(endedTimes()).toBe(0)
    expect(reload).not.toHaveBeenCalled()
  })

  it('a 401 answered after the session already ended does nothing', async () => {
    const request = deferred()
    mocks.ordersGet.mockReturnValueOnce(request.promise)
    await mount()
    await waitFor(() => expect(mocks.ordersGet).toHaveBeenCalledTimes(1))
    switchSession(signedOut())
    await act(async () => { request.resolve(apiError(401)); await Promise.resolve() })
    await settle()
    expect(endedTimes()).toBe(0)
  })

  it('a 401 without a session (guest) does nothing', async () => {
    mocks.session = signedOut()
    mocks.ordersGet.mockResolvedValueOnce(apiError(401))
    await mount()
    await settle()
    expect(endedTimes()).toBe(0)
    expect(list.ordersGroup.pending.error).toEqual(['Unauthorized'])
  })

  it('a 403 does not end the session', async () => {
    mocks.ordersGet.mockResolvedValueOnce(apiError(403, ['Forbidden']))
    await mount()
    await settle()
    expect(endedTimes()).toBe(0)
  })

  it('a success does not end the session', async () => {
    mocks.ordersGet.mockResolvedValueOnce(page(1, 1, 1, [order(1)]))
    await mount()
    await settle()
    expect(endedTimes()).toBe(0)
  })

  it('a later 401 of the same token, from another request of the list, does not end the session again', async () => {
    mocks.ordersGet.mockResolvedValueOnce(apiError(401))
    await mount()
    await waitFor(() => expect(endedTimes()).toBe(1))
    mocks.ordersGet.mockResolvedValueOnce(apiError(401))
    await act(async () => { await list.loadOrders({ newFetchCurrent: true }) })
    await settle()
    expect(endedTimes()).toBe(1)
  })
})

describe('OrderListGroups does not subscribe to the order state', () => {
  it('a change of the order state does not render the list again, while a consumer of useOrder does; a 401 still ends the session once', async () => {
    let probeRenders = 0
    let orderActions
    let uiRenders = 0
    const CountingUI = (props) => {
      uiRenders++
      list = props
      return null
    }
    const Probe = () => {
      probeRenders++
      ;[, orderActions] = useOrder()
      return null
    }
    // the same element objects on every render: only a context change can render them again
    const tree = (
      <OrderProvider strategy={strategy} Alert={() => null}>
        <Probe />
        <OrderListGroups UIComponent={CountingUI} isDriverApp isNetConnected />
      </OrderProvider>
    )
    const pending = deferred()
    mocks.ordersGet.mockReturnValueOnce(pending.promise)
    view = render(tree)
    await settle()
    await waitFor(() => expect(mocks.ordersGet).toHaveBeenCalledTimes(1))
    const uiBefore = uiRenders
    const probeBefore = probeRenders
    await act(async () => { orderActions.setStateValues({ options: { type: 2 } }) })
    await act(async () => { orderActions.setStateValues({ options: { type: 1 } }) })
    expect(probeRenders).toBeGreaterThan(probeBefore)
    expect(uiRenders).toBe(uiBefore)

    await act(async () => { pending.resolve(apiError(401)); await Promise.resolve() })
    await settle()
    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(list.ordersGroup.pending.error).toEqual(['Unauthorized'])
  })
})

describe('OrderListGroups mounted without an OrderProvider', () => {
  const bare = () => <OrderListGroups UIComponent={UI} isDriverApp isNetConnected />
  let warn
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
  afterEach(() => { warn.mockRestore() })

  it('loads the list', async () => {
    mocks.ordersGet.mockResolvedValueOnce(page(1, 3, 25, [order(1), order(2)]))
    view = render(bare())
    await settle()
    expect(list.ordersGroup.pending.orders.map(o => o.id)).toEqual([2, 1])
    expect(list.ordersGroup.pending.pagination).toEqual(PAGE_1)
    expect(list.ordersGroup.pending.error).toBeNull()
  })

  it('shows an error answer as an error and does not throw on a 401 (it only is the list\'s error)', async () => {
    mocks.ordersGet.mockResolvedValueOnce(apiError(401))
    view = render(bare())
    await settle()
    expect(list.ordersGroup.pending.error).toEqual(['Unauthorized'])
    expect(list.ordersGroup.pending.loading).toBe(false)
    expect(list.ordersGroup.pending.pagination).toEqual(INITIAL_PAGINATION)
    expect(mocks.logout).not.toHaveBeenCalled()
  })
})
