import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'

import { useEvent } from '../../contexts/EventContext'
import { useUtils } from '../../contexts/UtilsContext'
import { useGoogleMaps } from '../../hooks/useGoogleMaps'
import { sanitizeInfoWindowHtml } from '../../utils/sanitizeInfoWindowHtml'

const ZONES_MAP_FIT_PADDING = { top: 20, right: 20, bottom: 20, left: 20 }
const MAX_ZOOM_AFTER_ZONE_FIT = 17
const ZONE_FIT_ZOOM_BOOST = 1

const flattenBusinessZones = (zones) => {
  if (!Array.isArray(zones)) return []
  const result = []
  for (const item of zones) {
    if (item == null) continue
    if (Array.isArray(item)) {
      result.push(...flattenBusinessZones(item))
    } else {
      result.push(item)
    }
  }
  return result
}

const getBusinessZoneDedupeKey = (zone) => {
  if (!zone || typeof zone !== 'object' || Array.isArray(zone)) return null
  const { type, id, data } = zone
  if (type === 2 && Array.isArray(data) && data.length > 0) {
    return `2:${data.map((p) => `${p?.lat ?? ''},${p?.lng ?? ''}`).join('|')}`
  }
  if (type === 1 && data?.center && data?.radio != null) {
    const c = data.center
    return `1:${c?.lat ?? ''},${c?.lng ?? ''}:${data.radio}`
  }
  if (type === 5 && data?.distance != null) {
    const unit = data?.unit || 'km'
    return `5:${data.distance}:${unit}`
  }
  return `${type ?? 'x'}:${id ?? ''}:${JSON.stringify(data)}`
}

const dedupeBusinessZones = (zones) => {
  const seen = new Set()
  const out = []
  for (const z of zones) {
    const key = getBusinessZoneDedupeKey(z)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(z)
  }
  return out
}

const shouldRenderDeliveryZone = (zone) => {
  if (!zone || typeof zone !== 'object' || Array.isArray(zone)) return false
  if (zone.id != null && zone.id !== '') return true
  if (zone.type === 1 && zone.data?.center && zone.data?.radio != null) return true
  if (zone.type === 5 && zone.data?.distance != null) return true
  if (zone.type === 2 && Array.isArray(zone.data) && zone.data.length > 0) return true
  return false
}

const fitMapToZoneBounds = ({ map, bounds, centerPoint, mergeLocations, avoidFit }) => {
  if (avoidFit || !map || !bounds || bounds.isEmpty()) return

  if (centerPoint?.lat != null && centerPoint?.lng != null) {
    bounds.extend(centerPoint)
  }
  if (Array.isArray(mergeLocations)) {
    mergeLocations.forEach((loc) => {
      if (loc?.lat != null && loc?.lng != null) {
        bounds.extend({ lat: loc.lat, lng: loc.lng })
      }
    })
  }

  map.fitBounds(bounds, ZONES_MAP_FIT_PADDING)

  window.google.maps.event.addListenerOnce(map, 'idle', () => {
    const currentZoom = map.getZoom()
    const zoomAfterFit = Math.min(currentZoom + ZONE_FIT_ZOOM_BOOST, MAX_ZOOM_AFTER_ZONE_FIT)
    if (zoomAfterFit !== currentZoom) {
      map.setZoom(zoomAfterFit)
    }
  })
}

