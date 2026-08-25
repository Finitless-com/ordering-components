import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const addr = vi.hoisted(() => {
  const {
    createAddressApiMocks,
    applyDefaultAddressMockImplementations,
    buildMockOrdering,
    defaultAddressConfigs
  } = require('../../../__tests__/helpers/addressPhoneTestHelpers')
  const api = createAddressApiMocks(vi)
  const mockOrdering = buildMockOrdering(vi, api)
  const reset = () => {
    vi.clearAllMocks()
    window.localStorage.clear()
    applyDefaultAddressMockImplementations(vi, api)
  }
  return { ...api, mockOrdering, reset, defaultAddressConfigs }
})

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ auth: true, user: { id: 8 }, token: 'session-tok' }]
}))

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ language: { code: 'en' } }, (key, fallback) => fallback || key]
}))

vi.mock('../../../contexts/BusinessContext', () => ({
  useBusiness: () => [{ business: { id: 3, address: '123 Main', location: { lat: 1, lng: 2 } } }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [{ options: { type: 1 } }, { setUserCustomerOptions: vi.fn() }]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{ configs: addr.defaultAddressConfigs }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [addr.mockOrdering]
}))

// eslint-disable-next-line import/first
import { PhoneAutocomplete } from '../index'

describe('PhoneAutocomplete', () => {
  beforeEach(() => addr.reset())

  it('exposes phone lookup handlers', () => {
    renderController(PhoneAutocomplete, {})
    expect(typeof lastControllerProps.onChangeNumber).toBe('function')
    expect(typeof lastControllerProps.getUsers).toBe('function')
    expect(typeof lastControllerProps.checkAddress).toBe('function')
  })

  it('searches users when phone has enough digits', async () => {
    renderController(PhoneAutocomplete, { isIos: true })
    lastControllerProps.onChangeNumber('5551234567')
    await waitFor(() => {
      expect(lastControllerProps.customersPhones.fetched).toBe(true)
    }, { timeout: 3000 })
    expect(addr.mockUsersSearchGet).toHaveBeenCalled()
  })

  it('checks whether two addresses match', () => {
    renderController(PhoneAutocomplete, {})
    const a = { address: '123 Main', location: { lat: 1, lng: 2 } }
    const b = { address: '123 Main', location: { lat: 1, lng: 2 } }
    expect(lastControllerProps.checkAddress(a, b)).toBe(true)
    expect(lastControllerProps.checkAddress(a, { address: 'Other', location: { lat: 0, lng: 0 } })).toBe(false)
  })

  it('renders when user-customer storage is corrupt JSON', () => {
    window.localStorage.setItem('user-customer', 'undefined')
    expect(() => renderController(PhoneAutocomplete, {})).not.toThrow()
    expect(lastControllerProps.customersPhones.users).toEqual([])
  })
})
