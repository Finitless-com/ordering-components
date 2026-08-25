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

import { FacebookLoginButton } from '../index'

describe('FacebookLoginButton', () => {
  beforeEach(() => social.reset())

  it('loads SDK and exposes facebook handlers', async () => {
    setupFacebook()
    renderController(FacebookLoginButton, { appId: 'fb-app' })
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
    renderController(FacebookLoginButton, { appId: 'fb-app', handleButtonFacebookLoginClick })
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
      appId: 'fb-app',
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
    renderController(FacebookLoginButton, { appId: 'fb-app', handleSuccessFacebookLogout })
    window.fbAsyncInit?.()
    lastControllerProps.handleFacebookLogout()
    await waitFor(() => {
      expect(handleSuccessFacebookLogout).toHaveBeenCalled()
    })
    expect(lastControllerProps.facebookStatus.logged).toBe(false)
  })
})