export const GoogleMaps = (props) => {
  const {
    apiKey,
    locations,
    mapControls,
    setErrors,
    isSetInputs,
    fixedLocation,
    handleChangeAddressMap,
    maxLimitLocation,
    businessMap,
    onBusinessClick,
    setNearBusinessList,
    noDistanceValidation,
    businessZones,
    fillStyle,
    useMapWithBusinessZones,
    deactiveAlerts,
    fallbackIcon,
    manualZoom,
    avoidFitBounds,
    allowMarkerPopups,
    initialBusinessesToCenter,
    animateDriver,
    onDriverMarkerReady
  } = props

  const [{ optimizeImage }] = useUtils()
  const [events] = useEvent()
  const divRef = useRef()
  const [googleMap, setGoogleMap] = useState(null)
  const [markers, setMarkers] = useState([])
  const [googleMapMarker, setGoogleMapMarker] = useState(null)
  const [boundMap, setBoundMap] = useState(null)
  const [userActivity, setUserActivity] = useState(false)
  const [googleReady] = useGoogleMaps(apiKey)
  const markerRef = useRef()
  const activeInfoWindowRef = useRef(null)

  const location = fixedLocation || props.location
  const center = { lat: location?.lat, lng: location?.lng }

  const units = {
    mi: 1609,
    km: 1000
  }

  /**
   * Function to generate multiple markers
   * @param {Google map} map
   */
  const generateMarkers = (map) => {
    const bounds = new window.google.maps.LatLngBounds()
    let businessesNear = 0
    const locationMarkers = []
    for (let i = 0; i < locations.length; i++) {
      let formatUrl = null
      if (i === 1 || businessMap) {
        formatUrl = optimizeImage(locations[i]?.icon, 'r_max')
      }
      const marker = new window.google.maps.Marker({
        position: new window.google.maps.LatLng(locations[i]?.lat, locations[i]?.lng),
        map,
        title: locations[i]?.slug,
        icon: {
          url: formatUrl || locations[i]?.icon || fallbackIcon,
          scaledSize: new window.google.maps.Size(35, 35)
        }
      })

      if (businessMap && !noDistanceValidation) {
        const isNear = validateResult(googleMap, marker, marker.getPosition())
        if (isNear) {
          if (i === 0 && locations[0]?.markerPopup) {
            const infowindow = new window.google.maps.InfoWindow()
            infowindow.setContent(sanitizeInfoWindowHtml(locations[0]?.markerPopup))
            infowindow.open(map, marker)
            markerRef.current = infowindow
          }
          marker.addListener('click', () => {
            if (locations[i]?.markerPopup) {
              const infowindow = new window.google.maps.InfoWindow()
              infowindow.setContent(sanitizeInfoWindowHtml(locations[i]?.markerPopup))
              infowindow.open(map, marker)
            } else {
              onBusinessClick && onBusinessClick(locations[i]?.slug, locations[i])
            }
          })
          if (!initialBusinessesToCenter || i < initialBusinessesToCenter) {
            bounds.extend(marker.position)
          }
          locationMarkers.push(marker)
          businessesNear = businessesNear + 1
        } else {
          marker.setMap(null)
        }
      } else {
        marker.addListener('click', () => {
          if (locations[i]?.markerPopup && allowMarkerPopups) {
            if (activeInfoWindowRef.current) {
              activeInfoWindowRef.current.close()
            }

            const infowindow = new window.google.maps.InfoWindow()
            infowindow.setContent(sanitizeInfoWindowHtml(locations[i]?.markerPopup))
            infowindow.open(map, marker)

            activeInfoWindowRef.current = infowindow

            window.google.maps.event.addListenerOnce(infowindow, 'domready', () => {
              document.getElementById(`order-now-${locations[i]?.id}`)?.addEventListener('click', () => locations[i]?.onBusinessCustomClick())
            })

            window.google.maps.event.addListenerOnce(infowindow, 'closeclick', () => {
              activeInfoWindowRef.current = null
            })
          } else {
            onBusinessClick && onBusinessClick(locations[i]?.slug, locations[i])
          }
        })
        if (!initialBusinessesToCenter || i < initialBusinessesToCenter) {
          bounds.extend(marker.position)
        }
        locationMarkers.push(marker)
      }
    }

    if (locationMarkers.length > 0) {
      setMarkers(locationMarkers)
    }
    if (setNearBusinessList) {
      const franchiseSlugs = []
      for (const locationMarker of locationMarkers) {
        franchiseSlugs.push(locationMarker?.title)
      }
      setNearBusinessList(franchiseSlugs)
    }
    if (!deactiveAlerts) {
      businessesNear === 0 && setErrors && setErrors('ERROR_NOT_FOUND_BUSINESSES')
    }
    if (useMapWithBusinessZones) {
      bounds.extend(center)
    }
    if (!avoidFitBounds) {
      map.fitBounds(bounds)
    }
    setBoundMap(bounds)
  }
  /**
   * function to get all address information with a location
   * @param {google location} pos
   */
  const geocodePosition = (pos) => {
    if (isSetInputs) {
      const geocoder = new window.google.maps.Geocoder()

      geocoder.geocode({ latLng: pos }, (results) => {
        if (results && results.length > 0 && results?.[0]?.address_components) {
          const addressObj = {}
          const cityFallback = results[0].address_components.find(component => component.types.includes('administrative_area_level_2'))
          for (const component of results[0].address_components) {
            const addressType = component.types[0]
            if (addressType === 'postal_code') {
              addressObj.zipcode = component.short_name
            }
            if (addressType === 'street_number') {
              addressObj.street_number = component.long_name
            }
            if (addressType === 'neighborhood') {
              addressObj.neighborhood = component.long_name
            }
            if (addressType === 'route') {
              addressObj.route = component.long_name
            }
            if (addressType === 'locality') {
              addressObj.city = component.long_name || cityFallback.long_name
              addressObj.locality = component.long_name
            }
            if (component.types?.includes('sublocality')) {
              addressObj.sublocality = component.long_name
            }
            if (addressType === 'country') {
              addressObj.country = component.long_name
              addressObj.country_code = component.short_name
            }
            if (addressType === 'administrative_area_level_1') {
              addressObj.state = component.long_name
              addressObj.state_code = component.short_name
            }
          }
          const address = {
            address: results[0].formatted_address,
            location: { lat: pos?.lat(), lng: pos?.lng() },
            ...addressObj
          }

          handleChangeAddressMap && handleChangeAddressMap(address)

          center.lat = address.location?.lat
          center.lng = address.location?.lng
        } else {
          googleMapMarker && googleMapMarker.setPosition(center)
          setErrors && setErrors('ERROR_NOT_FOUND_ADDRESS')
        }
        googleMap && googleMap.panTo(new window.google.maps.LatLng(center?.lat, center?.lng))
      })
    } else {
      const location = { lat: pos?.lat(), lng: pos?.lng() }
      handleChangeAddressMap && handleChangeAddressMap({ location })
      center.lat = location?.lat
      center.lng = location?.lng
      googleMap && googleMap.panTo(new window.google.maps.LatLng(location?.lat, location?.lng))
    }
  }

  /**
   * Function to return distance between two locations
   * @param {google location} loc1
   * @param {*google location} loc2
   */
  const validateResult = (map, marker, curPos) => {
    const loc1 = new window.google.maps.LatLng(curPos?.lat(), curPos?.lng())
    const loc2 = new window.google.maps.LatLng(location?.lat, location?.lng)

    const distance = window.google.maps.geometry.spherical.computeDistanceBetween(loc1, loc2)

    if (businessMap) {
      const minimumBusinessDistance = 20000
      if (distance <= minimumBusinessDistance) return true
      return false
    }

    if (!maxLimitLocation) {
      geocodePosition(curPos)
      return
    }

    if (distance <= maxLimitLocation) {
      geocodePosition(curPos)
    } else {
      marker.setPosition(center)
      map.panTo(new window.google.maps.LatLng(center?.lat, center?.lng))
      setErrors && setErrors('ERROR_MAX_LIMIT_LOCATION')
    }
  }

  const createDeliveryZone = (deliveryZone, map, bounds) => {
    const zoneFillColor = fillStyle?.strokeColor ?? fillStyle?.fillColor

    if (deliveryZone.type === 1 && deliveryZone?.data?.center && deliveryZone?.data?.radio) {
      const newCircleZone = new window.google.maps.Circle({
        ...fillStyle,
        fillColor: zoneFillColor,
        editable: false,
        center: deliveryZone?.data.center,
        radius: deliveryZone?.data.radio * 1000
      })
      newCircleZone.setMap(map)
      bounds.union(newCircleZone.getBounds())
    }
    if (deliveryZone.type === 5 && deliveryZone?.data?.distance) {
      const distanceKmOrMi = Number(deliveryZone.data.distance)
      const unitMeters = units[deliveryZone?.data?.unit] ?? units.km
      if (!Number.isFinite(distanceKmOrMi) || distanceKmOrMi <= 0 || !Number.isFinite(unitMeters)) {
        return
      }
      const distanceRingStyle = {
        ...fillStyle,
        fillColor: zoneFillColor,
        fillOpacity: Math.min(Number(fillStyle?.fillOpacity) || 0.08, 0.05),
        strokeWeight: Math.max(fillStyle?.strokeWeight ?? 2, 3),
        strokeOpacity: fillStyle?.strokeOpacity ?? 1
      }
      const newCircleZone = new window.google.maps.Circle({
        ...distanceRingStyle,
        editable: false,
        center,
        radius: distanceKmOrMi * unitMeters
      })
      newCircleZone.setMap(map)
      bounds.union(newCircleZone.getBounds())
    }
    if (deliveryZone?.type === 2 && Array.isArray(deliveryZone?.data)) {
      const newPolygonZone = new window.google.maps.Polygon({
        ...fillStyle,
        fillColor: zoneFillColor,
        editable: false,
        paths: deliveryZone?.data
      })
      newPolygonZone.setMap(map)
      if (Array.isArray(deliveryZone?.data)) {
        for (const position of deliveryZone?.data) {
          bounds.extend(position)
        }
      }
    }
  }

  useEffect(() => {
    if (googleReady) {
      const map = new window.google.maps.Map(divRef.current, {
        zoom: location?.zoom ?? mapControls?.defaultZoom ?? 18,
        center,
        zoomControl: mapControls?.zoomControl,
        streetViewControl: mapControls?.streetViewControl,
        fullscreenControl: mapControls?.fullscreenControl,
        mapTypeControl: mapControls?.mapTypeControl,
        mapTypeId: mapControls?.mapTypeId,
        mapTypeControlOptions: {
          style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
          position: window.google.maps.ControlPosition.TOP_LEFT,
          ...mapControls?.mapTypeControlOptions
        }
      })
      setGoogleMap(map)
      let marker = null
      if (locations) {
        if (locations.length > 0) {
          generateMarkers(map)
        }
        if (businessMap) {
          marker = new window.google.maps.Marker({
            position: new window.google.maps.LatLng(center.lat, center.lng),
            map,
            ...(location?.hideicon && {
              icon: {
                url: 'https://picsum.photos/10',
                size: new window.google.maps.Size(1, 1)
              }
            })
          })
          map.panTo(new window.google.maps.LatLng(center?.lat, center?.lng))
        } else {
          marker = new window.google.maps.Marker({
            position: new window.google.maps.LatLng(center?.lat, center?.lng),
            map,
            draggable: useMapWithBusinessZones,
            zIndex: 9999,
            icon: useMapWithBusinessZones
              ? undefined
              : {
                  url: locations[0]?.icon,
                  scaledSize: new window.google.maps.Size(35, 35)
                }
          })
        }
        setGoogleMapMarker(marker)
      } else {
        marker = new window.google.maps.Marker({
          position: new window.google.maps.LatLng(center?.lat, center?.lng),
          map,
          draggable: !!mapControls?.isMarkerDraggable
        })
        setGoogleMapMarker(marker)
      }

      if (businessZones?.length > 0) {
        const normalizedZones = dedupeBusinessZones(flattenBusinessZones(businessZones))
        const zoneBounds = new window.google.maps.LatLngBounds()
        for (const deliveryZone of normalizedZones) {
          if (!shouldRenderDeliveryZone(deliveryZone)) continue
          createDeliveryZone(deliveryZone, map, zoneBounds)
        }
        fitMapToZoneBounds({
          map,
          bounds: zoneBounds,
          centerPoint: center,
          mergeLocations: locations,
          avoidFit: avoidFitBounds
        })
      }
    }
  }, [googleReady, JSON.stringify(businessZones)])

  useEffect(() => {
    if (!googleMap || markers?.length > 0 || googleMapMarker || useMapWithBusinessZones) return
    let marker = null
    if (locations) {
      if (locations.length > 0) {
        generateMarkers(googleMap)
      }
      if (businessMap) {
        marker = new window.google.maps.Marker({
          position: new window.google.maps.LatLng(center.lat, center.lng),
          googleMap
        })
        googleMap.panTo(new window.google.maps.LatLng(center?.lat, center?.lng))
      } else {
        marker = new window.google.maps.Marker({
          position: new window.google.maps.LatLng(center?.lat, center?.lng),
          googleMap,
          draggable: useMapWithBusinessZones,
          zIndex: 9999,
          icon: useMapWithBusinessZones
            ? undefined
            : {
                url: locations[0]?.icon,
                scaledSize: new window.google.maps.Size(35, 35)
              }
        })
      }
      setGoogleMapMarker(marker)
    } else {
      marker = new window.google.maps.Marker({
        position: new window.google.maps.LatLng(center?.lat, center?.lng),
        googleMap,
        draggable: !!mapControls?.isMarkerDraggable
      })
      setGoogleMapMarker(marker)
    }
  }, [googleMap, locations])

  useEffect(() => {
    if (!businessMap) {
      if (googleReady && googleMap && googleMapMarker) {
        window.google.maps.event.addListener(googleMapMarker, 'dragend', () => {
          validateResult(googleMap, googleMapMarker, googleMapMarker.getPosition())
        })

        window.google.maps.event.addListener(googleMapMarker, 'drag', () => {
          events.emit('map_is_dragging', true)
        })

        if (mapControls?.isMarkerDraggable && !useMapWithBusinessZones) {
          window.google.maps.event.addListener(googleMap, 'drag', () => {
            googleMapMarker.setPosition(googleMap.getCenter())
            events.emit('map_is_dragging', true)
          })

          window.google.maps.event.addListener(googleMap, 'dragend', () => {
            googleMapMarker.setPosition(googleMap.getCenter())
            validateResult(googleMap, googleMapMarker, googleMap.getCenter())
          })
        }

        return () => {
          window.google.maps.event.clearListeners(googleMapMarker, 'dragend')
          window.google.maps.event.clearListeners(googleMap, 'drag')
          window.google.maps.event.clearListeners(googleMap, 'dragend')
        }
      }
    }
  }, [googleMapMarker, googleMap, location])

  useEffect(() => {
    if (googleReady && location) {
      if (businessMap && googleMap) {
        if (markerRef?.current) {
          markerRef?.current?.close && markerRef.current.close()
        }
        if (activeInfoWindowRef.current) {
          activeInfoWindowRef.current.close()
          activeInfoWindowRef.current = null
        }
        markers.forEach(marker => {
          marker.setMap(null)
        })
        generateMarkers(googleMap)
      }
      center.lat = location?.lat
      center.lng = location?.lng
      const newPos = new window.google.maps.LatLng(center?.lat, center?.lng)
      if (!animateDriver) {
        googleMapMarker && googleMapMarker.setPosition(newPos)
        !useMapWithBusinessZones && markers?.[0] && markers[0].setPosition(newPos)
      }
      googleMap && googleMap.panTo(new window.google.maps.LatLng(center?.lat, center?.lng))
    }
  }, [location, JSON.stringify(locations)])

  useEffect(() => {
    if (!businessMap && !manualZoom) {
      const interval = setInterval(() => {
        if (googleReady && !userActivity) {
          const driverLocation = useMapWithBusinessZones ? center : locations?.[0]
          if (driverLocation) {
            const newLocation = new window.google.maps.LatLng(driverLocation?.lat, driverLocation?.lng)
            useMapWithBusinessZones ? boundMap.extend(newLocation) : markers?.[0] && markers[0].setPosition(newLocation)
            markers?.length > 0 && markers.forEach(marker => boundMap.extend(marker.position))
            if (!avoidFitBounds) {
              googleMap.fitBounds(boundMap, 150)
            }
          }
        }
        setUserActivity(false)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [JSON.stringify(locations), userActivity])

  useEffect(() => {
    if (boundMap && businessMap && !avoidFitBounds) {
      boundMap.extend(center)
      googleMap.fitBounds(boundMap)
    }
  }, [boundMap, avoidFitBounds])

  useEffect(() => {
    if (animateDriver && onDriverMarkerReady && googleMapMarker && markers?.[0]) {
      onDriverMarkerReady({ centerMarker: googleMapMarker, driverMarker: markers[0] })
    }
  }, [animateDriver, onDriverMarkerReady, googleMapMarker, markers])

  return (
    googleReady && (
      <div
        onMouseOver={() => setUserActivity(true)}
        id='map'
        ref={divRef}
        style={{ width: '70%', height: '50%', position: 'absolute' }}
      />
    )
  )
}

GoogleMaps.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
   * You Google Maps api key
   * @see apiKey What is Api Key ? https://developers.google.com/maps/gmp-get-started
   */
  apiKey: PropTypes.string.isRequired,
  /**
   * Function to get address from GPS
   * @param {object} address New address
   */
  onAddress: PropTypes.func,
  /**
   * Function to get error from GPS
   * @param {object} address New address
   */
  onError: PropTypes.func,
  /**
   * maxLimitLocation, max value to set position
   */
  maxLimitLocation: PropTypes.number,
  /**
   * handleChangeAddressMap, function to set address when pin is moved
   */
  handleChangeAddressMap: PropTypes.func,
  /**
   * Number of businesses to consider for initial map centering.
   * If not provided, it will center on all businesses.
   */
  initialBusinessesToCenter: PropTypes.number
}
