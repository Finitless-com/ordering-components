import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'
import { mergeAssignRequestOrders } from '../utils'

const orders = vi.hoisted(() => {
  const { createCustomerOrdersTestContext } = require('../../../__tests__/helpers/customerOrdersTestHelpers')
  return createCustomerOrdersTestContext(vi)
})

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

import { OrderListGroups } from '../index'

describe('OrderListGroups', () => {
  beforeEach(() => orders.reset())

  it('mergeAssignRequestOrders upserts logistic assign requests', () => {
    const existing = [{ id: 1, status: 0 }]
    const incoming = { id: 1, status: 1, order: { id: 101 } }
    expect(mergeAssignRequestOrders(existing, incoming)).toEqual([{ id: 1, status: 1, order: { id: 101 } }])
    expect(mergeAssignRequestOrders(existing, { id: 2, status: 0 })).toHaveLength(2)
    expect(mergeAssignRequestOrders(null, { id: 3 })).toEqual([{ id: 3 }])
  })

  it('loads pending orders on mount', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => {
      expect(lastControllerProps.ordersGroup.pending.loading).toBe(false)
    })
    expect(lastControllerProps.ordersGroup.pending.orders.length).toBeGreaterThan(0)
  })

  it('switches tabs and marks tab loading', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    act(() => {
      lastControllerProps.setCurrentTabSelected('completed')
    })
    await waitFor(() => {
      expect(lastControllerProps.currentTabSelected).toBe('completed')
    })
  })

  it('changes order status through API', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.orders.length).toBeGreaterThan(0))
    await act(async () => {
      await lastControllerProps.handleChangeOrderStatus(7, [101])
    })
    expect(orders.mockOrderSave).toHaveBeenCalled()
  })

  it('deletes orders from the current tab', async () => {
    renderController(OrderListGroups, {
      isNetConnected: true,
      onOrdersDeleted: orders.mockOnOrdersDeleted
    })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.orders.length).toBeGreaterThan(0))
    await act(async () => {
      await lastControllerProps.deleteOrders([101])
    })
    expect(orders.mockOrderDelete).toHaveBeenCalled()
    expect(orders.mockOnOrdersDeleted).toHaveBeenCalled()
  })

  it('filters orders across all statuses', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    act(() => {
      lastControllerProps.onFiltered({ id: '101' })
    })
    await waitFor(() => {
      expect(lastControllerProps.ordersFiltered.loading).toBe(false)
    })
  })

  it('loads messages for dashboard mode', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    await act(async () => {
      await lastControllerProps.loadMessages(101)
    })
    await waitFor(() => {
      expect(lastControllerProps.messages.messages).toHaveLength(1)
    })
  })

  it('submits customer review for orders', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.orders.length).toBeGreaterThan(0))
    const onClose = vi.fn()
    await act(async () => {
      await lastControllerProps.handleSendCustomerReview({
        customerId: 8,
        orderIds: [101],
        body: { rating: 5, comment: 'Nice' },
        onClose
      })
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/users/8/user_reviews',
      expect.objectContaining({ method: 'POST' })
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('loads more orders for active tab', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    await act(async () => {
      await lastControllerProps.loadMoreOrders()
    })
    expect(orders.mockOrdersGet).toHaveBeenCalled()
  })

  it('handles websocket order updates', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    const updateHandler = orders.mockSocket.on.mock.calls.find(([event]) => event === 'update_order')?.[1]
    const fullOrder = {
      ...orders.sampleOrder,
      status: 3,
      summary: { total: 25 },
      customer: { id: 8 },
      business: { id: 5 },
      paymethod: { id: 1 },
      payment_events: []
    }
    act(() => {
      updateHandler?.(fullOrder)
    })
    expect(orders.mockShowToast).toHaveBeenCalled()
  })

  it('registers new orders from websocket', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    const registerHandler = orders.mockSocket.on.mock.calls.find(([event]) => event === 'orders_register')?.[1]
    act(() => {
      registerHandler?.({ ...orders.sampleOrder, status: 0 })
    })
    expect(orders.mockEmit).toHaveBeenCalledWith('order_added', expect.objectContaining({ id: 101 }))
  })

  it('uses combined tabs and loads logistic orders', async () => {
    orders.mockConfigState.combine_pending_and_progress_orders.value = '1'
    renderController(OrderListGroups, { isNetConnected: true, combineTabs: true })
    await waitFor(() => {
      expect(lastControllerProps.currentTabSelected).toBe('active')
    })
    act(() => {
      lastControllerProps.setCurrentTabSelected('logisticOrders')
    })
    await waitFor(() => {
      expect(lastControllerProps.logisticOrders.loading).toBe(false)
    })
    expect(lastControllerProps.logisticOrders.orders).toHaveLength(1)
  })

  it('deletes multiple orders in one action', async () => {
    orders.mockConfigState.combine_pending_and_progress_orders.value = '1'
    renderController(OrderListGroups, { isNetConnected: true, combineTabs: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.active.fetched).toBe(true))
    await act(async () => {
      await lastControllerProps.deleteOrders([101, 102])
    })
    expect(orders.mockOrderDelete).toHaveBeenCalledTimes(2)
  })

  it('accepts a logistic assign request', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    act(() => {
      lastControllerProps.setCurrentTabSelected('logisticOrders')
    })
    await waitFor(() => expect(lastControllerProps.logisticOrders.orders).toHaveLength(1))
    let result
    await act(async () => {
      result = await lastControllerProps.handleClickLogisticOrder(1, 77)
    })
    expect(orders.mockShowToast).toHaveBeenCalled()
    expect(result).toMatchObject({ error: false, orderIds: [101], defaultEta: null })
  })

  it('saves the delivery time on the orders of an accepted assign request', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    let result
    await act(async () => {
      result = await lastControllerProps.handleUpdateLogisticOrdersEta([101], 25)
    })
    expect(orders.mockOrderSave).toHaveBeenCalledWith({ delivered_in: 25, id: 101 })
    expect(result).toHaveLength(1)
  })

  it('skips the delivery time save when there is no order or no time', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    await act(async () => {
      await lastControllerProps.handleUpdateLogisticOrdersEta([], 25)
      await lastControllerProps.handleUpdateLogisticOrdersEta([101], null)
    })
    expect(orders.mockOrderSave).not.toHaveBeenCalled()
  })

  it('filters by driver, paymethod, and date range', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    act(() => {
      lastControllerProps.onFiltered({
        driver: 4,
        paymethod: [6],
        business: 5,
        date: { from: '2026-01-01', to: '2026-01-31' }
      })
    })
    await waitFor(() => {
      expect(lastControllerProps.ordersFiltered.loading).toBe(false)
    })
    expect(orders.mockOrdersGet).toHaveBeenCalled()
  })

  it('rejects logistic assign requests', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    act(() => {
      lastControllerProps.setCurrentTabSelected('logisticOrders')
    })
    await waitFor(() => expect(lastControllerProps.logisticOrders.orders).toHaveLength(1))
    await act(async () => {
      await lastControllerProps.handleClickLogisticOrder(2, 77)
    })
    expect(orders.mockShowToast).toHaveBeenCalled()
  })

  it('handles logistic websocket assign events', async () => {
    orders.mockConfigState.logistic_module.value = '1'
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.fetched).toBe(true))
    const registerHandler = orders.mockSocket.on.mock.calls.find(([event]) => event === 'request_register')?.[1]
    const updateHandler = orders.mockSocket.on.mock.calls.find(([event]) => event === 'request_update')?.[1]
    const cancelHandler = orders.mockSocket.on.mock.calls.find(([event]) => event === 'request_cancel')?.[1]
    act(() => {
      registerHandler?.({ id: 88, status: 0, order: orders.sampleOrder })
      updateHandler?.({ id: 88, status: 1, order: { ...orders.sampleOrder, status: 3 } })
      cancelHandler?.({ id: 88 })
    })
    expect(orders.mockShowToast).toHaveBeenCalled()
  })

  it('syncs customer review events into order tabs', async () => {
    renderController(OrderListGroups, { isNetConnected: true })
    await waitFor(() => expect(lastControllerProps.ordersGroup.pending.orders.length).toBeGreaterThan(0))
    const reviewHandlers = orders.mockEventsOn.mock.calls.filter(([event]) => event === 'customer_reviewed')
    const reviewHandler = reviewHandlers[reviewHandlers.length - 1]?.[1]
    act(() => {
      reviewHandler?.({ order_id: 101, rating: 5 })
    })
    await waitFor(() => {
      const reviewed = lastControllerProps.ordersGroup.pending.orders.find((o) => o.id === 101)
      expect(reviewed?.user_review).toEqual(expect.objectContaining({ order_id: 101, rating: 5 }))
    })
  })
})
