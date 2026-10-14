import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent, screen } from '@testing-library/react'

vi.mock('../../../hooks/useGoogleMaps', () => ({
  useGoogleMaps: () => [true]
}))

import { AutocompleteInput } from '../index'
import { setPlacesApiMode, getPlacesApiMode, placeToAddress, isPlacesApiNotEnabledError } from '../placesApi'

const buildPrediction = (overrides = {}) => {
  const place = {
    id: 'new-place-1',
    displayName: 'Soet Muisberg',
    types: ['restaurant', 'establishment'],
    formattedAddress: '1 Main Rd, Cape Town, South Africa',
    addressComponents: [
      { types: ['street_number'], longText: '1', shortText: '1' },
      { types: ['route'], longText: 'Main Road', shortText: 'Main Rd' },
      { types: ['locality', 'political'], longText: 'Cape Town', shortText: 'Cape Town' },
      { types: ['administrative_area_level_1', 'political'], longText: 'Western Cape', shortText: 'WC' },
      { types: ['country', 'political'], longText: 'South Africa', shortText: 'ZA' },
      { types: ['postal_code'], longText: '8001', shortText: '8001' }
    ],
    location: { lat: () => -33.92, lng: () => 18.42 },
    utcOffsetMinutes: 120,
    fetchFields: vi.fn(async () => ({ place })),
    ...overrides
  }
  return {
    placeId: 'new-place-1',
    text: { text: '1 Main Rd, Cape Town, South Africa' },
    mainText: { text: '1 Main Rd' },
    secondaryText: { text: 'Cape Town, South Africa' },
    toPlace: vi.fn(() => place),
    place
  }
}

const mockGoogle = ({ fetchAutocompleteSuggestions, Autocomplete } = {}) => {
  window.google = {
    maps: {
      event: { clearInstanceListeners: vi.fn() },
      places: {
        Autocomplete: Autocomplete || vi.fn(() => ({ addListener: vi.fn(), getPlace: vi.fn() })),
        AutocompleteSessionToken: vi.fn(),
        ...(fetchAutocompleteSuggestions && {
          AutocompleteSuggestion: { fetchAutocompleteSuggestions }
        })
      }
    }
  }
}

