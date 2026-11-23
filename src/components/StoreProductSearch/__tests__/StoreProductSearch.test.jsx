import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn()
}))

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false }, (key, fallback) => fallback || key]
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ token: 'owner-token' }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [{ get: mocks.get, post: mocks.post, put: mocks.put }]
}))

import { StoreProductSearch } from '../index'

const page = (products, extra = {}) => ({
  content: {
    error: false,
    result: products,
    pagination: { current_page: 1, page_size: 15, total_pages: 1, total: products.length, ...extra }
  }
})

const productsOf = (from, count, extra = {}) => Array.from({ length: count }, (_, i) => ({
  id: from + i, name: `P${from + i}`, category_id: 10, enabled: true, snooze_until: null, ...extra
}))

const listCalls = () => mocks.get.mock.calls.filter(([path]) => path === '/business/5/products')
const optionsOf = (call) => call[1]

describe('StoreProductSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockImplementation(async (path, options) => {
      if (options.query.page_size === 1) return page([], { total: 3 })
      return page(productsOf(1, 3))
    })
    mocks.post.mockResolvedValue({ content: { error: false, result: { id: 1, enabled: false } } })
    mocks.put.mockResolvedValue({ content: { error: false, result: 'OK' } })
  })

  const mount = async (props = {}) => {
    renderController(StoreProductSearch, { businessId: 5, searchDelay: 0, isIos: true, ...props })
    await waitFor(() => expect(lastControllerProps.productsState.loading).toBe(false))
    await waitFor(() => expect(lastControllerProps.unavailableState.loading).toBe(false))
  }

  it('lists the products of the whole business with the dashboard v2 request', async () => {
    await mount()
    const [path, options] = listCalls().find(call => optionsOf(call).query.page_size === 15)
    expect(path).toBe('/business/5/products')
    expect(options).toMatchObject({
      json: true,
      mode: 'dashboard',
      accessToken: 'owner-token',
      query: { version: 'v2', page: 1, page_size: 15 }
    })
    expect(options.attributes).toEqual(expect.arrayContaining(['id', 'name', 'enabled', 'snooze_until', 'category_id']))
    expect(options.conditions).toBeUndefined()
    expect(lastControllerProps.productsState.products.map(p => p.id)).toEqual([1, 2, 3])
    expect(lastControllerProps.productsState.pagination).toEqual({ currentPage: 1, pageSize: 15, totalItems: 3, totalPages: 1 })
  })

  it('counts the unavailable products with a page of one', async () => {
    await mount()
    const countCall = listCalls().find(call => optionsOf(call).query.page_size === 1)
    expect(optionsOf(countCall).attributes).toEqual(['id'])
    expect(optionsOf(countCall).conditions.conditions[0].conditions.map(c => c.attribute)).toEqual(['enabled', 'snooze_until'])
    expect(lastControllerProps.unavailableState).toEqual({ total: 3, loading: false, error: null })
  })

  it('searches with the text and restarts from the first page', async () => {
    await mount()
    mocks.get.mockClear()
    act(() => lastControllerProps.handleChangeSearch('piz'))
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(0))
    const call = listCalls()[0]
    expect(optionsOf(call).query.page).toBe(1)
    expect(optionsOf(call).conditions.conditions[0].conditions[0]).toEqual({ attribute: 'name', value: { condition: 'ilike', value: '%piz%' } })
  })

  it('asks only the unavailable products when the filter is on', async () => {
    await mount()
    mocks.get.mockClear()
    act(() => lastControllerProps.handleChangeUnavailableOnly(true))
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(0))
    const where = optionsOf(listCalls()[0]).conditions
    expect(where.conditions[0].conditions[0]).toEqual({ attribute: 'enabled', value: false })
    expect(where.conditions[0].conditions[1].value.condition).toBe('>')
  })

  it('debounces the search text by searchDelay', async () => {
    vi.useFakeTimers()
    try {
      renderController(StoreProductSearch, { businessId: 5, searchDelay: 300 })
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })
      const before = listCalls().filter(call => optionsOf(call).query.page_size === 15).length
      expect(before).toBe(1)
      act(() => lastControllerProps.handleChangeSearch('a'))
      act(() => lastControllerProps.handleChangeSearch('ab'))
      await act(async () => { await vi.advanceTimersByTimeAsync(299) })
      expect(listCalls().filter(call => optionsOf(call).query.page_size === 15).length).toBe(before)
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
      expect(listCalls().filter(call => optionsOf(call).query.page_size === 15).length).toBe(before + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('loads the next page and does not repeat a product', async () => {
    mocks.get.mockImplementation(async (path, options) => {
      if (options.query.page_size === 1) return page([], { total: 0 })
      if (options.query.page === 1) return page(productsOf(1, 3), { total_pages: 2, total: 5 })
      return page(productsOf(3, 3), { current_page: 2, total_pages: 2, total: 5 })
    })
    await mount()
    await act(async () => { await lastControllerProps.loadMoreProducts() })
    expect(lastControllerProps.productsState.products.map(p => p.id)).toEqual([1, 2, 3, 4, 5])
    expect(lastControllerProps.productsState.pagination.currentPage).toBe(2)
    mocks.get.mockClear()
    await act(async () => { await lastControllerProps.loadMoreProducts() })
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('ignores the answer of an older request', async () => {
    let resolveFirst
    mocks.get.mockImplementation((path, options) => {
      if (options.query.page_size === 1) return Promise.resolve(page([], { total: 0 }))
      if (!options.conditions) return new Promise(resolve => { resolveFirst = () => resolve(page(productsOf(100, 1))) })
      return Promise.resolve(page(productsOf(7, 1)))
    })
    renderController(StoreProductSearch, { businessId: 5, searchDelay: 0 })
    act(() => lastControllerProps.handleChangeSearch('x'))
    await waitFor(() => expect(lastControllerProps.productsState.products.map(p => p.id)).toEqual([7]))
    await act(async () => { resolveFirst() })
    expect(lastControllerProps.productsState.products.map(p => p.id)).toEqual([7])
  })

  it('shows the error of the API', async () => {
    mocks.get.mockResolvedValue({ content: { error: true, result: ['No permission'] } })
    renderController(StoreProductSearch, { businessId: 5, searchDelay: 0 })
    await waitFor(() => expect(lastControllerProps.productsState.error).toEqual(['No permission']))
    expect(lastControllerProps.productsState.loading).toBe(false)
  })

  it('does nothing without a business', async () => {
    renderController(StoreProductSearch, { searchDelay: 0 })
    await act(async () => {})
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('caps the page size at the API maximum', async () => {
    await mount({ pageSize: 200 })
    expect(listCalls().some(call => optionsOf(call).query.page_size === 50)).toBe(true)
  })

  describe('handleUpdateProduct', () => {
    it('turns a product off and keeps it in the list', async () => {
      await mount()
      mocks.post.mockResolvedValue({ content: { error: false, result: { id: 2, enabled: false, category_id: 10 } } })
      let updated
      await act(async () => { updated = await lastControllerProps.handleUpdateProduct(lastControllerProps.productsState.products[1], { enabled: false }) })
      expect(mocks.post).toHaveBeenCalledWith('/business/5/categories/10/products/2', { enabled: false }, { json: true, accessToken: 'owner-token' })
      expect(updated.enabled).toBe(false)
      expect(lastControllerProps.productsState.products.find(p => p.id === 2).enabled).toBe(false)
      expect(lastControllerProps.updatingProductIds).toEqual([])
    })

    it('passes snooze_until through', async () => {
      await mount()
      mocks.post.mockResolvedValue({ content: { error: false, result: { id: 1, snooze_until: '2999-01-01 10:00:00' } } })
      await act(async () => { await lastControllerProps.handleUpdateProduct(lastControllerProps.productsState.products[0], { snooze_until: '2999-01-01 10:00:00' }) })
      expect(mocks.post.mock.calls[0][1]).toEqual({ snooze_until: '2999-01-01 10:00:00' })
      expect(lastControllerProps.productsState.products[0].snooze_until).toBe('2999-01-01 10:00:00')
    })

    it('drops a product that became available from the unavailable list and recounts', async () => {
      mocks.get.mockImplementation(async (path, options) => {
        if (options.query.page_size === 1) return page([], { total: 2 })
        return page(productsOf(1, 2, { enabled: false }), { total: 2 })
      })
      await mount({ initialUnavailableOnly: true })
      mocks.post.mockResolvedValue({ content: { error: false, result: { id: 1, enabled: true, snooze_until: null } } })
      mocks.get.mockClear()
      await act(async () => { await lastControllerProps.handleUpdateProduct(lastControllerProps.productsState.products[0], { enabled: true, snooze_until: '' }) })
      expect(lastControllerProps.productsState.products.map(p => p.id)).toEqual([2])
      expect(lastControllerProps.productsState.pagination.totalItems).toBe(1)
      await waitFor(() => expect(mocks.get).toHaveBeenCalled())
    })

    it('keeps the list and reports the error when the API refuses', async () => {
      await mount()
      mocks.post.mockResolvedValue({ content: { error: true, result: ['Not allowed'] } })
      let updated
      await act(async () => { updated = await lastControllerProps.handleUpdateProduct(lastControllerProps.productsState.products[0], { enabled: false }) })
      expect(updated).toBeNull()
      expect(lastControllerProps.actionError).toEqual(['Not allowed'])
      expect(lastControllerProps.productsState.products[0].enabled).toBe(true)
      act(() => lastControllerProps.clearActionError())
      expect(lastControllerProps.actionError).toBeNull()
    })

    it('reports a thrown request', async () => {
      await mount()
      mocks.post.mockRejectedValue(new Error('offline'))
      await act(async () => { await lastControllerProps.handleUpdateProduct(lastControllerProps.productsState.products[0], { enabled: false }) })
      expect(lastControllerProps.actionError).toEqual(['offline'])
    })

    it('needs the product and its category', async () => {
      await mount()
      let updated
      await act(async () => { updated = await lastControllerProps.handleUpdateProduct({ id: 1 }, { enabled: false }) })
      expect(updated).toBeNull()
      expect(mocks.post).not.toHaveBeenCalled()
    })
  })

  describe('handleMakeAllAvailable', () => {
    const allUnavailable = (count) => async (path, options) => {
      if (options.query.page_size === 1) return page([], { total: count })
      const all = productsOf(1, count, { enabled: false })
      const size = options.query.page_size
      const start = (options.query.page - 1) * size
      return page(all.slice(start, start + size), {
        current_page: options.query.page, page_size: size, total: count, total_pages: Math.ceil(count / size)
      })
    }

    it('reads every page of the unavailable products and sends them in one bulk request', async () => {
      mocks.get.mockImplementation(allUnavailable(120))
      await mount({ initialUnavailableOnly: true })
      let summary
      await act(async () => { summary = await lastControllerProps.handleMakeAllAvailable() })
      expect(summary).toEqual({ total: 120, done: 120, failed: 0 })
      const readPages = listCalls().filter(call => optionsOf(call).query.page_size === 50)
      expect(readPages.map(call => optionsOf(call).query.page)).toEqual([1, 2, 3])
      expect(mocks.put).toHaveBeenCalledTimes(1)
      const [path, body, options] = mocks.put.mock.calls[0]
      expect(path).toBe('/bulks/products')
      expect(options).toEqual({ json: true, accessToken: 'owner-token' })
      expect(body.products).toHaveLength(120)
      expect(body.products[0]).toEqual({ id: 1, category_id: 10, business_id: 5, enabled: true, snooze_until: '' })
      expect(mocks.post).not.toHaveBeenCalled()
      expect(lastControllerProps.makeAvailableState).toEqual({ loading: false, total: 120, done: 120, failed: 0, error: null })
    })

    it('splits the bulk request in chunks of 500', async () => {
      mocks.get.mockImplementation(allUnavailable(501))
      await mount()
      await act(async () => { await lastControllerProps.handleMakeAllAvailable() })
      expect(mocks.put.mock.calls.map(call => call[1].products.length)).toEqual([500, 1])
    })

    it('only takes the products of the current search', async () => {
      mocks.get.mockImplementation(allUnavailable(2))
      await mount()
      act(() => lastControllerProps.handleChangeSearch('piz'))
      await waitFor(() => expect(lastControllerProps.productsState.loading).toBe(false))
      mocks.get.mockClear()
      await act(async () => { await lastControllerProps.handleMakeAllAvailable() })
      const where = optionsOf(listCalls().find(call => optionsOf(call).query.page_size === 50)).conditions
      expect(where.conditions).toHaveLength(2)
      expect(where.conditions[0].conditions[0].attribute).toBe('name')
    })

    it('falls back to one request per product when the bulk request is refused', async () => {
      mocks.get.mockImplementation(allUnavailable(3))
      mocks.put.mockResolvedValue({ content: { error: true, result: ['ERROR_BULK_PRODUCT_UPDATE'] } })
      mocks.post.mockResolvedValueOnce({ content: { error: false, result: {} } })
        .mockResolvedValueOnce({ content: { error: true, result: ['no'] } })
        .mockRejectedValueOnce(new Error('offline'))
      await mount()
      let summary
      await act(async () => { summary = await lastControllerProps.handleMakeAllAvailable() })
      expect(summary).toEqual({ total: 3, done: 1, failed: 2 })
      expect(mocks.post.mock.calls.map(call => call[0])).toEqual([
        '/business/5/categories/10/products/1',
        '/business/5/categories/10/products/2',
        '/business/5/categories/10/products/3'
      ])
      expect(mocks.post.mock.calls[0][1]).toEqual({ enabled: true, snooze_until: '' })
    })

    it('uses one request per product when useBulkUpdate is false', async () => {
      mocks.get.mockImplementation(allUnavailable(2))
      await mount({ useBulkUpdate: false })
      await act(async () => { await lastControllerProps.handleMakeAllAvailable() })
      expect(mocks.put).not.toHaveBeenCalled()
      expect(mocks.post).toHaveBeenCalledTimes(2)
    })

    it('reports a failed read and changes nothing', async () => {
      await mount()
      mocks.get.mockImplementation(async (path, options) => {
        if (options.query.page_size === 1) return page([], { total: 1 })
        if (options.query.page_size === 50) return { content: { error: true, result: ['denied'] } }
        return page(productsOf(1, 1))
      })
      let summary
      await act(async () => { summary = await lastControllerProps.handleMakeAllAvailable() })
      expect(lastControllerProps.makeAvailableState.error).toEqual(['denied'])
      expect(summary).toEqual({ total: 0, done: 0, failed: 0 })
      expect(mocks.put).not.toHaveBeenCalled()
      expect(mocks.post).not.toHaveBeenCalled()
    })

    it('reloads the list and the count afterwards', async () => {
      mocks.get.mockImplementation(allUnavailable(2))
      await mount()
      mocks.get.mockClear()
      await act(async () => { await lastControllerProps.handleMakeAllAvailable() })
      const sizes = listCalls().map(call => optionsOf(call).query.page_size)
      expect(sizes).toEqual(expect.arrayContaining([50, 15, 1]))
    })
  })
})
