import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const biz = vi.hoisted(() => {
  const h = require('../../../__tests__/helpers/businessDiscoveryTestHelpers')
  const reset = () => {
    vi.clearAllMocks()
    h.setupGoogleMaps(vi)
  }
  return { reset }
})

vi.mock('../../../hooks/useGoogleMaps', () => ({
  useGoogleMaps: () => [true]
}))

import { LocationsMap } from '../index'

describe('LocationsMap', () => {
  beforeEach(() => biz.reset())

  it('renders map container when google maps is ready', async () => {
    const { container } = render(
      <LocationsMap
        apiKey='test-key'
        locations={[{ lat: 40.7, lng: -74, icon: 'pin.png' }]}
        location={{ lat: 40.7, lng: -74 }}
        mapControls={{ defaultZoom: 12 }}
        listenLocations
      />
    )
    await waitFor(() => {
      expect(container.querySelector('#map')).toBeTruthy()
    })
    expect(window.google.maps.Map).toHaveBeenCalled()
    expect(window.google.maps.Marker).toHaveBeenCalled()
  })

  it('opens info window when activeInfoWindow is provided', async () => {
    const { rerender } = render(
      <LocationsMap
        apiKey='test-key'
        locations={[{ lat: 40.7, lng: -74, icon: 'pin.png' }]}
        location={{ lat: 40.7, lng: -74 }}
        mapControls={{ defaultZoom: 12 }}
        listenLocations
      />
    )
    await waitFor(() => expect(window.google.maps.Map).toHaveBeenCalled())
    rerender(
      <LocationsMap
        apiKey='test-key'
        locations={[{ lat: 40.7, lng: -74, icon: 'pin.png' }]}
        location={{ lat: 40.7, lng: -74 }}
        mapControls={{ defaultZoom: 12 }}
        listenLocations
        activeInfoWindow={{ location: { lat: 40.7, lng: -74 }, content: 'Hello store' }}
      />
    )
    await waitFor(() => {
      expect(window.google.maps.InfoWindow).toHaveBeenCalled()
    })
  })

  it('sanitizes activeInfoWindow HTML before setContent', async () => {
    const setContent = vi.fn()
    window.google.maps.InfoWindow = vi.fn(() => ({
      setContent,
      open: vi.fn(),
      close: vi.fn(),
      addListener: vi.fn()
    }))
    const { rerender } = render(
      <LocationsMap
        apiKey='test-key'
        locations={[{ lat: 40.7, lng: -74, icon: 'pin.png' }]}
        location={{ lat: 40.7, lng: -74 }}
        mapControls={{ defaultZoom: 12 }}
        listenLocations
      />
    )
    await waitFor(() => expect(window.google.maps.Map).toHaveBeenCalled())
    rerender(
      <LocationsMap
        apiKey='test-key'
        locations={[{ lat: 40.7, lng: -74, icon: 'pin.png' }]}
        location={{ lat: 40.7, lng: -74 }}
        mapControls={{ defaultZoom: 12 }}
        listenLocations
        activeInfoWindow={{
          location: { lat: 40.7, lng: -74 },
          content: '<div>Store<script>alert(1)</script><img src=x onerror=alert(1)></div>'
        }}
      />
    )
    await waitFor(() => {
      expect(setContent).toHaveBeenCalled()
    })
    const html = setContent.mock.calls[0][0]
    expect(html).toContain('Store')
    expect(html).not.toMatch(/script/i)
    expect(html).not.toMatch(/onerror/i)
    expect(html).not.toMatch(/alert\(/)
  })

  it('recenters map when forceCenter is enabled', async () => {
    const mapInstance = {
      fitBounds: vi.fn(),
      setCenter: vi.fn(),
      setZoom: vi.fn()
    }
    window.google.maps.Map = vi.fn(() => mapInstance)
    const { rerender } = render(
      <LocationsMap
        apiKey='test-key'
        locations={[]}
        location={{ lat: 40.8, lng: -73.9 }}
        mapControls={{ defaultZoom: 12 }}
        listenLocations
      />
    )
    await waitFor(() => expect(window.google.maps.Map).toHaveBeenCalled())
    rerender(
      <LocationsMap
        apiKey='test-key'
        locations={[]}
        location={{ lat: 40.8, lng: -73.9 }}
        mapControls={{ defaultZoom: 12 }}
        listenLocations
        forceCenter
      />
    )
    await waitFor(() => {
      expect(mapInstance.setCenter).toHaveBeenCalledWith({ lat: 40.8, lng: -73.9 })
    })
  })
})
