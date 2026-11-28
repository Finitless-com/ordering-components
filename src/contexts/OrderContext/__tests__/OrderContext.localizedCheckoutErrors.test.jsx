import React from 'react'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addProduct: vi.fn(), applyCoupon: vi.fn(), place: vi.fn(), reorder: vi.fn(), emit: vi.fn(), translate: vi.fn()
}))

vi.mock('../../SessionContext', () => ({ useSession: () => [{ auth: true, loading: true, token: 'token', user: { id: 8 } }, { logout: vi.fn() }] }))
vi.mock('../../ApiContext', () => ({
  useApi: () => [{
    appId: 'app',
    appInternalName: 'web',
    project: 'demo',
    root: 'https://api.test',
    setAccessToken: () => ({
      carts: () => ({ addProduct: mocks.addProduct, applyCoupon: mocks.applyCoupon, place: mocks.place }),
      orders: () => ({ reorder: mocks.reorder })
    })
  }]
}))
vi.mock('../../WebsocketContext', () => ({ useWebsocket: () => ({ getId: () => 'socket-id', on: vi.fn(), off: vi.fn(), join: vi.fn(), leave: vi.fn() }) }))
vi.mock('../../LanguageContext', () => ({ useLanguage: () => [{ loading: true }, mocks.translate] }))
vi.mock('../../EventContext', () => ({ useEvent: () => [{ emit: mocks.emit }] }))
vi.mock('../../ConfigContext', () => ({ useConfig: () => [{ loading: true, configs: { order_types_allowed: { value: '' } } }] }))
vi.mock('../../CustomerContext', () => ({ useCustomer: () => [{ user: null }, { setUserCustomer: vi.fn() }] }))
vi.mock('../../ToastContext', () => ({ ToastType: { Error: 'error', Info: 'info' }, useToast: () => [{}, { showToast: vi.fn() }], useToastActions: () => ({ showToast: vi.fn() }) }))

// eslint-disable-next-line import/first
import { OrderProvider, useOrder } from '../index'

let actions
let state
const Probe = () => { [state, actions] = useOrder(); return null }
const raw = ['payment declined']
const localizedErrors = [{ index: 0, message: 'Pago rechazado' }]
const methods = [
  ['addProduct', () => actions.addProduct({ id: 1, name: 'Taco' }, { business_id: 5 }, false), false],
  ['applyCoupon', () => actions.applyCoupon({ business_id: 5, coupon: 'TEST' }), false],
  ['place', () => actions.placeCart('cart-1', { paymethod_id: 1 }), undefined],
  ['reorder', () => actions.reorder('order-1', false), { error: true, result: raw }]
]

describe('OrderProvider localized checkout errors', () => {
  let strategy
  let Alert
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.translate.mockImplementation((key, fallback) => fallback ?? key)
    strategy = { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn(), removeItem: vi.fn() }
    Alert = vi.fn(() => null)
    for (const name of ['addProduct', 'applyCoupon', 'place', 'reorder']) {
      mocks[name].mockResolvedValue({ status: 400, content: { error: true, result: raw, localized_errors: localizedErrors } })
    }
  })

  describe.each(methods)('%s', (method, invoke, expectedReturn) => {
    it.each([false, true])('preserves the raw outcome with opt-in %s', async enabled => {
      render(<OrderProvider strategy={strategy} Alert={Alert} localizedCheckoutErrors={enabled}><Probe /></OrderProvider>)
      let result
      await act(async () => { result = await invoke() })
      expect(mocks[method]).toHaveBeenCalledTimes(1)
      const args = mocks[method].mock.calls[0]
      const options = args[args.length - 1]
      expect(options.headers).toMatchObject({ 'X-Socket-Id-X': 'socket-id' })
      if (enabled) expect(options.query).toMatchObject({ localized_errors: '1' })
      else expect(options.query?.localized_errors).toBeUndefined()
      expect(result).toEqual(expectedReturn)
      expect(state.loading).toBe(false)
      const alert = Alert.mock.calls.map(([props]) => props).find(props => props.open)
      expect(alert).toMatchObject({ content: raw, status: 400 })
      if (enabled) expect(alert.localizedErrors).toEqual(localizedErrors)
      else expect(alert.localizedErrors).toBeUndefined()
      expect(raw).toEqual(['payment declined'])
    })
  })

  it('defaults to disabled when the provider prop is omitted', async () => {
    render(<OrderProvider strategy={strategy} Alert={Alert}><Probe /></OrderProvider>)
    await act(async () => { await actions.reorder('order-1', false) })
    expect(mocks.reorder.mock.calls[0][0].query?.localized_errors).toBeUndefined()
    const alert = Alert.mock.calls.map(([props]) => props).find(props => props.open)
    expect(alert.content).toEqual(raw)
    expect(alert.localizedErrors).toBeUndefined()
  })

  it('preserves the customer query and raw return on reorder', async () => {
    strategy.getItem.mockImplementation(async key => key === 'user-customer' ? { id: 27 } : null)
    render(<OrderProvider strategy={strategy} Alert={Alert} localizedCheckoutErrors><Probe /></OrderProvider>)
    let result
    await act(async () => { result = await actions.reorder('order-1', false) })
    expect(mocks.reorder.mock.calls[0][0].query).toEqual({ user_id: 27, localized_errors: '1' })
    expect(result).toEqual({ error: true, result: raw })
  })

  it('preserves a dictionary translation equal to the raw place error', async () => {
    mocks.translate.mockImplementation((key, fallback) => key === 'PAYMENT_DECLINED' ? raw[0] : fallback ?? key)
    render(<OrderProvider strategy={strategy} Alert={Alert} localizedCheckoutErrors><Probe /></OrderProvider>)
    await act(async () => { await actions.placeCart('cart-1', {}) })
    const alert = Alert.mock.calls.map(([props]) => props).find(props => props.open)
    expect(alert.content).toEqual(raw)
    expect(alert.localizedErrors).toBeUndefined()
  })

  it('does not replace a friendly place error with localized API metadata', async () => {
    const result = ['ERROR_CART_PLACE_TOTAL_DIFFERENT']
    mocks.place.mockResolvedValue({ status: 400, content: { error: true, result, localized_errors: [{ index: 0, message: 'Precio cambiado' }] } })
    render(<OrderProvider strategy={strategy} Alert={Alert} localizedCheckoutErrors><Probe /></OrderProvider>)
    await act(async () => { await actions.placeCart('cart-1', {}) })
    const alert = Alert.mock.calls.map(([props]) => props).find(props => props.open)
    expect(alert.content).toEqual(['Price adjustments are still being applied. Please try again in a moment.'])
    expect(alert.localizedErrors).toBeUndefined()
    expect(result).toEqual(['ERROR_CART_PLACE_TOTAL_DIFFERENT'])
  })
})
