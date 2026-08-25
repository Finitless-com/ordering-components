import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'

const dmm = vi.hoisted(() => {
  const { createDriverMessagesMapTestContext } = require('../../../__tests__/helpers/driverMessagesMapTestHelpers')
  return createDriverMessagesMapTestContext(vi)
})

vi.mock('../../../hooks/useGoogleMaps', () => ({
  useGoogleMaps: () => [true]
}))

vi.mock('../../../contexts/UtilsContext', () => ({
  useUtils: () => [{ optimizeImage: (url) => url }]
}))

import { GoogleMaps } from '../index'

describe('GoogleMaps', () => {
  const baseProps = {
    apiKey: 'test-key',
    location: { lat: 40.7128, lng: -74.006 },
    mapControls: { defaultZoom: 14, isMarkerDraggable: true },
    locations: [{
      lat: 40.713,
      lng: -74.007,
      slug: 'pizza-place',
      icon: 'https://example.com/icon.png',
      id: 5
    }]
  }

  beforeEach(() => dmm.reset())

  it('renders map container when google SDK is ready', () => {
    const { container } = render(<GoogleMaps {...baseProps} />)
    expect(container.querySelector('#map')).toBeTruthy()
  })

  it('renders business map markers and reports nearby businesses', async () => {
    render(
      <GoogleMaps
        {...baseProps}
        businessMap
        setNearBusinessList={dmm.mockSetNearBusinessList}
        onBusinessClick={dmm.mockOnBusinessClick}
      />
    )
    await waitFor(() => {
      expect(dmm.mockSetNearBusinessList).toHaveBeenCalled()
    })
  })

  it('sanitizes markerPopup HTML before opening InfoWindow', async () => {
    const setContent = vi.spyOn(window.google.maps.InfoWindow.prototype, 'setContent')
    render(
      <GoogleMaps
        {...baseProps}
        businessMap
        locations={[{
          ...baseProps.locations[0],
          markerPopup: '<div>Pizza<script>alert(1)</script><img src=x onerror=alert(1)></div>'
        }]}
      />
    )
    await waitFor(() => {
      expect(setContent).toHaveBeenCalled()
    })
    const html = setContent.mock.calls[0][0]
    expect(html).toContain('Pizza')
    expect(html).not.toMatch(/script/i)
    expect(html).not.toMatch(/onerror/i)
    expect(html).not.toMatch(/alert\(/)
  })

  it('geocodes dragged marker position when isSetInputs is enabled', async () => {
    render(
      <GoogleMaps
        {...baseProps}
        isSetInputs
        handleChangeAddressMap={dmm.mockHandleChangeAddressMap}
        maxLimitLocation={50000}
      />
    )
    await waitFor(() => expect(window.google.maps.Map).toBeDefined())
    const dragHandler = window.google.maps.event.addListener.mock.calls.find(
      ([, event]) => event === 'dragend'
    )?.[2]
    act(() => {
      dragHandler?.()
    })
    await waitFor(() => {
      expect(dmm.mockHandleChangeAddressMap).toHaveBeenCalled()
    })
  })

  it('sets error when no businesses are found nearby', async () => {
    window.google.maps.geometry.spherical.computeDistanceBetween = () => 999999
    render(
      <GoogleMaps
        {...baseProps}
        businessMap
        setErrors={dmm.mockSetErrors}
      />
    )
    await waitFor(() => {
      expect(dmm.mockSetErrors).toHaveBeenCalledWith('ERROR_NOT_FOUND_BUSINESSES')
    })
  })

  it('renders delivery zones and fits map bounds', async () => {
    const { container } = render(
      <GoogleMaps
        {...baseProps}
        useMapWithBusinessZones
        businessZones={[
          { type: 1, id: 1, data: { center: { lat: 40.71, lng: -74 }, radio: 2 } },
          { type: 2, id: 2, data: [{ lat: 40.71, lng: -74.01 }, { lat: 40.72, lng: -74.02 }] },
          { type: 5, id: 3, data: { distance: 1, unit: 'km' } }
        ]}
      />
    )
    expect(container.querySelector('#map')).toBeTruthy()
  })
})
