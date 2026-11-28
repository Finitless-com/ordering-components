import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps, ControllerUI } from '../../../__tests__/helpers/renderController'

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

const mockTranslate = vi.hoisted(() => vi.fn((...args) => orders.mockT(...args)))

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false, language: { code: 'en' } }, mockTranslate]
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

// eslint-disable-next-line import/first
import { EventProvider } from '../../../contexts/EventContext'
// eslint-disable-next-line import/first
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

  it('does not request chat messages when the caller disables them', async () => {
    await act(async () => {
      renderController(OrderDetails, { orderId: 101, order: orderProp, disableMessages: true })
    })
    expect(lastControllerProps.order.order.id).toBe(101)
    expect(global.fetch).not.toHaveBeenCalledWith(
      'https://api.test/orders/101/messages',
      expect.anything()
    )
  })

  it('leaves chat when disabled and keeps order and driver tracking active', async () => {
    const { rerender } = render(
      <OrderDetails UIComponent={ControllerUI} orderId={101} order={orderProp} />
    )
    await waitFor(() => expect(orders.mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function)))
    expect(orders.mockSocket.join).toHaveBeenCalledWith('messages_orders')

    act(() => {
      rerender(<OrderDetails UIComponent={ControllerUI} orderId={101} order={orderProp} disableMessages />)
    })
    expect(orders.mockSocket.leave).toHaveBeenCalledWith('messages_orders')
    expect(orders.mockSocket.off).toHaveBeenCalledWith('message', expect.any(Function))
    orders.mockSocket.join.mockClear()
    orders.mockSocket.on.mockClear()
    renderController(OrderDetails, { orderId: 101, order: orderProp, disableMessages: true })
    expect(orders.mockSocket.join.mock.calls).toEqual([['orders']])
    expect(orders.mockSocket.on.mock.calls.map(([event]) => event)).toEqual(['tracking_driver', 'update_order'])
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

  it('does not ask for messages while there is no order (it could not load)', async () => {
    orders.mockOrderGet.mockResolvedValue({ content: { error: true, result: ['ERROR_ORDER_FIND'] } })
    renderController(OrderDetails, { orderId: 999 })
    await waitFor(() => {
      expect(lastControllerProps.order.loading).toBe(false)
    })
    expect(lastControllerProps.order.error).toEqual(['ERROR_ORDER_FIND'])
    const messageCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('/messages'))
    expect(messageCalls).toEqual([])
  })

  it('asks for the messages of the order once it has loaded', async () => {
    renderController(OrderDetails, { orderId: 101 })
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('https://api.test/orders/101/messages', expect.anything())
    })
    const urls = global.fetch.mock.calls.map(([url]) => String(url))
    expect(urls.some(url => url.includes('undefined'))).toBe(false)
  })

  it('cancels the previous order GET when orderId changes and ignores a late response', async () => {
    const pending = []
    orders.mockOrderGet.mockImplementation(async (options) => {
      if (options?.cancelToken) {
        options.cancelToken.cancel = vi.fn()
      }
      return new Promise(resolve => {
        pending.push({ options, resolve })
      })
    })
    const view = render(
      <EventProvider>
        <OrderDetails UIComponent={ControllerUI} orderId={101} />
      </EventProvider>
    )
    await waitFor(() => expect(orders.mockOrderGet).toHaveBeenCalledTimes(1))
    const firstToken = orders.mockOrderGet.mock.calls[0][0].cancelToken

    view.rerender(
      <EventProvider>
        <OrderDetails UIComponent={ControllerUI} orderId={202} />
      </EventProvider>
    )

    await waitFor(() => expect(firstToken.cancel).toHaveBeenCalled())
    await waitFor(() => expect(orders.mockOrderGet).toHaveBeenCalledTimes(2))

    await act(async () => {
      pending[1].resolve({
        content: { error: false, result: { id: 202, status: 1, business_id: 5 } }
      })
    })
    await waitFor(() => {
      expect(lastControllerProps.order.loading).toBe(false)
      expect(lastControllerProps.order.order.id).toBe(202)
    })

    await act(async () => {
      pending[0].resolve({
        content: { error: false, result: { id: 101, status: 0, business_id: 5 } }
      })
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(lastControllerProps.order.order?.id).toBe(202)
    expect(lastControllerProps.order.loading).toBe(false)
    expect(orders.mockBusinessGet).toHaveBeenCalledTimes(1)
  })

  it('updates driver GPS position', async () => {
    renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
    await act(async () => {
      await lastControllerProps.updateDriverPosition({ lat: 10, lng: 20 })
    })
    expect(orders.mockDriverLocationsSave).toHaveBeenCalledWith({ lat: 10, lng: 20 })
  })

  describe('logistic request notice opt-in', () => {
    const setup = async (props = {}) => {
      renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder, ...props })
    }

    it.each([[1, true], [2, false]])('formats status %s using only the PUT result', async (status, accepted) => {
      const formatLogisticRequestNotice = vi.fn(() => 'formatted notice')
      await setup({ formatLogisticRequestNotice })
      const request = { id: 900, type: 'order', order_id: 123, order: { id: 123 } }
      global.fetch.mockResolvedValueOnce({ json: async () => ({ error: false, result: request }) })
      let result
      await act(async () => { result = await lastControllerProps.handleClickLogisticOrder(status, 77, { id: 77, order: { id: 101 } }) })
      expect(formatLogisticRequestNotice).toHaveBeenCalledTimes(1)
      expect(formatLogisticRequestNotice).toHaveBeenCalledWith({ accepted, request })
      expect(orders.mockShowToast).toHaveBeenCalledWith(undefined, 'formatted notice')
      expect(mockTranslate).not.toHaveBeenCalled()
      expect(result.error).toBe(false)
    })

    describe.each([
      [1, 'Delivery request accepted'],
      [2, 'Delivery request declined']
    ])('after a successful PUT for status %s', (status, notice) => {
      it.each([
        ['throws', () => { throw new Error('translation failed') }],
        ['returns a non-string', () => 123],
        ['returns an empty string', () => ''],
        ['returns a whitespace-only string', () => '  ']
      ])('keeps the successful outcome and shows the generic notice when the formatter %s', async (_case, formatter) => {
        const formatLogisticRequestNotice = vi.fn(formatter)
        await setup({ formatLogisticRequestNotice })
        const request = { id: 900, type: 'order', order_id: 123, order: { id: 123 } }
        global.fetch.mockResolvedValueOnce({ json: async () => ({ error: false, result: request }) })
        const localRequest = { id: 77, order: { id: 101 } }
        mockTranslate.mockClear()
        const originalProject = orders.mockOrdering.project
        orders.mockOrdering.project = 'quickiedelivery'
        let result
        try {
          await act(async () => { result = await lastControllerProps.handleClickLogisticOrder(status, 77, localRequest) })
        } finally {
          orders.mockOrdering.project = originalProject
        }

        expect(result).toEqual(status === 1
          ? { error: false, order: localRequest.order, orderIds: [101], defaultEta: 10 }
          : { error: false })
        expect(formatLogisticRequestNotice).toHaveBeenCalledExactlyOnceWith({ accepted: status === 1, request })
        expect(orders.mockShowToast.mock.calls.map(([, message]) => message)).toEqual([notice])
        expect(mockTranslate.mock.calls).toEqual(status === 1 ? [['LOGISTIC_DEFAULT_ETA_TIME', '10']] : [])
        expect(orders.mockOrderSave.mock.calls).toEqual(status === 1 ? [[{ delivered_in: 10, id: 101 }]] : [])
      })
    })

    it.each([[1, 'Your accepted the order number 77'], [2, 'Your rejected the order number 77']])('preserves the legacy notice for status %s', async (status, notice) => {
      await setup()
      await act(async () => { await lastControllerProps.handleClickLogisticOrder(status, 77, { id: 77, order: { id: 101 } }) })
      expect(orders.mockShowToast).toHaveBeenCalledWith(undefined, notice)
    })

    it.each([[1], [2]])('does not format a failed request for status %s', async (status) => {
      const formatLogisticRequestNotice = vi.fn()
      await setup({ formatLogisticRequestNotice })
      global.fetch.mockResolvedValueOnce({ json: async () => ({ error: true, result: 'request failed' }) })
      let result
      await act(async () => { result = await lastControllerProps.handleClickLogisticOrder(status, 77, { id: 77, order: { id: 101 } }) })
      expect(formatLogisticRequestNotice).not.toHaveBeenCalled()
      expect(orders.mockShowToast).toHaveBeenCalledWith(undefined, 'request failed')
      expect(result).toEqual({ error: true, result: 'request failed' })
    })

    it('does not format a transport failure', async () => {
      const formatLogisticRequestNotice = vi.fn()
      await setup({ formatLogisticRequestNotice })
      global.fetch.mockRejectedValueOnce(new Error('offline'))
      let result
      await act(async () => { result = await lastControllerProps.handleClickLogisticOrder(1, 77, { id: 77 }) })
      expect(formatLogisticRequestNotice).not.toHaveBeenCalled()
      expect(result).toEqual({ error: true, result: 'offline' })
    })
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

  describe('clearErrorOnAction (opt-in)', () => {
    const failStatus = () => orders.mockOrderSave.mockResolvedValueOnce({
      content: { error: true, result: ['not allowed'], error_codes: ['order.other'], retry_after: 5 }
    })

    it('keeps the error of a failed status change after a successful retry by default', async () => {
      failStatus()
      renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
      await act(async () => { await lastControllerProps.handleChangeOrderStatus(7) })
      await waitFor(() => expect(lastControllerProps.order.error).toEqual(['not allowed']))
      orders.mockOrderSave.mockResolvedValueOnce({ content: { error: false, result: { id: 101, status: 7 } } })
      await act(async () => { await lastControllerProps.handleChangeOrderStatus(7) })
      expect(lastControllerProps.order.error).toEqual(['not allowed'])
    })

    it('clears the error when a new status change starts and when it succeeds', async () => {
      failStatus()
      renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder, clearErrorOnAction: true })
      await act(async () => { await lastControllerProps.handleChangeOrderStatus(7) })
      await waitFor(() => expect(lastControllerProps.order.error).toEqual(['not allowed']))
      expect(lastControllerProps.order.errorCodes).toEqual(['order.other'])
      expect(lastControllerProps.order.retryAfter).toBe(5)

      let resolveSave
      orders.mockOrderSave.mockReturnValueOnce(new Promise(resolve => { resolveSave = resolve }))
      let pending
      act(() => { pending = lastControllerProps.handleChangeOrderStatus(7) })
      await waitFor(() => expect(lastControllerProps.order.loading).toBe(true))
      expect(lastControllerProps.order.error).toBeNull()
      await act(async () => {
        resolveSave({ content: { error: false, result: { id: 101, status: 7 } } })
        await pending
      })
      expect(lastControllerProps.order.error).toBeNull()
      expect(lastControllerProps.order.errorCodes).toBeNull()
      expect(lastControllerProps.order.retryAfter).toBeNull()
      expect(lastControllerProps.order.order.status).toBe(7)
    })

    it('replaces the error with the new one when the retry fails again', async () => {
      failStatus()
      renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder, clearErrorOnAction: true })
      await act(async () => { await lastControllerProps.handleChangeOrderStatus(7) })
      orders.mockOrderSave.mockResolvedValueOnce({ content: { error: true, result: ['still blocked'] } })
      await act(async () => { await lastControllerProps.handleChangeOrderStatus(7) })
      await waitFor(() => expect(lastControllerProps.order.error).toEqual(['still blocked']))
    })

    it('clears the error when a thrown request is retried', async () => {
      orders.mockOrderSave.mockRejectedValueOnce(new Error('offline'))
      renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder, clearErrorOnAction: true })
      await act(async () => { await lastControllerProps.handleChangeOrderStatus(7) })
      await waitFor(() => expect(lastControllerProps.order.error).toEqual(['offline']))
      orders.mockOrderSave.mockResolvedValueOnce({ content: { error: false, result: { id: 101, status: 7 } } })
      await act(async () => { await lastControllerProps.handleChangeOrderStatus(7) })
      expect(lastControllerProps.order.error).toBeNull()
    })

    it('clears the error of a failed driver assignment on retry and does not merge the error list into the order', async () => {
      orders.mockOrderSave.mockResolvedValueOnce({ content: { error: true, result: ['driver busy'] } })
      renderController(OrderDetails, { orderId: 101, order: { ...orders.sampleOrder }, clearErrorOnAction: true })
      await act(async () => { await lastControllerProps.handleAssignDriver(4) })
      await waitFor(() => expect(lastControllerProps.order.error).toEqual(['driver busy']))
      expect(lastControllerProps.order.order[0]).toBeUndefined()
      orders.mockOrderSave.mockResolvedValueOnce({ content: { error: false, result: { id: 101, driver_id: 4 } } })
      await act(async () => { await lastControllerProps.handleAssignDriver(4) })
      expect(lastControllerProps.order.error).toBeNull()
      expect(lastControllerProps.order.order.driver_id).toBe(4)
    })

    it('keeps the old driver assignment behaviour without the prop (error list merged into the order)', async () => {
      orders.mockOrderSave.mockResolvedValueOnce({ content: { error: true, result: ['driver busy'] } })
      renderController(OrderDetails, { orderId: 101, order: { ...orders.sampleOrder } })
      await act(async () => { await lastControllerProps.handleAssignDriver(4) })
      await waitFor(() => expect(lastControllerProps.order.error).toEqual(['driver busy']))
      expect(lastControllerProps.order.order[0]).toBe('driver busy')
    })

    it('exposes clearError, which only resets the error fields', async () => {
      failStatus()
      renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
      await act(async () => { await lastControllerProps.handleChangeOrderStatus(7) })
      await waitFor(() => expect(lastControllerProps.order.error).toEqual(['not allowed']))
      act(() => lastControllerProps.clearError())
      expect(lastControllerProps.order.error).toBeNull()
      expect(lastControllerProps.order.errorCodes).toBeNull()
      expect(lastControllerProps.order.retryAfter).toBeNull()
      expect(lastControllerProps.order.order.id).toBe(101)
      expect(lastControllerProps.order.loading).toBe(false)
    })
  })

  describe('order status regression', () => {
    it('asks for a reason when the project blocks regressions and the API rejects the change', async () => {
      orders.mockConfigState.order_status_regression_validation_enabled = { value: '1' }
      orders.mockOrderSave.mockResolvedValueOnce({
        content: { error: true, result: ['The order cannot go back from delivery_completed_by_driver to accepted_by_business.'] }
      })
      renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
      await act(async () => {
        await lastControllerProps.handleChangeOrderStatus(7)
      })
      await waitFor(() => {
        expect(lastControllerProps.regressionRequest).toEqual({ status: 7, body: { status: 7 } })
      })
      expect(lastControllerProps.order.error).toBeNull()
      expect(lastControllerProps.order.loading).toBe(false)
      act(() => lastControllerProps.clearRegressionRequest())
      await waitFor(() => expect(lastControllerProps.regressionRequest).toBeNull())
    })

    it('keeps the pending body when the rejected change carried extra fields', async () => {
      orders.mockConfigState.order_status_regression_validation_enabled = { value: '1' }
      orders.mockOrderSave.mockResolvedValueOnce({ content: { error: true, result: ['blocked'] } })
      renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
      await act(async () => {
        await lastControllerProps.handleChangeOrderStatus(8, { status: 8, delivered_in: 15 })
      })
      await waitFor(() => {
        expect(lastControllerProps.regressionRequest).toEqual({ status: 8, body: { status: 8, delivered_in: 15 } })
      })
    })

    it('does not ask for a reason when the request already carried one', async () => {
      orders.mockConfigState.order_status_regression_validation_enabled = { value: '1' }
      orders.mockOrderSave.mockResolvedValueOnce({ content: { error: true, result: ['still blocked'] } })
      renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
      await act(async () => {
        await lastControllerProps.handleChangeOrderStatus(7, { status: 7, reasons: 'customer asked' })
      })
      await waitFor(() => expect(lastControllerProps.order.error).toEqual(['still blocked']))
      expect(lastControllerProps.regressionRequest).toBeNull()
    })

    it('surfaces the plain error when the project does not block regressions', async () => {
      orders.mockConfigState.order_status_regression_validation_enabled = { value: '0' }
      orders.mockOrderSave.mockResolvedValueOnce({ content: { error: true, result: ['not allowed'] } })
      renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
      await act(async () => {
        await lastControllerProps.handleChangeOrderStatus(7)
      })
      await waitFor(() => expect(lastControllerProps.order.error).toEqual(['not allowed']))
      expect(lastControllerProps.regressionRequest).toBeNull()
    })
  })

  describe('order status regression error codes', () => {
    it('asks for a reason when the API flags the regression error code', async () => {
      orders.mockConfigState.order_status_regression_validation_enabled = { value: '1' }
      orders.mockOrderSave.mockResolvedValueOnce({
        content: { error: true, result: ['blocked'], error_codes: ['order.status_regression'] }
      })
      renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
      await act(async () => {
        await lastControllerProps.handleChangeOrderStatus(7)
      })
      await waitFor(() => expect(lastControllerProps.regressionRequest).toEqual({ status: 7, body: { status: 7 } }))
    })

    it('surfaces the plain error when the API flags a different error code', async () => {
      orders.mockConfigState.order_status_regression_validation_enabled = { value: '1' }
      orders.mockOrderSave.mockResolvedValueOnce({
        content: { error: true, result: ['location required'], error_codes: ['order.location_required'] }
      })
      renderController(OrderDetails, { orderId: 101, order: orders.sampleOrder })
      await act(async () => {
        await lastControllerProps.handleChangeOrderStatus(7)
      })
      await waitFor(() => expect(lastControllerProps.order.error).toEqual(['location required']))
      expect(lastControllerProps.regressionRequest).toBeNull()
    })
  })
})
