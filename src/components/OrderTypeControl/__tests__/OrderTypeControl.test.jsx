import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderController, getControllerUI, lastControllerProps } from '../../../__tests__/helpers/renderController'
import { OrderTypeControl } from '../index'

const changeType = vi.fn()
const emit = vi.fn()
const orderStateMock = vi.hoisted(() => ({ extra: {} }))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [{ options: { type: 1 }, ...orderStateMock.extra }, { changeType }]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{ configs: { unaddressed_order_types_allowed: { value: '2|5' } } }]
}))

vi.mock('../../../contexts/EventContext', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useEvent: () => [{ emit }]
  }
})

describe('OrderTypeControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orderStateMock.extra = {}
  })

  it('renders UIComponent with selected order type', () => {
    renderController(OrderTypeControl)
    expect(getControllerUI()).toBeInTheDocument()
    expect(lastControllerProps.typeSelected).toBe(1)
    expect(typeof lastControllerProps.handleChangeOrderType).toBe('function')
  })

  it('emits require_order_address for address-required types', async () => {
    renderController(OrderTypeControl)
    await lastControllerProps.handleChangeOrderType(1)
    expect(changeType).toHaveBeenCalledWith(1)
    expect(emit).toHaveBeenCalledWith('require_order_address', { orderType: 1 })
  })

  it('does not emit when order type is unaddressed', async () => {
    renderController(OrderTypeControl)
    await lastControllerProps.handleChangeOrderType(2)
    expect(changeType).toHaveBeenCalledWith(2)
    expect(emit).not.toHaveBeenCalled()
  })

  it('still asks for the address for eat in when the state has no extra unaddressed types', async () => {
    renderController(OrderTypeControl)
    await lastControllerProps.handleChangeOrderType(3)
    expect(emit).toHaveBeenCalledWith('require_order_address', { orderType: 3 })
  })

  it('does not emit for the extra unaddressed types of the order state', async () => {
    orderStateMock.extra = { extraUnaddressedOrderTypes: [2, 3, 4, 5, 6, 8] }
    renderController(OrderTypeControl)
    await lastControllerProps.handleChangeOrderType(3)
    expect(changeType).toHaveBeenCalledWith(3)
    expect(emit).not.toHaveBeenCalled()
    await lastControllerProps.handleChangeOrderType(1)
    expect(emit).toHaveBeenCalledWith('require_order_address', { orderType: 1 })
  })

  it('does not emit for pickup when pickupWithoutAddress is on and the config lacks it', async () => {
    orderStateMock.extra = { pickupWithoutAddress: true }
    renderController(OrderTypeControl)
    await lastControllerProps.handleChangeOrderType(2)
    expect(emit).not.toHaveBeenCalled()
  })
})
