import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const orders = vi.hoisted(() => {
  const { createCustomerOrdersTestContext } = require('../../../__tests__/helpers/customerOrdersTestHelpers')
  return createCustomerOrdersTestContext(vi)
})

const mockParsePrice = vi.hoisted(() => vi.fn(price => `SRD ${price.toFixed(2)}`))

vi.mock('../../../contexts/EventContext', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useEvent: () => [{ emit: orders.mockEmit, on: orders.mockEventsOn, off: orders.mockEventsOff }]
  }
})

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false, language: { code: 'en' } }, orders.mockT]
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => [[], { showToast: orders.mockShowToast }],
  ToastType: { error: 'error', success: 'success', info: 'info' }
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    loading: false,
    user: { id: 8, name: 'Test User', level: 0 },
    token: 'session-tok'
  }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [orders.mockOrderState, {
    reorder: orders.mockReorder,
    clearCart: orders.mockClearCart
  }]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{ configs: orders.mockConfigState }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [orders.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => orders.mockSocket
}))

vi.mock('../../../contexts/UtilsContext', () => ({
  useUtils: () => [{ parsePrice: mockParsePrice }]
}))

import { OrderDetails } from '../index'

describe('OrderDetails', () => {
  const orderProp = {
    id: 101,
    status: 0,
    business_id: 5,
    driver: null,
    total: 19.5
  }

  beforeEach(() => orders.reset())

  it('formats prices for display', () => {
    renderController(OrderDetails, { orderId: 101, order: orderProp })
    expect(lastControllerProps.formatPrice(19.5)).toBe('SRD 19.50')
    expect(mockParsePrice).toHaveBeenCalledWith(19.5)
  })

  it('merges dataToSave without hitting the API', async () => {
    renderController(OrderDetails, { orderId: 101, order: orderProp })
    const updated = await lastControllerProps.handleChangeOrderStatus(7, {}, {
      dataToSave: { prepared_in: 20 }
    })
    expect(updated.prepared_in).toBe(20)
    expect(orders.mockOrderSave).not.toHaveBeenCalled()
  })

  it('loads order messages', async () => {
    renderController(OrderDetails, { orderId: 101, order: orderProp })
    await act(async () => {
      await lastControllerProps.loadMessages()
    })
    await waitFor(() => {
      expect(lastControllerProps.messages.loading).toBe(false)
    })
    expect(lastControllerProps.messages.messages).toHaveLength(1)
  })

  it('sends parking spot message to customer', async () => {
    renderController(OrderDetails, { orderId: 101, order: orderProp })
    await act(async () => {
      await lastControllerProps.handlerSubmit({ spot: 12 })
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/orders/101/messages',
      expect.objectContaining({ method: 'post' })
    )
  })

  it('assigns driver and loads driver list', async () => {
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder, isFetchDrivers: true })
    await waitFor(() => {
      expect(lastControllerProps.drivers.loadingDriver).toBe(false)
    })
    await act(async () => {
      await lastControllerProps.handleAssignDriver(4)
    })
    expect(orders.mockOrderSave).toHaveBeenCalledWith({ driver_id: 4 })
  })

  it('updates status through API and reorders', async () => {
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
    await waitFor(() => expect(lastControllerProps.order.loading).toBe(false))
    await act(async () => {
      await lastControllerProps.handleChangeOrderStatus(7)
    })
    expect(orders.mockOrderSave).toHaveBeenCalledWith({ status: 7 }, {})
    await act(async () => {
      await lastControllerProps.handleReorder(101)
    })
    expect(orders.mockReorder).toHaveBeenCalledWith(101)
  })

  it('marks messages as read', async () => {
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
    await act(async () => {
      await lastControllerProps.loadMessages()
    })
    await waitFor(() => expect(lastControllerProps.messages.messages).toHaveLength(1))
    await act(async () => {
      await lastControllerProps.readMessages()
    })
    expect(orders.mockEmit).toHaveBeenCalledWith('order_message_read', 101)
  })

  it('removes cart items before reorder', async () => {
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
    await act(async () => {
      await lastControllerProps.handleRemoveCart()
    })
    expect(orders.mockClearCart).toHaveBeenCalledWith('cart-uuid-5')
    expect(orders.mockReorder).toHaveBeenCalledWith(101)
  })

  it('surfaces force-update when delivery area validation fails', async () => {
    orders.mockOrderSave.mockResolvedValueOnce({
      content: {
        error: true,
        result: ['outside delivery area, insert reasons to force update']
      }
    })
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
    await act(async () => {
      await lastControllerProps.handleChangeOrderStatus(11)
    })
    await waitFor(() => {
      expect(lastControllerProps.forceUpdate).toBe(11)
    })
  })

  it('fetches order and business when order prop is omitted', async () => {
    renderController(OrderDetails, { orderId: 101 })
    await waitFor(() => {
      expect(lastControllerProps.order.loading).toBe(false)
    })
    expect(lastControllerProps.order.order.id).toBe(101)
    expect(orders.mockOrderGet).toHaveBeenCalled()
    expect(orders.mockBusinessGet).toHaveBeenCalled()
  })

  it('updates driver GPS position', async () => {
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
    await act(async () => {
      await lastControllerProps.updateDriverPosition({ lat: 10, lng: 20 })
    })
    expect(orders.mockDriverLocationsSave).toHaveBeenCalledWith({ lat: 10, lng: 20 })
  })

  it('rejects logistic assign request', async () => {
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
    let result
    await act(async () => {
      result = await lastControllerProps.handleClickLogisticOrder(2, 77, { id: 77 })
    })
    expect(orders.mockShowToast).toHaveBeenCalled()
    expect(result).toEqual({ error: false })
  })

  it('returns the accepted orders so the UI can ask for a delivery time', async () => {
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
    let result
    await act(async () => {
      result = await lastControllerProps.handleClickLogisticOrder(1, 77, { id: 101 })
    })
    expect(result).toMatchObject({ error: false, orderIds: [101], defaultEta: null })
  })

  it('saves the delivery time on the orders of an accepted assign request', async () => {
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
    await act(async () => {
      await lastControllerProps.handleUpdateLogisticOrdersEta([101], 25)
    })
    expect(orders.mockOrderSave).toHaveBeenCalledWith({ delivered_in: 25, id: 101 })
  })

  it('handles websocket order and driver tracking updates', async () => {
    renderController(OrderDetails, {
      orderId: 101,
      order: { ...orders.sampleOrder, driver_id: 4, driver: { id: 4 } }
    })
    await waitFor(() => expect(lastControllerProps.order.loading).toBe(false))
    const updateHandler = orders.mockSocket.on.mock.calls.find(([event]) => event === 'update_order')?.[1]
    const trackingHandler = orders.mockSocket.on.mock.calls.find(([event]) => event === 'tracking_driver')?.[1]
    act(() => {
      updateHandler?.({ id: 101, status: 3 })
      trackingHandler?.({ driver_id: 4, location: { lat: 11, lng: 22 } })
    })
    expect(orders.mockShowToast).toHaveBeenCalled()
    expect(lastControllerProps.driverLocation).toEqual({ lat: 11, lng: 22 })
  })

  it('surfaces pickup force-update validation', async () => {
    orders.mockOrderSave.mockResolvedValueOnce({
      content: {
        error: true,
        result: ['outside pickup area, insert reasons to force update']
      }
    })
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
    await act(async () => {
      await lastControllerProps.handleChangeOrderStatus(9)
    })
    await waitFor(() => {
      expect(lastControllerProps.forceUpdate).toBe(9)
    })
  })

  it('delegates spot messages to sendCustomMessage', async () => {
    const sendCustomMessage = vi.fn()
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder, sendCustomMessage })
    await act(async () => {
      await lastControllerProps.handlerSubmit({ spot: 8 })
    })
    expect(sendCustomMessage).toHaveBeenCalledWith(8)
  })

  it('sends estimated preparation chat after status save', async () => {
    orders.mockOrderSave.mockResolvedValueOnce({
      content: { error: false, result: { ...orders.sampleOrder, status: 7, prepared_in: 12 } }
    })
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
    await act(async () => {
      await lastControllerProps.handleChangeOrderStatus(7, { prepared_in: 12 })
    })
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test/orders/101/messages',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('shows reservation alert for business app completions', async () => {
    orders.mockOrderSave.mockResolvedValueOnce({
      content: { error: false, result: { ...orders.sampleOrder, status: 7, reservation: true } }
    })
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder, isBusinessApp: true })
    await act(async () => {
      await lastControllerProps.handleChangeOrderStatus(7)
    })
    await waitFor(() => {
      expect(lastControllerProps.showReservationAlert).toBe(true)
    })
  })

  it('loads loyalty plans on mount', async () => {
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
    await waitFor(() => {
      expect(lastControllerProps.loyaltyPlansState.loading).toBe(false)
    })
    expect(lastControllerProps.loyaltyPlansState.result).toHaveLength(1)
  })
})
