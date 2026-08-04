import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../../__tests__/helpers/renderController'

const d1 = vi.hoisted(() => {
  const { createDashboardOrdersTestContext } = require('../../../../__tests__/helpers/dashboardOrdersTestHelpers')
  return createDashboardOrdersTestContext(vi)
})

const mockParsePrice = vi.hoisted(() => vi.fn(price => `SRD ${price.toFixed(2)}`))

vi.mock('../../../../contexts/EventContext', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useEvent: () => [{ emit: d1.mockEmit, on: d1.mockEventsOn, off: d1.mockEventsOff }]
  }
})

vi.mock('../../../../contexts/SessionContext', () => ({
  useSession: () => [d1.mockSessionState, { changeUser: vi.fn() }]
}))

vi.mock('../../../../contexts/ApiContext', () => ({
  useApi: () => [d1.mockOrdering]
}))

vi.mock('../../../../contexts/UtilsContext', () => ({
  useUtils: () => [{ parsePrice: mockParsePrice }]
}))

import { OrderDetails } from '../index'

describe('OrderDetails', () => {
  beforeEach(() => d1.reset())

  it('uses order prop and formats price', () => {
    renderController(OrderDetails, {
      order: d1.sampleOrder,
      orderId: 101,
      isDisableLoadMessages: true
    })
    expect(lastControllerProps.order.order).toEqual(d1.sampleOrder)
    expect(lastControllerProps.formatPrice(12.5)).toBe('SRD 12.50')
    expect(mockParsePrice).toHaveBeenCalledWith(12.5)
  })

  it('updates order status via API', async () => {
    renderController(OrderDetails, {
      order: d1.sampleOrder,
      orderId: 101,
      isDisableLoadMessages: true
    })
    await act(async () => {
      await lastControllerProps.handleUpdateOrderStatus({ id: 101, newStatus: 1 })
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/orders/101',
      expect.objectContaining({ method: 'PUT' })
    )
  })

  it('loads messages when enabled', async () => {
    renderController(OrderDetails, { orderId: 101 })
    await waitFor(() => {
      expect(lastControllerProps.messages.loading).toBe(false)
    })
    expect(lastControllerProps.messages.messages).toHaveLength(1)
  })

  it('handles customer_reviewed event', () => {
    renderController(OrderDetails, {
      order: d1.sampleOrder,
      orderId: 101,
      isDisableLoadMessages: true
    })
    const reviewHandler = d1.mockEventsOn.mock.calls.find(([e]) => e === 'customer_reviewed')?.[1]
    act(() => {
      reviewHandler({ order_id: 101, qualification: 5 })
    })
    expect(lastControllerProps.order.order.user_review).toEqual({ order_id: 101, qualification: 5 })
  })

  it('sends parking spot message', async () => {
    renderController(OrderDetails, {
      order: d1.sampleOrder,
      orderId: 101,
      isDisableLoadMessages: true
    })
    await act(async () => {
      await lastControllerProps.handlerSubmit({ spot: 12 })
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/orders/101/messages',
      expect.objectContaining({ method: 'post' })
    )
  })
})
