import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps, ControllerUI } from '../../../__tests__/helpers/renderController'
import { EventProvider } from '../../../contexts/EventContext'

const mocks = vi.hoisted(() => ({
  mockProductGet: vi.fn(),
  mockParameters: vi.fn(),
  mockProducts: vi.fn(),
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockShowToast: vi.fn()
}))

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false }, (key, fallback) => fallback || key]
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => [[], { showToast: mocks.mockShowToast }],
  ToastType: { Error: 'ERROR', Success: 'SUCCESS', Info: 'INFO' }
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ token: 'owner-token' }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [{
    businesses: () => ({
      categories: () => ({
        products: (productId) => {
          mocks.mockProducts(productId)
          return {
            parameters: (params) => {
              mocks.mockParameters(params)
              return { get: (options) => mocks.mockProductGet(productId, options) }
            }
          }
        }
      })
    }),
    get: mocks.mockGet,
    post: mocks.mockPost
  }]
}))

import { StoreProductOptions } from '../index'

const buildProduct = (id = 1981) => ({
  id,
  name: `Product ${id}`,
  extras: [
    { id: 397, name: 'Size', rank: 2, enabled: true, options: [{ id: 430, name: 'Size', rank: 1 }] },
    { id: 166, name: 'Extras', rank: 1, enabled: true, options: [{ id: 166, name: 'Extra 1', rank: 1 }] }
  ]
})

const extraOptions = {
  166: [
    { id: 6964, name: 'Extra 3', rank: 2, enabled: false, suboptions: [] },
    {
      id: 166,
      name: 'Extra 1',
      rank: 1,
      enabled: true,
      suboptions: [
        { id: 468, name: 'Berries', rank: 2, enabled: false },
        { id: 232, name: 'Cream', rank: 1, enabled: true }
      ]
    }
  ],
  397: [{ id: 430, name: 'Size', rank: 1, enabled: true, suboptions: [{ id: 562, name: 'Tall', rank: 1, enabled: true }] }]
}

const defaultProps = { businessId: 100, categoryId: 232, productId: 1981 }

const Wrapper = ({ children }) => <EventProvider>{children}</EventProvider>

const deferred = () => {
  let resolve
  const promise = new Promise((_resolve) => { resolve = _resolve })
  return { promise, resolve }
}

const extraIdFromPath = (path) => Number(path.match(/extras\/(\d+)\/options/)[1])

const renderLoaded = async (options) => {
  const result = renderController(StoreProductOptions, defaultProps, options)
  await waitFor(() => expect(lastControllerProps.productState.loading).toBe(false))
  return result
}

const loadExtra = async (extraId) => {
  await act(async () => { await lastControllerProps.handleLoadExtraOptions(extraId) })
}

