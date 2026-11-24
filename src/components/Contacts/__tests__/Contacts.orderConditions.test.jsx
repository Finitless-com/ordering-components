import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

const mockOrdering = {
  orders: vi.fn(() => ({
    parameters: vi.fn().mockReturnThis(),
    asDashboard: vi.fn().mockReturnThis(),
    get: mocks.get
  }))
}

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [mockOrdering]
}))

import { Contacts } from '../index'

const hasDirectMessages = [
  { attribute: 'last_direct_message_at', value: { condition: '!=', value: null } }
]

const response = (result, pagination) => ({ content: { result, error: false, pagination } })

describe('Contacts orderConditions', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mockOrdering.orders.mockClear()
  })

  it('without orderConditions the orders request is exactly the one it always was', async () => {
    mocks.get.mockResolvedValue(response([{ id: 1 }], { current_page: 1, page_size: 6, total_pages: 2, total: 8 }))
    renderController(Contacts, { firstFetch: 'orders' })
    await waitFor(() => expect(lastControllerProps.orders.loading).toBe(false))

    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get).toHaveBeenCalledWith({ query: { page: 1, page_size: 6 } })
    expect(mocks.get.mock.calls[0][0].query).not.toHaveProperty('where')

    mocks.get.mockResolvedValue(response([{ id: 2 }], { current_page: 2, page_size: 6, total_pages: 2, total: 8 }))
    await act(async () => { await lastControllerProps.loadMore() })
    expect(mocks.get).toHaveBeenLastCalledWith({ query: { page: 2, page_size: 6 } })
  })

  it('an empty orderConditions behaves like not passing it', async () => {
    mocks.get.mockResolvedValue(response([], { current_page: 1, page_size: 6, total_pages: 0, total: 0 }))
    renderController(Contacts, { firstFetch: 'orders', orderConditions: [] })
    await waitFor(() => expect(lastControllerProps.orders.loading).toBe(false))

    expect(mocks.get).toHaveBeenCalledWith({ query: { page: 1, page_size: 6 } })
  })

  it('sends orderConditions as where on the first page and on load more', async () => {
    mocks.get.mockResolvedValue(response([{ id: 1 }], { current_page: 1, page_size: 6, total_pages: 2, total: 8 }))
    renderController(Contacts, { firstFetch: 'orders', orderConditions: hasDirectMessages })
    await waitFor(() => expect(lastControllerProps.orders.loading).toBe(false))

    const where = { conditions: hasDirectMessages, conector: 'AND' }
    expect(mocks.get).toHaveBeenCalledWith({ query: { page: 1, page_size: 6, where } })

    mocks.get.mockResolvedValue(response([{ id: 2 }], { current_page: 2, page_size: 6, total_pages: 2, total: 8 }))
    await act(async () => { await lastControllerProps.loadMore() })
    await waitFor(() => expect(lastControllerProps.orders.data).toHaveLength(2))
    expect(mocks.get).toHaveBeenLastCalledWith({ query: { page: 2, page_size: 6, where } })
  })

  it('sends orderConditions again on a refetch with getOrders and uses conditionsConector', async () => {
    mocks.get.mockResolvedValue(response([], { current_page: 1, page_size: 6, total_pages: 0, total: 0 }))
    renderController(Contacts, { firstFetch: 'orders', orderConditions: hasDirectMessages, conditionsConector: 'OR' })
    await waitFor(() => expect(lastControllerProps.orders.loading).toBe(false))

    await act(async () => { await lastControllerProps.getOrders() })
    expect(mocks.get).toHaveBeenCalledTimes(2)
    mocks.get.mock.calls.forEach(([options]) => {
      expect(options.query.where).toEqual({ conditions: hasDirectMessages, conector: 'OR' })
    })
  })

  it('takes the pagination and the data from the filtered response', async () => {
    mocks.get.mockResolvedValue(response([{ id: 5 }, { id: 9 }], { current_page: 1, page_size: 6, total_pages: 1, total: 2, from: 1, to: 2 }))
    renderController(Contacts, { firstFetch: 'orders', orderConditions: hasDirectMessages })
    await waitFor(() => expect(lastControllerProps.orders.loading).toBe(false))

    expect(lastControllerProps.orders.data.map((o) => o.id)).toEqual([5, 9])
    expect(lastControllerProps.pagination).toMatchObject({ currentPage: 1, pageSize: 6, totalPages: 1, total: 2, from: 1, to: 2 })
  })
})
