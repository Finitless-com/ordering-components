import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import PropTypes, { string } from 'prop-types'
import { useGoogleMaps } from '../../hooks/useGoogleMaps'
import {
  PLACES_API_NEW,
  PLACES_API_LEGACY,
  getPlacesApiMode,
  setPlacesApiMode,
  isNewPlacesApiAvailable,
  isPlacesApiNotEnabledError,
  createSessionToken,
  fetchNewSuggestions,
  fetchNewPlace,
  placeToAddress
} from './placesApi'

const SUGGESTIONS_DEBOUNCE_MS = 200
const GOOGLE_ATTRIBUTION_IMAGE = 'https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3_hdpi.png'

const containerStyle = {
  position: 'fixed',
  boxSizing: 'border-box',
  backgroundColor: '#fff',
  borderTop: '1px solid #d9d9d9',
  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
  fontFamily: 'Arial, sans-serif',
  overflow: 'hidden',
  zIndex: 100000
}

const itemStyle = {
  cursor: 'pointer',
  padding: '0 4px',
  lineHeight: '30px',
  fontSize: '11px',
  color: '#999',
  textAlign: 'left',
  borderTop: '1px solid #e6e6e6',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
}

const activeItemStyle = {
  ...itemStyle,
  backgroundColor: '#ebf2fe'
}

const itemQueryStyle = {
  fontSize: '13px',
  color: '#000',
  paddingRight: '3px'
}

const attributionStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  padding: '4px 6px'
}

/**
 * Component to make an input with Google Autocomplete
 * @param {object} props Props of AutocompleteInput component
 */