describe('StoreProductOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockProductGet.mockImplementation((productId) => Promise.resolve({
      content: { error: false, result: buildProduct(productId) }
    }))
    mocks.mockGet.mockImplementation((path) => Promise.resolve({
      content: { error: false, result: extraOptions[extraIdFromPath(path)] }
    }))
  })

  it('loads the selected product with version v2 and exposes only its groups sorted by rank', async () => {
    renderController(StoreProductOptions, defaultProps)
    expect(lastControllerProps.productState.loading).toBe(true)
    await waitFor(() => expect(lastControllerProps.productState.loading).toBe(false))
    expect(mocks.mockProducts).toHaveBeenCalledWith(1981)
    expect(mocks.mockParameters).toHaveBeenCalledWith({ version: 'v2' })
    expect(mocks.mockProductGet.mock.calls[0][1]).toMatchObject({ accessToken: 'owner-token' })
    const { extras, product } = lastControllerProps.productState
    expect(extras.map(extra => extra.id)).toEqual([166, 397])
    expect(extras[0]).not.toHaveProperty('options')
    expect(product).not.toHaveProperty('extras')
    expect(lastControllerProps.extraOptionsState).toEqual({})
  })

  it('does not request options until a group is loaded', async () => {
    await renderLoaded()
    expect(mocks.mockGet).not.toHaveBeenCalled()
  })

  it('loads the options of one group with the dashboard mode, sorted and including disabled ones', async () => {
    await renderLoaded()
    await loadExtra(166)
    expect(mocks.mockGet).toHaveBeenCalledTimes(1)
    expect(mocks.mockGet).toHaveBeenCalledWith(
      '/business/100/extras/166/options',
      { json: true, mode: 'dashboard', accessToken: 'owner-token' }
    )
    const state = lastControllerProps.extraOptionsState[166]
    expect(state).toMatchObject({ loading: false, error: null, loaded: true })
    expect(state.options.map(option => option.id)).toEqual([166, 6964])
    expect(state.options[0].suboptions.map(suboption => suboption.id)).toEqual([232, 468])
    expect(state.options[1].enabled).toBe(false)
    expect(state.options[0].suboptions[1].enabled).toBe(false)
    expect(lastControllerProps.extraOptionsState[397]).toBeUndefined()
  })

  it('exposes the loading state of a group and does not repeat a loaded group', async () => {
    const pending = deferred()
    mocks.mockGet.mockReturnValueOnce(pending.promise)
    await renderLoaded()
    let call
    act(() => { call = lastControllerProps.handleLoadExtraOptions(166) })
    await waitFor(() => expect(lastControllerProps.extraOptionsState[166].loading).toBe(true))
    act(() => { lastControllerProps.handleLoadExtraOptions(166) })
    expect(mocks.mockGet).toHaveBeenCalledTimes(1)
    await act(async () => {
      pending.resolve({ content: { error: false, result: extraOptions[166] } })
      await call
    })
    await loadExtra(166)
    expect(mocks.mockGet).toHaveBeenCalledTimes(1)
    await act(async () => { await lastControllerProps.handleLoadExtraOptions(166, true) })
    expect(mocks.mockGet).toHaveBeenCalledTimes(2)
  })

  it('exposes a group error and allows retrying it', async () => {
    mocks.mockGet.mockResolvedValueOnce({ content: { error: true, result: ['Permission denied'] } })
    await renderLoaded()
    await loadExtra(166)
    expect(lastControllerProps.extraOptionsState[166]).toMatchObject({ loading: false, error: ['Permission denied'], loaded: false })
    await loadExtra(166)
    expect(mocks.mockGet).toHaveBeenCalledTimes(2)
    expect(lastControllerProps.extraOptionsState[166]).toMatchObject({ error: null, loaded: true })
  })

  it('handles network failures while loading a group', async () => {
    mocks.mockGet.mockRejectedValueOnce(new Error('Network Error'))
    await renderLoaded()
    await loadExtra(166)
    expect(lastControllerProps.extraOptionsState[166].error).toEqual(['Network Error'])
  })

  it('exposes a product error and reloads on demand clearing loaded groups', async () => {
    mocks.mockProductGet.mockResolvedValueOnce({ content: { error: true, result: ['Permission denied'] } })
    renderController(StoreProductOptions, defaultProps)
    await waitFor(() => expect(lastControllerProps.productState.error).toEqual(['Permission denied']))
    expect(lastControllerProps.productState.extras).toEqual([])
    await act(async () => { await lastControllerProps.handleReload() })
    expect(lastControllerProps.productState.error).toBeNull()
    expect(lastControllerProps.productState.extras).toHaveLength(2)
    await loadExtra(166)
    await act(async () => { await lastControllerProps.handleReload() })
    expect(lastControllerProps.extraOptionsState).toEqual({})
    await loadExtra(166)
    expect(mocks.mockGet).toHaveBeenCalledTimes(2)
  })

  it('handles network failures while loading the product', async () => {
    mocks.mockProductGet.mockRejectedValueOnce(new Error('Network Error'))
    renderController(StoreProductOptions, defaultProps)
    await waitFor(() => expect(lastControllerProps.productState.error).toEqual(['Network Error']))
  })

  it('updates an option through the dashboard endpoint and applies the confirmed state', async () => {
    mocks.mockPost.mockResolvedValue({ content: { error: false, result: { id: 6964, enabled: true, extra_id: '166' } } })
    await renderLoaded()
    await loadExtra(166)
    await act(async () => { await lastControllerProps.handleUpdateOption(166, 6964, true) })
    expect(mocks.mockPost).toHaveBeenCalledWith(
      '/business/100/extras/166/options/6964',
      { enabled: true },
      { json: true, accessToken: 'owner-token' }
    )
    const option = lastControllerProps.extraOptionsState[166].options.find(option => option.id === 6964)
    expect(option.enabled).toBe(true)
    expect(option.suboptions).toEqual([])
    expect(mocks.mockShowToast).toHaveBeenCalledWith('SUCCESS', 'Enabled option')
    expect(lastControllerProps.updatingState.options).toEqual([])
  })

  it('updates a suboption through the dashboard endpoint', async () => {
    mocks.mockPost.mockResolvedValue({ content: { error: false, result: { id: 232, enabled: false } } })
    await renderLoaded()
    await loadExtra(166)
    await act(async () => { await lastControllerProps.handleUpdateSuboption(166, 166, 232, false) })
    expect(mocks.mockPost).toHaveBeenCalledWith(
      '/business/100/extras/166/options/166/suboptions/232',
      { enabled: false },
      { json: true, accessToken: 'owner-token' }
    )
    const suboption = lastControllerProps.extraOptionsState[166].options[0].suboptions.find(suboption => suboption.id === 232)
    expect(suboption.enabled).toBe(false)
    expect(mocks.mockShowToast).toHaveBeenCalledWith('SUCCESS', 'Disabled suboption')
  })

  it('keeps the previous state and reports the error when saving fails', async () => {
    mocks.mockPost.mockResolvedValue({ content: { error: true, result: ['Permission denied'] } })
    await renderLoaded()
    await loadExtra(166)
    await act(async () => { await lastControllerProps.handleUpdateSuboption(166, 166, 468, true) })
    const suboption = lastControllerProps.extraOptionsState[166].options[0].suboptions.find(suboption => suboption.id === 468)
    expect(suboption.enabled).toBe(false)
    expect(mocks.mockShowToast).toHaveBeenCalledWith('ERROR', 'Permission denied')
    expect(mocks.mockShowToast).not.toHaveBeenCalledWith('SUCCESS', expect.anything())
  })

  it('keeps the previous state when the save request throws', async () => {
    mocks.mockPost.mockRejectedValue(new Error('Network Error'))
    await renderLoaded()
    await loadExtra(166)
    await act(async () => { await lastControllerProps.handleUpdateOption(166, 166, false) })
    expect(lastControllerProps.extraOptionsState[166].options[0].enabled).toBe(true)
    expect(mocks.mockShowToast).toHaveBeenCalledWith('ERROR', 'Network Error')
  })

  it('marks the entity as updating and ignores repeated toggles while saving', async () => {
    const pending = deferred()
    mocks.mockPost.mockReturnValue(pending.promise)
    await renderLoaded()
    await loadExtra(166)
    let firstCall
    act(() => { firstCall = lastControllerProps.handleUpdateOption(166, 166, false) })
    await waitFor(() => expect(lastControllerProps.updatingState.options).toEqual([166]))
    act(() => { lastControllerProps.handleUpdateOption(166, 166, false) })
    expect(mocks.mockPost).toHaveBeenCalledTimes(1)
    await act(async () => {
      pending.resolve({ content: { error: false, result: { id: 166, enabled: false } } })
      await firstCall
    })
    expect(lastControllerProps.updatingState.options).toEqual([])
    expect(lastControllerProps.extraOptionsState[166].options[0].enabled).toBe(false)
  })

  it('ignores a late product response after switching products', async () => {
    const slow = deferred()
    mocks.mockProductGet.mockImplementation((productId) => productId === 1981
      ? slow.promise
      : Promise.resolve({ content: { error: false, result: buildProduct(productId) } }))
    const { rerender } = renderController(StoreProductOptions, defaultProps, { wrapper: Wrapper })
    rerender(<Wrapper><StoreProductOptions UIComponent={ControllerUI} {...defaultProps} productId={2000} /></Wrapper>)
    await waitFor(() => expect(lastControllerProps.productState.product?.id).toBe(2000))
    await act(async () => { slow.resolve({ content: { error: false, result: buildProduct(1981) } }) })
    expect(lastControllerProps.productState.product.id).toBe(2000)
  })

  it('ignores a late group response after switching products', async () => {
    const slow = deferred()
    mocks.mockGet.mockReturnValueOnce(slow.promise)
    const { rerender } = await renderLoaded({ wrapper: Wrapper })
    let call
    act(() => { call = lastControllerProps.handleLoadExtraOptions(166) })
    rerender(<Wrapper><StoreProductOptions UIComponent={ControllerUI} {...defaultProps} productId={2000} /></Wrapper>)
    await waitFor(() => expect(lastControllerProps.productState.product?.id).toBe(2000))
    await act(async () => {
      slow.resolve({ content: { error: false, result: extraOptions[166] } })
      await call
    })
    expect(lastControllerProps.extraOptionsState).toEqual({})
  })

  it('does not apply a save result to a different product', async () => {
    const pending = deferred()
    mocks.mockPost.mockReturnValue(pending.promise)
    const { rerender } = await renderLoaded({ wrapper: Wrapper })
    await loadExtra(166)
    let saveCall
    act(() => { saveCall = lastControllerProps.handleUpdateOption(166, 166, false) })
    rerender(<Wrapper><StoreProductOptions UIComponent={ControllerUI} {...defaultProps} productId={2000} /></Wrapper>)
    await waitFor(() => expect(lastControllerProps.productState.product?.id).toBe(2000))
    await loadExtra(166)
    await act(async () => {
      pending.resolve({ content: { error: false, result: { id: 166, enabled: false } } })
      await saveCall
    })
    expect(lastControllerProps.extraOptionsState[166].options[0].enabled).toBe(true)
    expect(mocks.mockShowToast).not.toHaveBeenCalled()
  })

  it('shows an error instead of loading forever when an id is missing, also on reload', async () => {
    renderController(StoreProductOptions, { businessId: 100, categoryId: 232 })
    await waitFor(() => expect(lastControllerProps.productState.loading).toBe(false))
    expect(lastControllerProps.productState.error).toEqual(['Error'])
    await act(async () => { await lastControllerProps.handleReload() })
    expect(lastControllerProps.productState).toMatchObject({ loading: false, error: ['Error'] })
    expect(mocks.mockProductGet).not.toHaveBeenCalled()
    expect(mocks.mockGet).not.toHaveBeenCalled()
  })
})