describe('GoogleAutocompleteInput', () => {
  beforeEach(() => {
    setPlacesApiMode(null)
  })

  it('calls onChangeAddress when a place is selected', async () => {
    const onChangeAddress = vi.fn()
    const mockGetPlace = vi.fn(() => ({
      formatted_address: '1600 Amphitheatre Pkwy',
      geometry: { location: { lat: () => 37.42, lng: () => -122.08 } },
      address_components: [
        { types: ['country'], long_name: 'United States', short_name: 'US' },
        { types: ['locality'], long_name: 'Mountain View' },
        { types: ['postal_code'], short_name: '94043' }
      ],
      place_id: 'place-1',
      utc_offset_minutes: -420
    }))

    window.google = {
      maps: {
        places: {
          Autocomplete: vi.fn(() => ({
            addListener: (event, cb) => {
              if (event === 'place_changed') cb()
            },
            getPlace: mockGetPlace
          }))
        }
      }
    }

    render(<AutocompleteInput apiKey='test-key' onChangeAddress={onChangeAddress} />)

    await waitFor(() => {
      expect(onChangeAddress).toHaveBeenCalledWith(expect.objectContaining({
        address: '1600 Amphitheatre Pkwy',
        country_code: 'US',
        location: { lat: 37.42, lng: -122.08 }
      }))
    })
  })

  it('restricts autocomplete to a specific country', async () => {
    const onChangeAddress = vi.fn()
    window.google = {
      maps: {
        places: {
          Autocomplete: vi.fn((_, options) => {
            expect(options.componentRestrictions).toEqual({ country: 'US' })
            return {
              addListener: vi.fn(),
              getPlace: vi.fn()
            }
          })
        }
      }
    }
    render(<AutocompleteInput apiKey='test-key' countryCode='US' onChangeAddress={onChangeAddress} />)
    await waitFor(() => {
      expect(window.google.maps.places.Autocomplete).toHaveBeenCalled()
    })
  })

  it('uses Places API (New) suggestions and maps the selected place to the legacy address shape', async () => {
    const onChangeAddress = vi.fn()
    const onChange = vi.fn()
    const prediction = buildPrediction()
    const fetchAutocompleteSuggestions = vi.fn(async () => ({ suggestions: [{ placePrediction: prediction }] }))
    mockGoogle({ fetchAutocompleteSuggestions })

    render(<AutocompleteInput apiKey='test-key' placeholder='Address' onChange={onChange} onChangeAddress={onChangeAddress} />)
    const input = screen.getByPlaceholderText('Address')
    fireEvent.change(input, { target: { value: '1 Main' } })

    const option = await screen.findByRole('option')
    expect(option.textContent).toContain('1 Main Rd')
    expect(onChange).toHaveBeenCalled()
    expect(window.google.maps.places.Autocomplete).not.toHaveBeenCalled()
    expect(getPlacesApiMode()).toBe('new')

    fireEvent.click(option)

    await waitFor(() => {
      expect(onChangeAddress).toHaveBeenCalledWith(expect.objectContaining({
        address: '1 Main Rd, Cape Town, South Africa',
        location: { lat: -33.92, lng: 18.42 },
        utc_offset: 120,
        map_data: { library: 'google', place_id: 'new-place-1' },
        place_name: 'Soet Muisberg',
        place_types: ['restaurant', 'establishment'],
        street_number: '1',
        route: 'Main Road',
        city: 'Cape Town',
        state_code: 'WC',
        country_code: 'ZA',
        zipcode: '8001'
      }))
    })
    expect(prediction.place.fetchFields).toHaveBeenCalledWith({
      fields: expect.arrayContaining(['addressComponents', 'formattedAddress', 'location', 'utcOffsetMinutes'])
    })
    expect(input.value).toBe('1 Main Rd, Cape Town, South Africa')
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('sends country restrictions as region codes to Places API (New)', async () => {
    const fetchAutocompleteSuggestions = vi.fn(async () => ({ suggestions: [] }))
    mockGoogle({ fetchAutocompleteSuggestions })

    render(<AutocompleteInput apiKey='test-key' placeholder='Address' countryCode='ZA, NA' onChangeAddress={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Address'), { target: { value: 'cape' } })

    await waitFor(() => {
      expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith(expect.objectContaining({
        input: 'cape',
        includedRegionCodes: ['za', 'na']
      }))
    })
  })

  it('selects a suggestion with the keyboard', async () => {
    const onChangeAddress = vi.fn()
    const fetchAutocompleteSuggestions = vi.fn(async () => ({ suggestions: [{ placePrediction: buildPrediction() }] }))
    mockGoogle({ fetchAutocompleteSuggestions })

    render(<AutocompleteInput apiKey='test-key' placeholder='Address' onChangeAddress={onChangeAddress} />)
    const input = screen.getByPlaceholderText('Address')
    fireEvent.change(input, { target: { value: '1 Main' } })
    await screen.findByRole('option')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(onChangeAddress).toHaveBeenCalledWith(expect.objectContaining({ country_code: 'ZA' }))
    })
  })

  it('falls back to the legacy Autocomplete widget when Places API (New) is not enabled', async () => {
    const fetchAutocompleteSuggestions = vi.fn(async () => {
      throw new Error('Places API (New) has not been used in project')
    })
    mockGoogle({ fetchAutocompleteSuggestions })

    render(<AutocompleteInput apiKey='test-key' placeholder='Address' onChangeAddress={vi.fn()} />)
    expect(window.google.maps.places.Autocomplete).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('Address'), { target: { value: 'cape' } })

    await waitFor(() => {
      expect(window.google.maps.places.Autocomplete).toHaveBeenCalledTimes(1)
    })
    expect(getPlacesApiMode()).toBe('legacy')
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('falls back to legacy when Google rejects Places API (New) with PERMISSION_DENIED', async () => {
    const fetchAutocompleteSuggestions = vi.fn(async () => {
      throw Object.assign(new Error('Request denied'), { code: 7 })
    })
    mockGoogle({ fetchAutocompleteSuggestions })

    render(<AutocompleteInput apiKey='test-key' placeholder='Address' onChangeAddress={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Address'), { target: { value: 'cape' } })

    await waitFor(() => {
      expect(window.google.maps.places.Autocomplete).toHaveBeenCalledTimes(1)
    })
    expect(getPlacesApiMode()).toBe('legacy')
  })

  it('stays on Places API (New) when the first request fails for a transient reason', async () => {
    const prediction = buildPrediction()
    const fetchAutocompleteSuggestions = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue({ suggestions: [{ placePrediction: prediction }] })
    mockGoogle({ fetchAutocompleteSuggestions })

    render(<AutocompleteInput apiKey='test-key' placeholder='Address' onChangeAddress={vi.fn()} />)
    const input = screen.getByPlaceholderText('Address')
    fireEvent.change(input, { target: { value: 'cape' } })

    await waitFor(() => {
      expect(fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1)
    })
    expect(getPlacesApiMode()).toBeNull()
    expect(window.google.maps.places.Autocomplete).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'cape town' } })
    expect(await screen.findByRole('option')).toBeTruthy()
    expect(getPlacesApiMode()).toBe('new')
  })

  it('reuses the detected legacy mode without calling Places API (New) again', async () => {
    const fetchAutocompleteSuggestions = vi.fn()
    mockGoogle({ fetchAutocompleteSuggestions })
    setPlacesApiMode('legacy')

    render(<AutocompleteInput apiKey='test-key' placeholder='Address' onChangeAddress={vi.fn()} />)
    await waitFor(() => {
      expect(window.google.maps.places.Autocomplete).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByPlaceholderText('Address'), { target: { value: 'cape' } })
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled()
  })

  it('keeps the new mode when a later Places API (New) request fails', async () => {
    const fetchAutocompleteSuggestions = vi.fn(async () => {
      throw new Error('network')
    })
    mockGoogle({ fetchAutocompleteSuggestions })
    setPlacesApiMode('new')

    render(<AutocompleteInput apiKey='test-key' placeholder='Address' onChangeAddress={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Address'), { target: { value: 'cape' } })

    await waitFor(() => {
      expect(fetchAutocompleteSuggestions).toHaveBeenCalled()
    })
    expect(getPlacesApiMode()).toBe('new')
    expect(window.google.maps.places.Autocomplete).not.toHaveBeenCalled()
  })

  it('closes the suggestions when the input is cleared or blurred', async () => {
    const onBlur = vi.fn()
    const fetchAutocompleteSuggestions = vi.fn(async () => ({ suggestions: [{ placePrediction: buildPrediction() }] }))
    mockGoogle({ fetchAutocompleteSuggestions })

    render(<AutocompleteInput apiKey='test-key' placeholder='Address' onBlur={onBlur} onChangeAddress={vi.fn()} />)
    const input = screen.getByPlaceholderText('Address')
    fireEvent.change(input, { target: { value: '1 Main' } })
    await screen.findByRole('option')

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('option')).toBeNull()

    fireEvent.change(input, { target: { value: '1 Main R' } })
    await screen.findByRole('option')
    fireEvent.blur(input)
    expect(screen.queryByRole('option')).toBeNull()
    expect(onBlur).toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '' } })
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('detects Places API (New) being unavailable for the project or the key', () => {
    expect(isPlacesApiNotEnabledError(new Error('Places API (New) has not been used in project 1 before or it is disabled.'))).toBe(true)
    expect(isPlacesApiNotEnabledError(new Error('Requests to this API places.googleapis.com method google.maps.places.v1.Places.AutocompletePlaces are blocked.'))).toBe(true)
    expect(isPlacesApiNotEnabledError({ code: 'PERMISSION_DENIED', message: 'Request denied' })).toBe(true)
    expect(isPlacesApiNotEnabledError({ code: 7, message: 'Request denied' })).toBe(true)
    expect(isPlacesApiNotEnabledError(new Error('Failed to fetch'))).toBe(false)
    expect(isPlacesApiNotEnabledError(undefined)).toBe(false)
  })

  it('closes the suggestions on Escape without letting the key reach window listeners', async () => {
    const windowKeyDown = vi.fn()
    window.addEventListener('keydown', windowKeyDown)
    const fetchAutocompleteSuggestions = vi.fn(async () => ({ suggestions: [{ placePrediction: buildPrediction() }] }))
    mockGoogle({ fetchAutocompleteSuggestions })

    render(<AutocompleteInput apiKey='test-key' placeholder='Address' onChangeAddress={vi.fn()} />)
    const input = screen.getByPlaceholderText('Address')
    fireEvent.change(input, { target: { value: '1 Main' } })
    await screen.findByRole('option')

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByRole('option')).toBeNull()
    expect(windowKeyDown).not.toHaveBeenCalled()
    window.removeEventListener('keydown', windowKeyDown)
  })

  it('returns null for places without address components', () => {
    expect(placeToAddress({ name: 'typed text' })).toBeNull()
    expect(placeToAddress(null)).toBeNull()
  })
})
