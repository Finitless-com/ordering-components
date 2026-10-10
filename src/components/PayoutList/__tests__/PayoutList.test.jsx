import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const auth = vi.hoisted(() => {
  const mockOrdering = {
    appId: 'app',
    appInternalName: 'driver_app',
    root: 'https://api.test'
  }
  const mockSocket = {
    getId: () => 'socket-1'
  }
  const reset = () => {
    vi.clearAllMocks()
  }
  return { mockOrdering, mockSocket, reset }
})

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ user: { id: 6 }, token: 'tok' }, {}]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [auth.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => auth.mockSocket
}))

import { PayoutList } from '../index'

const payout = (id, status = 'paid') => ({
  id,
  order_id: 12000 + id,
  business_id: 41,
  currency: 'MXN',
  driver_amount: 14.65,
  driver_status: status,
  review_reason: null,
  created_at: '2026-10-09 17:36:05',
  business: { id: 41, name: 'Store' }
})

const page = (payouts, currentPage = 1, totalPages = 1) => ({
  json: async () => ({
    error: false,
    result: payouts,
    pagination: {
      total: payouts.length,
      current_page: currentPage,
      page_size: payouts.length ? 10 : 0,
      total_pages: totalPages
    }
  })
})

const whereOf = (url) => JSON.parse(new URL(url).searchParams.get('where'))

