import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'
import { resetSocialAuthDom } from '../../../__tests__/helpers/socialAuthTestHelpers'

const social = vi.hoisted(() => {
  const mockAuthGoogle = vi.fn()
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
  }
  return { mockAuthGoogle, mockOrdering, reset }
})

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [social.mockOrdering]
}))

import { GoogleIdentityButton } from '../index'

describe('GoogleIdentityButton', () => {
  beforeEach(() => social.reset())

  it('loads identity script and exposes handleSigninSuccess', () => {
    renderController(GoogleIdentityButton, {})
    expect(document.getElementById('google-identity')).toBeTruthy()
    expect(typeof lastControllerProps.handleSigninSuccess).toBe('function')
  })

  it('delegates token to handleGoogleLoginClick when provided', async () => {
    const handleGoogleLoginClick = vi.fn()
    renderController(GoogleIdentityButton, { handleGoogleLoginClick })
    await lastControllerProps.handleSigninSuccess('identity-token')
    expect(handleGoogleLoginClick).toHaveBeenCalledWith('identity-token')
  })

  it('authenticates identity token with backend', async () => {
    const handleSuccessGoogleLogin = vi.fn()
    renderController(GoogleIdentityButton, { handleSuccessGoogleLogin })
    await lastControllerProps.handleSigninSuccess('identity-token')
    await waitFor(() => {
      expect(social.mockAuthGoogle).toHaveBeenCalledWith({ access_token: 'identity-token' })
    })
    expect(social.mockOrdering.setAccessToken).toHaveBeenCalledWith(null)
    expect(social.mockOrdering.setAccessToken.mock.invocationCallOrder[0])
      .toBeLessThan(social.mockOrdering.users.mock.invocationCallOrder[0])
    expect(handleSuccessGoogleLogin).toHaveBeenCalled()
  })
})