export const AutocompleteInput = (props) => {
  props = { ...defaultProps, ...props }
  const {
    apiKey,
    onChangeAddress,
    types,
    fields,
    countryCode,
    childRef,
    onChange,
    onKeyDown,
    onBlur
  } = props

  const [googleReady] = useGoogleMaps(apiKey)
  const inputRef = useRef()
  const legacyAutocompleteRef = useRef(null)
  const sessionTokenRef = useRef(null)
  const debounceRef = useRef(null)
  const requestIdRef = useRef(0)
  const onChangeAddressRef = useRef(onChangeAddress)
  const [suggestions, setSuggestions] = useState([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [dropdownRect, setDropdownRect] = useState(null)

  onChangeAddressRef.current = onChangeAddress

  const inputProps = {}

  Object.entries(props).forEach(([key, value]) => {
    if (['googleReady', 'apiKey', 'onChangeAddress', 'setValue', 'childRef', 'countryCode', 'types', 'fields', 'onChange', 'onKeyDown', 'onBlur'].indexOf(key) === -1) {
      inputProps[key] = value
    }
  })

  const options = {
    types,
    fields
  }

  if (countryCode !== '*') {
    options.componentRestrictions = {
      country: countryCode
    }
  }

  const isDropdownOpen = suggestions.length > 0 && !!dropdownRect

  const closeSuggestions = () => {
    requestIdRef.current += 1
    clearTimeout(debounceRef.current)
    setSuggestions([])
    setActiveIndex(-1)
  }

  const updateDropdownRect = () => {
    if (!inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    setDropdownRect({ top: rect.bottom, left: rect.left, width: rect.width })
  }

  const attachLegacyAutocomplete = () => {
    if (legacyAutocompleteRef.current || !inputRef.current || !onChangeAddressRef.current) return
    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, options)
    legacyAutocompleteRef.current = autocomplete
    autocomplete.addListener('place_changed', () => {
      const address = placeToAddress(autocomplete.getPlace())
      if (address) {
        onChangeAddressRef.current && onChangeAddressRef.current(address)
      }
    })
  }

  const switchToLegacy = () => {
    setPlacesApiMode(PLACES_API_LEGACY)
    closeSuggestions()
    attachLegacyAutocomplete()
    setTimeout(() => {
      const input = inputRef.current
      if (!input?.value || document.activeElement !== input) return
      input.dispatchEvent(new Event('focus'))
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, 0)
  }

  const shouldUseNewApi = () => {
    return !legacyAutocompleteRef.current &&
      getPlacesApiMode() !== PLACES_API_LEGACY &&
      isNewPlacesApiAvailable()
  }

  const requestSuggestions = async (input) => {
    const requestId = ++requestIdRef.current
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = createSessionToken()
    }
    try {
      const result = await fetchNewSuggestions({
        input,
        sessionToken: sessionTokenRef.current,
        types,
        countryCode
      })
      setPlacesApiMode(PLACES_API_NEW)
      if (requestId !== requestIdRef.current) return
      updateDropdownRect()
      setSuggestions(result)
      setActiveIndex(-1)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      if (getPlacesApiMode() !== PLACES_API_NEW && isPlacesApiNotEnabledError(error)) {
        switchToLegacy()
        return
      }
      setSuggestions([])
    }
  }

  const handleSelectSuggestion = async (suggestion) => {
    if (!suggestion) return
    if (inputRef.current) {
      inputRef.current.value = suggestion.text
    }
    closeSuggestions()
    sessionTokenRef.current = null
    try {
      const place = await fetchNewPlace(suggestion.prediction)
      const address = placeToAddress(place)
      if (address) {
        onChangeAddressRef.current && onChangeAddressRef.current(address)
      }
    } catch (error) {
      console.error('Google Places details request failed', error)
    }
  }

  const handleChange = (e) => {
    onChange && onChange(e)
    if (!googleReady || !onChangeAddress) return
    if (!shouldUseNewApi()) {
      if (getPlacesApiMode() === PLACES_API_LEGACY) attachLegacyAutocomplete()
      return
    }
    const value = e.target.value
    clearTimeout(debounceRef.current)
    if (!value?.trim()) {
      closeSuggestions()
      return
    }
    debounceRef.current = setTimeout(() => requestSuggestions(value), SUGGESTIONS_DEBOUNCE_MS)
  }

  const handleKeyDown = (e) => {
    if (isDropdownOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(index => (index + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(index => (index <= 0 ? suggestions.length - 1 : index - 1))
        return
      }
      if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault()
        handleSelectSuggestion(suggestions[activeIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeSuggestions()
        return
      }
    }
    onKeyDown && onKeyDown(e)
  }

  const handleBlur = (e) => {
    closeSuggestions()
    onBlur && onBlur(e)
  }

  const handleDropdownMouseDown = (e) => {
    e.preventDefault()
  }

  useEffect(() => {
    if (googleReady && onChangeAddress && (!isNewPlacesApiAvailable() || getPlacesApiMode() === PLACES_API_LEGACY)) {
      attachLegacyAutocomplete()
    }
  }, [googleReady])

  useEffect(() => {
    if (!isDropdownOpen) return
    window.addEventListener('resize', updateDropdownRect)
    window.addEventListener('scroll', updateDropdownRect, true)
    return () => {
      window.removeEventListener('resize', updateDropdownRect)
      window.removeEventListener('scroll', updateDropdownRect, true)
    }
  }, [isDropdownOpen])

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current)
      if (legacyAutocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(legacyAutocompleteRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (inputRef.current.attributes.autocomplete &&
        inputRef.current.attributes.autocomplete.value === 'new-field'
      ) clearInterval(interval)
      inputRef.current.setAttribute('autocomplete', 'new-field')
    }, 100)
    return () => clearInterval(interval)
  })

  const dropdownPositionStyle = isDropdownOpen
    ? { ...containerStyle, top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width }
    : null

  const suggestionItems = suggestions.map((suggestion, index) => {
    const handleClick = () => handleSelectSuggestion(suggestion)
    const handleMouseEnter = () => setActiveIndex(index)
    const isActive = index === activeIndex
    return (
      <div
        key={suggestion.placeId || index}
        role='option'
        aria-selected={isActive}
        className={isActive ? 'pac-item pac-item-selected' : 'pac-item'}
        style={isActive ? activeItemStyle : itemStyle}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
      >
        <span className='pac-item-query' style={itemQueryStyle}>{suggestion.mainText}</span>
        {suggestion.secondaryText && <span>{suggestion.secondaryText}</span>}
      </div>
    )
  })

  const dropdown = isDropdownOpen && typeof document !== 'undefined'
    ? ReactDOM.createPortal(
      <div
        className='pac-container ordering-places-autocomplete'
        role='listbox'
        style={dropdownPositionStyle}
        onMouseDown={handleDropdownMouseDown}
      >
        {suggestionItems}
        <div className='pac-attribution' style={attributionStyle}>
          <img src={GOOGLE_ATTRIBUTION_IMAGE} alt='Powered by Google' height='14' />
        </div>
      </div>,
      document.body
    )
    : null

  return (
    <>
      <input
        {...inputProps}
        autoComplete='new-field'
        disabled={!googleReady}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        ref={(e) => {
          inputRef.current = e
          childRef && childRef(e)
        }}
      />
      {dropdown}
    </>
  )
}

AutocompleteInput.propTypes = {
  /**
   * You Google Maps api key
   * @see apiKey What is Api Key ? https://developers.google.com/maps/gmp-get-started
   */
  apiKey: PropTypes.string.isRequired,
  /**
   * Fields for Google autocomplete
   * @see fields https://developers.google.com/maps/documentation/javascript/reference/places-widget#AutocompleteOptions.fields
   */
  fields: PropTypes.arrayOf(string),
  /**
   * types for Google autocomplete
   * @see types https://developers.google.com/maps/documentation/javascript/reference/places-widget#AutocompleteOptions.types
   */
  types: PropTypes.arrayOf(string),
  /**
   * types for Google autocomplete
   * @see countryCode https://developers.google.com/maps/documentation/javascript/reference/places-autocomplete-service#ComponentRestrictions.country
   */
  countryCode: PropTypes.string,
  /**
   * Function to get address when this changed
   * @param {object} address New address
   */
  onChangeAddress: PropTypes.func
}

const defaultProps = {
  types: [],
  fields: ['ALL'],
  countryCode: '*'
}
