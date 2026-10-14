export const PLACES_API_NEW = 'new'
export const PLACES_API_LEGACY = 'legacy'

const NEW_PLACE_FIELDS = [
  'id',
  'displayName',
  'types',
  'formattedAddress',
  'addressComponents',
  'location',
  'utcOffsetMinutes'
]

const PERMISSION_DENIED_CODES = [7, 'PERMISSION_DENIED']

const NOT_ENABLED_PATTERNS = [
  /has not been used/i,
  /is disabled/i,
  /not enabled/i,
  /are blocked/i,
  /API_KEY_SERVICE_BLOCKED/i,
  /PERMISSION_DENIED/i,
  /not authorized to use this API/i
]

let placesApiMode = null

export const isPlacesApiNotEnabledError = (error) => {
  if (PERMISSION_DENIED_CODES.includes(error?.code)) return true
  const message = error?.message || `${error ?? ''}`
  return NOT_ENABLED_PATTERNS.some(pattern => pattern.test(message))
}

export const getPlacesApiMode = () => placesApiMode

export const setPlacesApiMode = (mode) => {
  placesApiMode = mode
}

export const isNewPlacesApiAvailable = () => !!window.google?.maps?.places?.AutocompleteSuggestion

export const createSessionToken = () => {
  const SessionToken = window.google?.maps?.places?.AutocompleteSessionToken
  return SessionToken ? new SessionToken() : undefined
}

const toRegionCodes = (countryCode) => {
  if (!countryCode || countryCode === '*') return []
  const codes = Array.isArray(countryCode) ? countryCode : `${countryCode}`.split(',')
  return codes.map(code => `${code}`.trim().toLowerCase()).filter(Boolean)
}

export const fetchNewSuggestions = async ({ input, sessionToken, types, countryCode }) => {
  const request = { input }
  if (sessionToken) request.sessionToken = sessionToken
  if (types?.length) request.includedPrimaryTypes = types
  const regionCodes = toRegionCodes(countryCode)
  if (regionCodes.length) request.includedRegionCodes = regionCodes

  const { suggestions } = await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request)

  return (suggestions || [])
    .filter(suggestion => suggestion?.placePrediction)
    .map(({ placePrediction }) => {
      const text = placePrediction.text?.text ?? ''
      return {
        placeId: placePrediction.placeId,
        text,
        mainText: placePrediction.mainText?.text ?? text,
        secondaryText: placePrediction.secondaryText?.text ?? '',
        prediction: placePrediction
      }
    })
}

export const fetchNewPlace = async (prediction) => {
  const place = prediction.toPlace()
  await place.fetchFields({ fields: NEW_PLACE_FIELDS })
  return {
    place_id: place.id,
    name: place.displayName ?? null,
    types: place.types ?? [],
    formatted_address: place.formattedAddress,
    address_components: (place.addressComponents || []).map(component => ({
      long_name: component.longText,
      short_name: component.shortText,
      types: component.types || []
    })),
    geometry: { location: place.location },
    utc_offset_minutes: place.utcOffsetMinutes
  }
}

export const placeToAddress = (place) => {
  if (!place?.address_components) return null

  const addressObj = {
    street_number: null,
    neighborhood: null,
    route: null,
    city: null,
    locality: null,
    sublocality: null,
    country: null,
    country_code: null,
    state: null,
    state_code: null,
    zipcode: null
  }
  const cityFallback = place.address_components.find(component => component.types?.includes('administrative_area_level_2'))
  for (const component of place.address_components) {
    const addressType = component.types?.[0]
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
      addressObj.city = component.long_name || cityFallback?.long_name
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

  return {
    address: place.formatted_address,
    location: {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng()
    },
    utc_offset: place.utc_offset_minutes,
    map_data: {
      library: 'google',
      place_id: place.place_id
    },
    place_name: place.name || null,
    place_types: place.types || [],
    ...addressObj
  }
}
