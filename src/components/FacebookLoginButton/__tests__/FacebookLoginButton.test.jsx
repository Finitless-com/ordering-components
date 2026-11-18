import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'
import { setupFacebook, resetSocialAuthDom } from '../../../__tests__/helpers/socialAuthTestHelpers'

const social = vi.hoisted(() => {
  const mockAuthFacebook = vi.fn()
  const mockOrdering = {
    setAccessToken: vi.fn(function () { return mockOrdering }),
    users: vi.fn(() => ({ authFacebook: mockAuthFacebook }))
  }
  const reset = () => {
    vi.clearAllMocks()
    resetSocialAuthDom()
    delete window.fbAsyncInit
    mockAuthFacebook.mockResolvedValue({
      content: { error: false, result: { id: 11, session: { access_token: 'f-tok' } } }
    })
  }
  return { mockAuthFacebook, mockOrdering, reset }
})

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [social.mockOrdering]
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ user: { id: 3, guest_id: 'guest-1' } }, { login: vi.fn() }]
}))

import { FacebookLoginButton, isValidFacebookAppId } from '../index'

describe('FacebookLoginButton', () => {
  beforeEach(() => social.reset())

  it('loads SDK and exposes facebook handlers', async () => {
    setupFacebook()
    renderController(FacebookLoginButton, { appId: '1234567890' })
    window.fbAsyncInit?.()
    await waitFor(() => {
      expect(lastControllerProps.facebookStatus.ready).toBe(true)
    })
    expect(typeof lastControllerProps.handleFacebookLogin).toBe('function')
    expect(typeof lastControllerProps.handleFacebookLogout).toBe('function')
  })

  it('delegates to custom facebook handler', async () => {
    setupFacebook()
    const handleButtonFacebookLoginClick = vi.fn()
    renderController(FacebookLoginButton, { appId: '1234567890', handleButtonFacebookLoginClick })
    window.fbAsyncInit?.()
    await waitFor(() => {
      expect(lastControllerProps.facebookStatus.ready).toBe(true)
    })
    await lastControllerProps.handleFacebookLogin()
    await waitFor(() => {
      expect(handleButtonFacebookLoginClick).toHaveBeenCalled()
    })
  })

  it('authenticates with backend on connected facebook login', async () => {
    setupFacebook()
    const handleSuccessFacebookLogin = vi.fn()
    renderController(FacebookLoginButton, {
      appId: '1234567890',
      handleSuccessFacebookLogin,
      isGuest: true
    })
    window.fbAsyncInit?.()
    await waitFor(() => {
      expect(lastControllerProps.facebookStatus.ready).toBe(true)
    })
    lastControllerProps.handleFacebookLogin()
    await waitFor(() => {
      expect(social.mockAuthFacebook).toHaveBeenCalledWith({
        access_token: 'fb-token',
        guest_token: 'guest-1'
      })
    })
    expect(social.mockOrdering.setAccessToken).toHaveBeenCalledWith(null)
    expect(social.mockOrdering.setAccessToken.mock.invocationCallOrder[0])
      .toBeLessThan(social.mockOrdering.users.mock.invocationCallOrder[0])
    expect(handleSuccessFacebookLogin).toHaveBeenCalled()
  })

  it('logs out through facebook SDK', async () => {
    setupFacebook()
    const handleSuccessFacebookLogout = vi.fn()
    renderController(FacebookLoginButton, { appId: '1234567890', handleSuccessFacebookLogout })
    window.fbAsyncInit?.()
    lastControllerProps.handleFacebookLogout()
    await waitFor(() => {
      expect(handleSuccessFacebookLogout).toHaveBeenCalled()
    })
    expect(lastControllerProps.facebookStatus.logged).toBe(false)
  })

  it.each([
    ['', ''],
    ['0', '0'],
    [0, '0 (number)'],
    ['Add your Facebook ID', 'placeholder text'],
    ['fb-app', 'non-numeric id']
  ])('does not load the SDK for an invalid appId (%s → %s)', (appId) => {
    setupFacebook()
    renderController(FacebookLoginButton, { appId })
    expect(window.document.getElementById('facebook-jssdk')).toBeNull()
    expect(window.fbAsyncInit).toBeUndefined()
  })

  it('loads the SDK for a valid numeric appId', () => {
    setupFacebook()
    renderController(FacebookLoginButton, { appId: '1234567890' })
    expect(window.document.getElementById('facebook-jssdk')).not.toBeNull()
    expect(typeof window.fbAsyncInit).toBe('function')
  })
})

describe('isValidFacebookAppId', () => {
  it('a digits-only, non-zero id', () => {
    expect(isValidFacebookAppId('1234567890')).toBe(true)
  })

  it('blank, zero or placeholder values', () => {
    expect(isValidFacebookAppId(null)).toBe(false)
    expect(isValidFacebookAppId(undefined)).toBe(false)
    expect(isValidFacebookAppId(0)).toBe(false)
    expect(isValidFacebookAppId('')).toBe(false)
    expect(isValidFacebookAppId('0')).toBe(false)
    expect(isValidFacebookAppId('Add your Facebook ID')).toBe(false)
    expect(isValidFacebookAppId('fb-app')).toBe(false)
  })
})
