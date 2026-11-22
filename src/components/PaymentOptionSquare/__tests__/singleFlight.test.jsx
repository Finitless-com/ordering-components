import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

// SERGIO-1462: `singleFlight` and `beforePlace` are opt-in. Without them the controller behaves as it
// always did (the first describe pins that); with them one attempt at a time is in flight across
// card, ACH and gift card, and ACH keeps its paid-but-unconfirmed cart reachable.
const order = vi.hoisted(() => ({ placeCart: vi.fn(), confirmCart: vi.fn() }))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [{}, { placeCart: order.placeCart, confirmCart: order.confirmCart }]
}))

import { PaymentOptionSquare } from '../index'

const BUTTONS = { card_payments: 'card-button', ach_bank_transfer: 'ach-button', gift_cards: 'gift-card-button' }
const SDK = { card_payments: 'card', ach_bank_transfer: 'ach', gift_cards: 'giftCard' }

let setCreateOrder
let onPlaceOrderClick
let tokenize
let tokenizeCalls

// each tokenize() waits for the test to answer it
const pendingTokenize = () => vi.fn(() => new Promise((resolve) => tokenizeCalls.push(resolve)))

const render = async (methods, props = {}) => {
  window.Square = {
    payments: () => Object.fromEntries(Object.values(SDK).map((name) => [name, async () => ({ attach: async () => {}, tokenize })]))
  }
  Object.values(BUTTONS).forEach((id) => {
    const button = document.createElement('button')
    button.id = id
    document.body.appendChild(button)
  })
  renderController(PaymentOptionSquare, {
    body: { paymethod_id: 6, amount: 42, delivery_zone_id: 0, cartUuid: 'cart-uuid' },
    data: {},
    onPlaceOrderClick,
    setCreateOrder,
    ...props
  })
  act(() => document.querySelector('script[src*=squarecdn]').onload())
  for (const method of methods) {
    act(() => lastControllerProps.handleChangeMethodSelected(method))
    await waitFor(() => expect(lastControllerProps.methodSelected).toBe(method))
    await waitFor(() => expect(lastControllerProps.isLoadingMethod).toBe(false))
  }
}

const press = (method) => act(async () => { document.getElementById(BUTTONS[method]).click() })

beforeEach(() => {
  order.placeCart.mockReset()
  order.confirmCart.mockReset()
  setCreateOrder = vi.fn()
  onPlaceOrderClick = vi.fn()
  tokenizeCalls = []
  tokenize = pendingTokenize()
})

afterEach(() => {
  delete window.Square
  document.querySelectorAll('script[src*=squarecdn], button[id$=-button]').forEach((node) => node.remove())
})

describe('PaymentOptionSquare without singleFlight (the behavior before)', () => {
  it('ACH: two activations tokenize twice, and the loading starts after the token', async () => {
    await render(['ach_bank_transfer'])
    await press('ach_bank_transfer')
    await press('ach_bank_transfer')
    expect(tokenize).toHaveBeenCalledTimes(2)
    expect(lastControllerProps.isLoadingPlace).toBe(false)
    expect(setCreateOrder).not.toHaveBeenCalled()
  })

  it('ACH: a failed confirmCart leaves the loading on and exposes nothing to retry', async () => {
    tokenize = vi.fn().mockResolvedValue({ status: 'OK', token: 'ach-1' })
    order.placeCart.mockResolvedValue({ error: false, result: { status: 2 } })
    order.confirmCart.mockResolvedValue({ error: true, result: ['rejected'] })
    await render(['ach_bank_transfer'])
    await press('ach_bank_transfer')
    await waitFor(() => expect(lastControllerProps.alertState.open).toBe(true))
    expect(lastControllerProps.isLoadingPlace).toBe(true)
    expect(setCreateOrder.mock.calls).toEqual([[true]])
    expect(lastControllerProps.pendingConfirm).toBeFalsy()
    expect(lastControllerProps.retryConfirm).toBeUndefined()
  })

  it('beforePlace is ignored: it belongs to singleFlight', async () => {
    tokenize = vi.fn().mockResolvedValue({ status: 'OK', token: 'card-1' })
    order.placeCart.mockResolvedValue({ error: false, result: { id: 1 } })
    const beforePlace = vi.fn().mockResolvedValue(false)
    await render(['card_payments'], { beforePlace })
    await press('card_payments')
    expect(beforePlace).not.toHaveBeenCalled()
    expect(order.placeCart).toHaveBeenCalledTimes(1)
  })

  it('one params object is reused by every attempt', async () => {
    tokenize = vi.fn().mockResolvedValueOnce({ status: 'OK', token: 'a' }).mockResolvedValueOnce({ status: 'OK', token: 'b' })
    order.placeCart.mockResolvedValue({ error: true, result: ['rejected'] })
    await render(['card_payments'])
    await press('card_payments')
    await press('card_payments')
    expect(order.placeCart.mock.calls[0][1]).toBe(order.placeCart.mock.calls[1][1])
  })
})

