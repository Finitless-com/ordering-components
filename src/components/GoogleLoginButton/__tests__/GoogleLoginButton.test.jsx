import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'
import { setupGapi, resetSocialAuthDom } from '../../../__tests__/helpers/socialAuthTestHelpers'

const social = vi.hoisted(() => {
  const mockAuthGoogle = vi.fn()
  const mockOrdering = {
    appId: 'app',
    appInternalName: 'web',
    root: 'https://api.test',
    setAccessToken: vi.fn(function () { return mockOrdering }),
    users: vi.fn(() => ({ authGoogle: mockAuthGoogle }))
  }
  const reset = () => {
    vi.clearAllMocks()
    resetSocialAuthDom()
    mockAuthGoogle.mockResolvedValue({
      content: { error: false, result: { id: 10, session: { access_token: 'g-tok' } } }
    })
  }
  return { mockAuthGoogle, mockOrdering, reset }
})

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [social.mockOrdering]
}))

import { GoogleLoginButton } from '../index'

describe('GoogleLoginButton', () => {
  beforeEach(() => social.reset())

  it('exposes signIn and signOut handlers', async () => {
    setupGapi()
    renderController(GoogleLoginButton, { initParams: { client_id: 'cid' } })
    const script = document.getElementById('google-login')
    script?.onload?.()
    await waitFor(() => {
      expect(lastControllerProps.googleStatus.loaded).toBe(true)
    })
    expect(typeof lastControllerProps.signIn).toBe('function')
    expect(typeof lastControllerProps.signOut).toBe('function')
  })

  it('delegates to handleGoogleLoginClick when provided', async () => {
    setupGapi()
    const handleGoogleLoginClick = vi.fn()
    renderController(GoogleLoginButton, { handleGoogleLoginClick, initParams: {} })
    document.getElementById('google-login')?.onload?.()
    await waitFor(() => {
      expect(lastControllerProps.googleStatus.loaded).toBe(true)
    })
    await lastControllerProps.signIn()
    await waitFor(() => {
      expect(handleGoogleLoginClick).toHaveBeenCalled()
    })
  })

  it('authenticates with backend on successful Google sign-in', async () => {
    const { signIn } = setupGapi()
    const handleSuccessGoogleLogin = vi.fn()
    renderController(GoogleLoginButton, { handleSuccessGoogleLogin, initParams: {} })
    document.getElementById('google-login')?.onload?.()
    await waitFor(() => {
      expect(lastControllerProps.googleStatus.loaded).toBe(true)
    })
    await lastControllerProps.signIn()
    await waitFor(() => {
      expect(social.mockAuthGoogle).toHaveBeenCalledWith({ access_token: 'google-id-token' })
    })
    expect(social.mockOrdering.setAccessToken).toHaveBeenCalledWith(null)
    expect(social.mockOrdering.setAccessToken.mock.invocationCallOrder[0])
      .toBeLessThan(social.mockOrdering.users.mock.invocationCallOrder[0])
    expect(handleSuccessGoogleLogin).toHaveBeenCalled()
    expect(signIn).toHaveBeenCalled()
  })
})
