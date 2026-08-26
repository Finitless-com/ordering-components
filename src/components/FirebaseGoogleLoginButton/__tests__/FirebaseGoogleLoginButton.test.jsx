import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'
import { resetSocialAuthDom } from '../../../__tests__/helpers/socialAuthTestHelpers'

const social = vi.hoisted(() => {
  const mockAuthGoogle = vi.fn()
  const mockSignInWithPopup = vi.fn()
  const mockGetAuth = vi.fn(() => ({}))
  const mockInitializeApp = vi.fn()
  const mockOrdering = {
    setAccessToken: vi.fn(function () { return mockOrdering }),
    users: vi.fn(() => ({ authGoogle: mockAuthGoogle }))
  }
  const reset = () => {
    vi.clearAllMocks()
    resetSocialAuthDom()
    mockAuthGoogle.mockResolvedValue({
      content: { error: false, result: { id: 10, session: { access_token: 'g-tok' } } }
    })
    mockSignInWithPopup.mockResolvedValue({
      _tokenResponse: {
        oauthIdToken: 'firebase-token',
        firstName: 'Ada',
        lastName: 'Lovelace'
      }
    })
  }
  return {
    mockAuthGoogle,
    mockSignInWithPopup,
    mockGetAuth,
    mockInitializeApp,
    mockOrdering,
    reset
  }
})

vi.mock('firebase/app', () => ({
  initializeApp: (...args) => social.mockInitializeApp(...args)
}))

vi.mock('firebase/auth', () => ({
  getAuth: (...args) => social.mockGetAuth(...args),
  signInWithPopup: (...args) => social.mockSignInWithPopup(...args),
  GoogleAuthProvider: vi.fn().mockImplementation(() => ({
    setCustomParameters: vi.fn()
  }))
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [social.mockOrdering]
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ user: { id: 3, guest_id: 'guest-1' } }, { login: vi.fn() }]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{
    configs: {
      google_login_api_key: { value: 'firebase-key' },
      google_login_auth_domain: { value: 'app.firebaseapp.com' }
    }
  }]
}))

import { FirebaseGoogleLoginButton } from '../index'

describe('FirebaseGoogleLoginButton', () => {
  beforeEach(() => social.reset())

  it('exposes signInWithGoogle handler', () => {
    renderController(FirebaseGoogleLoginButton, {})
    expect(typeof lastControllerProps.signInWithGoogle).toBe('function')
  })

  it('signs in with firebase and authenticates via API', async () => {
    const handleSuccessGoogleLogin = vi.fn()
    renderController(FirebaseGoogleLoginButton, { handleSuccessGoogleLogin, isGuest: true })
    await lastControllerProps.signInWithGoogle()
    await waitFor(() => {
      expect(social.mockInitializeApp).toHaveBeenCalled()
    })
    expect(social.mockSignInWithPopup).toHaveBeenCalled()
    expect(social.mockAuthGoogle).toHaveBeenCalledWith({
      access_token: 'firebase-token',
      name: 'Ada',
      lastname: 'Lovelace',
      guest_token: 'guest-1'
    })
    expect(social.mockOrdering.setAccessToken).toHaveBeenCalledWith(null)
    expect(social.mockOrdering.setAccessToken.mock.invocationCallOrder[0])
      .toBeLessThan(social.mockOrdering.users.mock.invocationCallOrder[0])
    expect(handleSuccessGoogleLogin).toHaveBeenCalled()
  })
})
