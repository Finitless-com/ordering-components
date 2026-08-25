import React, { useEffect, useRef, useState } from 'react'
import { useGoogleMaps } from '../../hooks/useGoogleMaps'
import { sanitizeInfoWindowHtml } from '../../utils/sanitizeInfoWindowHtml'

const isValidCoordinate = (value) => Number.isFinite(Number(value))

const resolveMarkerIconUrl = (icon, fallbackIcon) => {
  if (typeof icon === 'string' && icon.trim()) return icon.trim()
  if (typeof fallbackIcon === 'string' && fallbackIcon.trim()) return fallbackIcon.trim()
  return null
}

export const LocationsMap = (props) => {
  const {
    apiKey,
    locations,
    mapControls,
    location,
    activeInfoWindow,
    forceCenter,
    listenLocations,
    fallbackIcon
  } = props

  const divRef = useRef()
  const markersRef = useRef([])
  const [googleMap, setGoogleMap] = useState(null)
  const [markers, setMarkers] = useState([])
  const [boundMap, setBoundMap] = useState(null)
  const [googleReady] = useGoogleMaps(apiKey)
  const markerRef = useRef()

  const generateMarkers = (map) => {
    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = []

    const bounds = new window.google.maps.LatLngBounds()
    const locationMarkers = []

    for (const business of locations || []) {
      const lat = Number(business.lat)
      const lng = Number(business.lng)
      if (!isValidCoordinate(lat) || !isValidCoordinate(lng)) continue

      const iconUrl = resolveMarkerIconUrl(business.icon, fallbackIcon)
      const markerOptions = {
        position: new window.google.maps.LatLng(lat, lng),
        map
      }

      if (iconUrl) {
        markerOptions.icon = {
          url: iconUrl,
          scaledSize: new window.google.maps.Size(30, 30)
        }
      }

      const marker = new window.google.maps.Marker(markerOptions)

      marker.addListener('click', () => {
        if (business.markerPopup) {
          const infowindow = new window.google.maps.InfoWindow()
          infowindow.setContent(sanitizeInfoWindowHtml(business.markerPopup))
          infowindow.open(map, marker)

          infowindow.addListener('closeclick', () => {
            if (boundMap && !boundMap.isEmpty()) {
              map.fitBounds(boundMap)
            }
          })

          if (markerRef.current) {
            markerRef.current.close()
          }
          markerRef.current = infowindow
        }
        business.onBusinessCustomClick && business.onBusinessCustomClick()
      })

      bounds.extend(marker.position)
      locationMarkers.push(marker)
    }

    markersRef.current = locationMarkers
    setMarkers(locationMarkers)
    setBoundMap(bounds)

    if (locationMarkers.length > 0 && !bounds.isEmpty()) {
      map.fitBounds(bounds)
    } else if (isValidCoordinate(location?.lat) && isValidCoordinate(location?.lng)) {
      map.setCenter({ lat: Number(location.lat), lng: Number(location.lng) })
      map.setZoom(mapControls?.defaultZoom ?? 15)
    }
  }

  useEffect(() => {
    if (googleReady) {
      const map = new window.google.maps.Map(divRef.current, {
        zoom: mapControls?.defaultZoom ?? 15,
        center: location,
        ...mapControls
      })
      setGoogleMap(map)
      generateMarkers(map)
    }
  }, [googleReady])

  useEffect(() => {
    if (!googleMap || !listenLocations || !googleReady) return
    generateMarkers(googleMap)
  }, [googleMap, locations])

  useEffect(() => {
    if (googleMap && activeInfoWindow) {
      const { location: infoLocation, content } = activeInfoWindow
      const position = new window.google.maps.LatLng(infoLocation.lat, infoLocation.lng)
      const marker = markers.find(m =>
        m.getPosition().lat() === position.lat() &&
        m.getPosition().lng() === position.lng()
      )

      if (marker) {
        const infowindow = new window.google.maps.InfoWindow()
        infowindow.setContent(sanitizeInfoWindowHtml(content))
        infowindow.open(googleMap, marker)

        infowindow.addListener('closeclick', () => {
          if (boundMap && !boundMap.isEmpty()) {
            googleMap.fitBounds(boundMap)
          }
        })

        if (markerRef.current) {
          markerRef.current.close()
        }
        markerRef.current = infowindow

        googleMap.setCenter(position)
        googleMap.setZoom(18)
      }
    } else if (!activeInfoWindow && markerRef.current) {
      markerRef.current.close()
      markerRef.current = null

      if (boundMap && !boundMap.isEmpty()) {
        googleMap.fitBounds(boundMap)
      }
    }
  }, [activeInfoWindow, googleMap])

  useEffect(() => {
    if (googleMap && location && forceCenter) {
      googleMap.setCenter(location)
      googleMap.setZoom(18)
    }
  }, [location, forceCenter])

  return (
    googleReady && (
      <div
        id='map'
        ref={divRef}
        style={{ width: '100%', height: '100%' }}
      />
    )
  )
}