describe('PayoutList', () => {
  beforeEach(() => {
    auth.reset()
    global.fetch = vi.fn().mockResolvedValue(page([]))
  })

  it('loads the first page of payouts', async () => {
    global.fetch = vi.fn().mockResolvedValue(page([payout(3), payout(2)], 1, 4))
    renderController(PayoutList, {})
    await waitFor(() => {
      expect(lastControllerProps.payoutList.loading).toBe(false)
    })
    expect(lastControllerProps.payoutList.payouts.map(item => item.id)).toEqual([3, 2])
    expect(lastControllerProps.payoutList.error).toBeNull()
    expect(lastControllerProps.pagination).toEqual({ currentPage: 1, pageSize: 10, totalPages: 4, total: 2 })
    expect(lastControllerProps.statusSelected).toBeNull()
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('https://api.test/payouts?page=1&page_size=10')
    expect(options.method).toBe('GET')
    expect(options.headers.Authorization).toBe('Bearer tok')
    expect(options.headers['X-App-X']).toBe('app')
    expect(options.headers['X-INTERNAL-PRODUCT-X']).toBe('driver_app')
    expect(options.headers['X-Socket-Id-X']).toBe('socket-1')
  })

  it('keeps the page size asked for when the API answers an empty page', async () => {
    renderController(PayoutList, { paginationSettings: { pageSize: 25 } })
    await waitFor(() => {
      expect(lastControllerProps.payoutList.loading).toBe(false)
    })
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.test/payouts?page=1&page_size=25')
    expect(lastControllerProps.pagination.pageSize).toBe(25)
    expect(lastControllerProps.payoutList.payouts).toEqual([])
  })

  it('loads filtered by the default status', async () => {
    renderController(PayoutList, { defaultStatus: 'pending' })
    await waitFor(() => {
      expect(lastControllerProps.payoutList.loading).toBe(false)
    })
    expect(lastControllerProps.statusSelected).toBe('pending')
    expect(whereOf(global.fetch.mock.calls[0][0])).toEqual([{ attribute: 'driver_status', value: 'pending' }])
  })

  it('filters by the attribute given by statusAttribute', async () => {
    renderController(PayoutList, { defaultStatus: 'paid', statusAttribute: 'restaurant_status' })
    await waitFor(() => {
      expect(lastControllerProps.payoutList.loading).toBe(false)
    })
    expect(whereOf(global.fetch.mock.calls[0][0])).toEqual([{ attribute: 'restaurant_status', value: 'paid' }])
  })

  it('reloads from the first page when the status changes', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(page([payout(3), payout(2, 'pending')]))
      .mockResolvedValueOnce(page([payout(2, 'pending')]))
      .mockResolvedValueOnce(page([payout(3), payout(2, 'pending')]))
    renderController(PayoutList, {})
    await waitFor(() => {
      expect(lastControllerProps.payoutList.payouts).toHaveLength(2)
    })
    await act(async () => {
      lastControllerProps.handleChangeStatus('pending')
    })
    await waitFor(() => {
      expect(lastControllerProps.payoutList.loading).toBe(false)
    })
    expect(lastControllerProps.statusSelected).toBe('pending')
    expect(lastControllerProps.payoutList.payouts.map(item => item.id)).toEqual([2])
    const filtered = new URL(global.fetch.mock.calls[1][0])
    expect(filtered.searchParams.get('page')).toBe('1')
    expect(whereOf(global.fetch.mock.calls[1][0])).toEqual([{ attribute: 'driver_status', value: 'pending' }])

    await act(async () => {
      lastControllerProps.handleChangeStatus(null)
    })
    await waitFor(() => {
      expect(lastControllerProps.payoutList.payouts).toHaveLength(2)
    })
    expect(new URL(global.fetch.mock.calls[2][0]).searchParams.has('where')).toBe(false)
  })

  it('does not reload when the status selected is the same', async () => {
    renderController(PayoutList, { defaultStatus: 'paid' })
    await waitFor(() => {
      expect(lastControllerProps.payoutList.loading).toBe(false)
    })
    await act(async () => {
      lastControllerProps.handleChangeStatus('paid')
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('appends the next page and stops at the last one', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(page([payout(4), payout(3)], 1, 2))
      .mockResolvedValueOnce(page([payout(2), payout(1)], 2, 2))
    renderController(PayoutList, { defaultStatus: 'paid' })
    await waitFor(() => {
      expect(lastControllerProps.payoutList.payouts).toHaveLength(2)
    })
    await act(async () => {
      lastControllerProps.loadMorePayouts()
    })
    await waitFor(() => {
      expect(lastControllerProps.payoutList.payouts).toHaveLength(4)
    })
    expect(lastControllerProps.payoutList.payouts.map(item => item.id)).toEqual([4, 3, 2, 1])
    expect(lastControllerProps.pagination.currentPage).toBe(2)
    const next = new URL(global.fetch.mock.calls[1][0])
    expect(next.searchParams.get('page')).toBe('2')
    expect(whereOf(global.fetch.mock.calls[1][0])).toEqual([{ attribute: 'driver_status', value: 'paid' }])

    await act(async () => {
      lastControllerProps.loadMorePayouts()
    })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('refreshes from the first page', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(page([payout(2)]))
      .mockResolvedValueOnce(page([payout(3), payout(2)]))
    renderController(PayoutList, {})
    await waitFor(() => {
      expect(lastControllerProps.payoutList.payouts).toHaveLength(1)
    })
    await act(async () => {
      lastControllerProps.handleRefreshPayouts()
    })
    await waitFor(() => {
      expect(lastControllerProps.payoutList.payouts).toHaveLength(2)
    })
    expect(new URL(global.fetch.mock.calls[1][0]).searchParams.get('page')).toBe('1')
  })

  it('sets the error the API answers with', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ error: true, result: ['ERROR_AUTH'] })
    })
    renderController(PayoutList, {})
    await waitFor(() => {
      expect(lastControllerProps.payoutList.loading).toBe(false)
    })
    expect(lastControllerProps.payoutList.error).toEqual(['ERROR_AUTH'])
    expect(lastControllerProps.payoutList.payouts).toEqual([])
  })

  it('keeps the payouts loaded when the next page fails', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(page([payout(4), payout(3)], 1, 2))
      .mockRejectedValueOnce(new Error('Network request failed'))
    renderController(PayoutList, {})
    await waitFor(() => {
      expect(lastControllerProps.payoutList.payouts).toHaveLength(2)
    })
    await act(async () => {
      lastControllerProps.loadMorePayouts()
    })
    await waitFor(() => {
      expect(lastControllerProps.payoutList.error).toEqual(['Network request failed'])
    })
    expect(lastControllerProps.payoutList.loading).toBe(false)
    expect(lastControllerProps.payoutList.payouts).toHaveLength(2)
    expect(lastControllerProps.pagination.currentPage).toBe(1)
  })

  it('ignores the answer of a previous status that arrives late', async () => {
    let answerAll
    global.fetch = vi.fn()
      .mockReturnValueOnce(new Promise(resolve => { answerAll = resolve }))
      .mockResolvedValueOnce(page([payout(2, 'pending')]))
    renderController(PayoutList, {})
    await act(async () => {
      lastControllerProps.handleChangeStatus('pending')
    })
    await waitFor(() => {
      expect(lastControllerProps.payoutList.payouts).toHaveLength(1)
    })
    await act(async () => {
      answerAll(page([payout(3), payout(2, 'pending'), payout(1)]))
    })
    expect(lastControllerProps.payoutList.payouts.map(item => item.id)).toEqual([2])
    expect(lastControllerProps.payoutList.loading).toBe(false)
  })
})
