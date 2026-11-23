import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const biz = vi.hoisted(() => {
  const h = require('../../../__tests__/helpers/businessDiscoveryTestHelpers')
  const api = h.createBusinessApiMocks(vi)
  const mockShowToast = vi.fn()
  const mockSocket = h.createBusinessMockSocket(vi)
  const reset = () => {
    vi.clearAllMocks()
    h.applyDefaultBusinessMockImplementations(vi, api)
    h.setupFetchMock(vi)
  }
  return {
    ...api,
    mockOrdering: h.buildBusinessMockOrdering(vi, api),
    mockSocket,
    mockShowToast,
    reset,
    sampleBusiness: h.sampleBusiness
  }
})

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ language: { code: 'en' } }, (key, fallback) => fallback || key]
}))

const sessionMock = vi.hoisted(() => ({ token: 'session-tok' }))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    user: { id: 8 },
    token: sessionMock.token
  }, { refreshUserInfo: vi.fn() }]
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => [[], { showToast: biz.mockShowToast }],
  ToastType: { error: 'error', success: 'success' }
}))

vi.mock('../../../contexts/UtilsContext', () => ({
  useUtils: () => [{ parsePrice: (val) => `$${val}` }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [biz.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => biz.mockSocket
}))

import { BusinessController } from '../index'

describe('BusinessController', () => {
  beforeEach(() => {
    biz.reset()
    sessionMock.token = 'session-tok'
  })

  it('exposes formatting helpers', () => {
    renderController(BusinessController, { business: biz.sampleBusiness, isDisabledInterval: true })
    expect(lastControllerProps.formatDate({ hour: 9, minute: 5 })).toBe('09:05')
    expect(lastControllerProps.formatDate(null)).toBe('none')
    expect(lastControllerProps.formatNumber(3.14159)).toBe(3.14)
  })

  it('returns best offer values', () => {
    renderController(BusinessController, { business: biz.sampleBusiness, isDisabledInterval: true })
    expect(lastControllerProps.getBusinessOffer(biz.sampleBusiness.offers)).toBe('10%')
    expect(lastControllerProps.getBusinessMaxOffer(biz.sampleBusiness.offers).rate).toBe(10)
    expect(lastControllerProps.getBusinessOffer([])).toBe(null)
  })

  it('handles click with tracking event', async () => {
    const onBusinessClick = vi.fn()
    renderController(BusinessController, {
      business: biz.sampleBusiness,
      isDisabledInterval: true,
      onBusinessClick
    })
    lastControllerProps.handleClick()
    expect(onBusinessClick).toHaveBeenCalledWith(biz.sampleBusiness)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test/tracking_events',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('does not call tracking_events when there is no token', async () => {
    sessionMock.token = null
    const onBusinessClick = vi.fn()
    renderController(BusinessController, {
      business: biz.sampleBusiness,
      isDisabledInterval: true,
      onBusinessClick
    })
    lastControllerProps.handleClick()
    expect(onBusinessClick).toHaveBeenCalledWith(biz.sampleBusiness)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(global.fetch).not.toHaveBeenCalledWith(
      'https://api.test/tracking_events',
      expect.anything()
    )
  })

  it('adds business to favorites', async () => {
    const handleUpdateBusinessList = vi.fn()
    renderController(BusinessController, {
      business: biz.sampleBusiness,
      isDisabledInterval: true,
      handleUpdateBusinessList,
      favoriteIds: [],
      setFavoriteIds: vi.fn()
    })
    await lastControllerProps.handleFavoriteBusiness(true)
    await waitFor(() => {
      expect(biz.mockShowToast).toHaveBeenCalled()
    })
    expect(handleUpdateBusinessList).toHaveBeenCalledWith(5, { favorite: true })
    expect(lastControllerProps.business.favorite).toBe(true)
  })

  it('loads business by id when prop is missing', async () => {
    renderController(BusinessController, { businessId: 3, isDisabledInterval: true })
    await waitFor(() => {
      expect(lastControllerProps.businessState.loading).toBe(false)
    })
    expect(biz.mockBusinessGet).toHaveBeenCalled()
    expect(lastControllerProps.business.name).toBe('Loaded Store')
  })

  it('removes business from favorites', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ error: false, result: {} })
    })
    const handleUpdateBusinessList = vi.fn()
    renderController(BusinessController, {
      business: { ...biz.sampleBusiness, favorite: true },
      isDisabledInterval: true,
      handleUpdateBusinessList
    })
    await lastControllerProps.handleFavoriteBusiness(false)
    await waitFor(() => {
      expect(lastControllerProps.business.favorite).toBe(false)
    })
    expect(handleUpdateBusinessList).toHaveBeenCalledWith(5, { favorite: false })
  })

  it('shows toast when favorite API returns an error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ error: true, result: 'ERROR_ADDING_FAVORITE' })
    })
    renderController(BusinessController, { business: biz.sampleBusiness, isDisabledInterval: true })
    await lastControllerProps.handleFavoriteBusiness(true)
    await waitFor(() => {
      expect(biz.mockShowToast).toHaveBeenCalled()
    })
  })

  it('updates business through SDK', async () => {
    renderController(BusinessController, { business: biz.sampleBusiness, isDisabledInterval: true })
    await lastControllerProps.updateBusiness(5, { name: 'Updated Store' })
    await waitFor(() => {
      expect(lastControllerProps.businessState.loading).toBe(false)
    })
    expect(biz.mockBusinessSave).toHaveBeenCalled()
    expect(lastControllerProps.business.name).toBe('Updated Store')
  })

  it('passes snooze_until through to the business update', async () => {
    renderController(BusinessController, { business: biz.sampleBusiness, isDisabledInterval: true })
    biz.mockBusinessSave.mockClear()
    await lastControllerProps.updateBusiness(5, { snooze_until: '2999-01-01 10:00:00' })
    await waitFor(() => expect(lastControllerProps.businessState.loading).toBe(false))
    expect(biz.mockBusinessSave).toHaveBeenCalledWith({ snooze_until: '2999-01-01 10:00:00' })
  })

  it('marks business favorite when favoriteIds includes its id', async () => {
    renderController(BusinessController, {
      business: biz.sampleBusiness,
      isDisabledInterval: true,
      favoriteIds: [5]
    })
    await waitFor(() => {
      expect(lastControllerProps.business.favorite).toBe(true)
    })
  })
})
