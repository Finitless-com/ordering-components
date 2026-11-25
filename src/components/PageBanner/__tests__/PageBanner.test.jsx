import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const mockSocket = {
  getId: () => 'socket-1'
}

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [{
    appId: 'app',
    appInternalName: 'web',
    root: 'https://api.test'
  }]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => mockSocket
}))

const ctx = vi.hoisted(() => ({ configs: {}, orderState: { options: { type: 1 } } }))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{ configs: ctx.configs }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [ctx.orderState]
}))

import { PageBanner } from '../index'

describe('PageBanner', () => {
  it('loads banner and passes pageBannerState', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ error: false, result: [{ items: [{ id: 1 }] }] })
    })
    renderController(PageBanner, { position: 'app_home_page' })
    await waitFor(() => {
      expect(lastControllerProps.pageBannerState.loading).toBe(false)
    })
    expect(lastControllerProps.pageBannerState.banner?.items).toHaveLength(1)
  })

  describe('banner location for an order type without address', () => {
    const requestedUrl = () => decodeURIComponent(global.fetch.mock.calls[0][0])

    beforeEach(() => {
      ctx.configs = { unaddressed_order_types_allowed: { value: '5' } }
      ctx.orderState = { options: { type: 2 } }
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ error: false, result: [{ items: [{ id: 1 }] }] })
      })
    })

    it('sends no location when the type needs an address and the state has no extras', async () => {
      renderController(PageBanner, { position: 'web_business_listing' })
      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(requestedUrl()).toContain('location=undefined')
    })

    it('sends the default location when the order state lists the type as unaddressed', async () => {
      ctx.orderState = { options: { type: 2 }, extraUnaddressedOrderTypes: [2, 3, 4] }
      renderController(PageBanner, { position: 'web_business_listing' })
      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(requestedUrl()).toContain('"lat":40.7744146')
    })
  })
})
