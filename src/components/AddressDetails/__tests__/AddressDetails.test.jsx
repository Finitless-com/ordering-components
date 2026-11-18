import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { EventProvider } from '../../../contexts/EventContext'
import { renderController, lastControllerProps, ControllerUI } from '../../../__tests__/helpers/renderController'

const addr = vi.hoisted(() => {
  const {
    createAddressApiMocks,
    applyDefaultAddressMockImplementations,
    buildMockOrdering,
    defaultAddressConfigs
  } = require('../../../__tests__/helpers/addressPhoneTestHelpers')
  const api = createAddressApiMocks(vi)
  const mockOrdering = buildMockOrdering(vi, api)
  const orderState = { options: { type: 1 }, carts: {} }
  const reset = () => {
    vi.clearAllMocks()
    applyDefaultAddressMockImplementations(vi, api)
    orderState.options = { type: 1 }
    orderState.carts = {}
  }
  return { ...api, mockOrdering, orderState, reset, defaultAddressConfigs }
})

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [addr.orderState]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [addr.mockOrdering]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{ configs: addr.defaultAddressConfigs }]
}))

// eslint-disable-next-line import/first
import { AddressDetails } from '../index'

describe('AddressDetails', () => {
  beforeEach(() => addr.reset())

  it('builds static map url from business location', async () => {
    renderController(AddressDetails, { businessId: 4 })
    await waitFor(() => {
      expect(lastControllerProps.googleMapsUrl).toContain('maps.googleapis.com')
    })
    expect(addr.mockBusinessGet).toHaveBeenCalled()
  })

  it('uses provided location without fetching business', () => {
    renderController(AddressDetails, {
      businessId: 4,
      location: { lat: 10, lng: 20 },
      businessLogo: 'biz.png'
    })
    expect(lastControllerProps.googleMapsUrl).toContain('maps.googleapis.com')
    expect(addr.mockBusinessGet).not.toHaveBeenCalled()
  })

  it('does not fetch a business when the cart for that uuid is gone', () => {
    renderController(AddressDetails, { uuid: 'cart-1' })
    expect(addr.mockOrdering.businesses).not.toHaveBeenCalled()
  })

  it('fetches the cart business id once and stops when that cart disappears', async () => {
    addr.orderState.carts = { current: { uuid: 'cart-1', business_id: 925 } }
    const view = renderController(AddressDetails, { uuid: 'cart-1' })
    await waitFor(() => {
      expect(addr.mockOrdering.businesses).toHaveBeenCalledWith(925)
      expect(lastControllerProps.googleMapsUrl).toContain('maps.googleapis.com')
    })

    const mapUrl = lastControllerProps.googleMapsUrl
    addr.orderState.carts = {}
    view.rerender(
      <EventProvider>
        <AddressDetails UIComponent={ControllerUI} uuid='cart-1' />
      </EventProvider>
    )
    expect(addr.mockOrdering.businesses).toHaveBeenCalledTimes(1)
    expect(lastControllerProps.googleMapsUrl).toBe(mapUrl)
  })
})