describe('PaymentOptionSquare with singleFlight', () => {
  it.each(['ach_bank_transfer', 'card_payments', 'gift_cards'])('%s: a second activation while the token is pending does nothing', async (method) => {
    order.placeCart.mockResolvedValue({ error: true, result: ['rejected'] })
    await render([method], { singleFlight: true })
    await press(method)
    // the loading is on before the token arrives
    expect(lastControllerProps.isLoadingPlace).toBe(true)
    expect(setCreateOrder.mock.calls).toEqual([[true]])
    await press(method)
    await press(method)
    expect(tokenize).toHaveBeenCalledTimes(1)
    await act(async () => tokenizeCalls[0]({ status: 'OK', token: 'tok' }))
    expect(order.placeCart).toHaveBeenCalledTimes(1)
    // a rejection ends the attempt: the loading clears and the lock is free again
    expect(lastControllerProps.isLoadingPlace).toBe(false)
    expect(setCreateOrder.mock.calls).toEqual([[true], [false]])
    await press(method)
    expect(tokenize).toHaveBeenCalledTimes(2)
  })

  it('the lock is shared: a pending card token blocks the gift card and ACH', async () => {
    await render(['card_payments', 'gift_cards', 'ach_bank_transfer'], { singleFlight: true })
    await press('card_payments')
    await press('gift_cards')
    await press('ach_bank_transfer')
    expect(tokenize).toHaveBeenCalledTimes(1)
  })

  it('each attempt sends its own params: the second never carries the first token', async () => {
    tokenize = vi.fn().mockResolvedValueOnce({ status: 'OK', token: 'a' }).mockResolvedValueOnce({ status: 'OK', token: 'b' })
    order.placeCart.mockResolvedValue({ error: true, result: ['rejected'] })
    await render(['card_payments'], { singleFlight: true })
    await press('card_payments')
    await press('card_payments')
    const [first, second] = order.placeCart.mock.calls.map(([, params]) => params)
    expect(first).not.toBe(second)
    expect([first.paymethod_data, second.paymethod_data]).toEqual([{ token: 'a' }, { token: 'b' }])
    expect(first).toMatchObject({ paymethod_id: 6, amount: 42 })
  })

  it('beforePlace runs inside the lock, before the token; false stops the attempt and frees the lock', async () => {
    tokenize = vi.fn().mockResolvedValue({ status: 'OK', token: 'tok' })
    order.placeCart.mockResolvedValue({ error: false, result: { id: 1 } })
    let answer
    const beforePlace = vi.fn(() => new Promise((resolve) => { answer = resolve }))
    await render(['card_payments'], { singleFlight: true, beforePlace })
    await press('card_payments')
    await press('card_payments')
    expect(beforePlace).toHaveBeenCalledTimes(1)
    expect(tokenize).not.toHaveBeenCalled()
    await act(async () => answer(false))
    expect(tokenize).not.toHaveBeenCalled()
    expect(lastControllerProps.isLoadingPlace).toBe(false)
    expect(setCreateOrder.mock.calls).toEqual([[true], [false]])

    beforePlace.mockResolvedValue(true)
    await press('card_payments')
    expect(tokenize).toHaveBeenCalledTimes(1)
    expect(order.placeCart).toHaveBeenCalledTimes(1)
    expect(onPlaceOrderClick).toHaveBeenCalledTimes(1)
  })

  describe('ACH when confirmCart fails after placeCart', () => {
    beforeEach(() => {
      tokenize = vi.fn().mockResolvedValue({ status: 'OK', token: 'ach-1' })
      order.placeCart.mockResolvedValue({ error: false, result: { status: 2 } })
      order.confirmCart.mockResolvedValueOnce({ error: true, result: ['rejected'] })
    })

    it('clears the loading, exposes pendingConfirm and never places the cart again', async () => {
      await render(['ach_bank_transfer'], { singleFlight: true })
      await press('ach_bank_transfer')
      await waitFor(() => expect(lastControllerProps.pendingConfirm).toBe(true))
      expect(lastControllerProps.isLoadingPlace).toBe(false)
      expect(setCreateOrder.mock.calls).toEqual([[true], [false]])

      await press('ach_bank_transfer')
      expect(tokenize).toHaveBeenCalledTimes(1)
      expect(order.placeCart).toHaveBeenCalledTimes(1)
    })

    it('retryConfirm only confirms, and the order opens when it answers', async () => {
      order.confirmCart.mockResolvedValueOnce({ error: false, result: { uuid: 'order-1' } })
      await render(['ach_bank_transfer'], { singleFlight: true })
      await press('ach_bank_transfer')
      await waitFor(() => expect(lastControllerProps.pendingConfirm).toBe(true))
      await act(async () => lastControllerProps.retryConfirm())
      expect(order.confirmCart).toHaveBeenCalledTimes(2)
      expect(order.placeCart).toHaveBeenCalledTimes(1)
      expect(onPlaceOrderClick).toHaveBeenCalledWith(null, null, { uuid: 'order-1' })
      expect(lastControllerProps.pendingConfirm).toBe(false)
    })

    it('a retry that fails again stays retryable with the loading off', async () => {
      order.confirmCart.mockResolvedValueOnce({ error: true, result: ['rejected again'] })
      await render(['ach_bank_transfer'], { singleFlight: true })
      await press('ach_bank_transfer')
      await waitFor(() => expect(lastControllerProps.pendingConfirm).toBe(true))
      await act(async () => lastControllerProps.retryConfirm())
      expect(lastControllerProps.pendingConfirm).toBe(true)
      expect(lastControllerProps.isLoadingPlace).toBe(false)
      expect(onPlaceOrderClick).not.toHaveBeenCalled()
    })
  })
})
