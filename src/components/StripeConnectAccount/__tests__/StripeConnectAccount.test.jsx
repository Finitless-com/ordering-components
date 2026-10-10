import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const auth = vi.hoisted(() => {
  const mockOrdering = {
    appId: 'app',
    appInternalName: 'driver_app',
    root: 'https://api.test'
  }
  const mockSocket = {
    getId: () => 'socket-1'
  }
  const session = { user: { id: 6 }, token: 'tok' }
  const reset = () => {
    vi.clearAllMocks()
    session.user = { id: 6 }
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ error: false, result: null })
    })
  }
  return { mockOrdering, mockSocket, session, reset }
})

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [auth.session, {}]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [auth.mockOrdering]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => auth.mockSocket
}))

import { StripeConnectAccount } from '../index'

const account = {
  id: 4,
  owner_type: 'driver',
  owner_id: 6,
  account_id: 'acct_1',
  sandbox: true,
  details_submitted: true,
  payouts_enabled: true,
  transfers_enabled: true,
  requirements: { currently_due: [], past_due: [], disabled_reason: null }
}

const answer = (body) => ({ json: async () => body })

describe('StripeConnectAccount', () => {
  beforeEach(() => auth.reset())

  it('loads the account of the session user', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer({ error: false, result: account }))
    renderController(StripeConnectAccount, {})
    await waitFor(() => {
      expect(lastControllerProps.accountState.loading).toBe(false)
    })
    expect(lastControllerProps.accountState.account).toEqual(account)
    expect(lastControllerProps.accountState.error).toBeNull()
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('https://api.test/users/6/stripe_connect_account')
    expect(options.method).toBe('GET')
    expect(options.headers.Authorization).toBe('Bearer tok')
    expect(options.headers['X-App-X']).toBe('app')
    expect(options.headers['X-INTERNAL-PRODUCT-X']).toBe('driver_app')
    expect(options.headers['X-Socket-Id-X']).toBe('socket-1')
  })

  it('keeps a null account while the user has not started the onboarding', async () => {
    renderController(StripeConnectAccount, {})
    await waitFor(() => {
      expect(lastControllerProps.accountState.loading).toBe(false)
    })
    expect(lastControllerProps.accountState.account).toBeNull()
    expect(lastControllerProps.accountState.error).toBeNull()
  })

  it('loads the account of the user given by userId', async () => {
    renderController(StripeConnectAccount, { userId: 13 })
    await waitFor(() => {
      expect(lastControllerProps.accountState.loading).toBe(false)
    })
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.test/users/13/stripe_connect_account')
  })

  it('does not ask for an account without a user', async () => {
    auth.session.user = null
    renderController(StripeConnectAccount, {})
    await waitFor(() => {
      expect(lastControllerProps.accountState.loading).toBe(false)
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('sets the error the API answers with', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer({ error: true, result: ['ERROR_USER_FIND'] }))
    renderController(StripeConnectAccount, {})
    await waitFor(() => {
      expect(lastControllerProps.accountState.loading).toBe(false)
    })
    expect(lastControllerProps.accountState.error).toEqual(['ERROR_USER_FIND'])
    expect(lastControllerProps.accountState.account).toBeNull()
  })

  it('sets the error when the request fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network request failed'))
    renderController(StripeConnectAccount, {})
    await waitFor(() => {
      expect(lastControllerProps.accountState.loading).toBe(false)
    })
    expect(lastControllerProps.accountState.error).toEqual(['Network request failed'])
  })

  it('refreshes the account and keeps the last one when the refresh fails', async () => {
    const pending = { ...account, details_submitted: false, transfers_enabled: false }
    global.fetch = vi.fn()
      .mockResolvedValueOnce(answer({ error: false, result: pending }))
      .mockResolvedValueOnce(answer({ error: false, result: account }))
      .mockRejectedValueOnce(new Error('Network request failed'))
    renderController(StripeConnectAccount, {})
    await waitFor(() => {
      expect(lastControllerProps.accountState.account).toEqual(pending)
    })
    await act(async () => {
      await lastControllerProps.handleGetAccount()
    })
    expect(lastControllerProps.accountState.account).toEqual(account)
    await act(async () => {
      await lastControllerProps.handleGetAccount()
    })
    expect(lastControllerProps.accountState.account).toEqual(account)
    expect(lastControllerProps.accountState.error).toEqual(['Network request failed'])
    expect(lastControllerProps.accountState.loading).toBe(false)
  })

  it('gets the url of the onboarding form', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(answer({ error: false, result: null }))
      .mockResolvedValueOnce(answer({ error: false, result: { url: 'https://connect.stripe.com/setup/e/acct_1/abc' } }))
    renderController(StripeConnectAccount, {})
    await waitFor(() => {
      expect(lastControllerProps.accountState.loading).toBe(false)
    })
    let url
    await act(async () => {
      url = await lastControllerProps.handleGetOnboardingUrl()
    })
    expect(url).toBe('https://connect.stripe.com/setup/e/acct_1/abc')
    const [requestUrl, options] = global.fetch.mock.calls[1]
    expect(requestUrl).toBe('https://api.test/users/6/stripe_connect_account/onboarding')
    expect(options.method).toBe('POST')
    expect(lastControllerProps.onboardingState).toEqual({ loading: false, error: null })
  })

  it('returns null and sets the error when the onboarding form cannot be created', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(answer({ error: false, result: null }))
      .mockResolvedValueOnce(answer({ error: true, result: ['ERROR_STRIPE_CONNECT_PAYOUTS_DISABLED'] }))
    renderController(StripeConnectAccount, {})
    await waitFor(() => {
      expect(lastControllerProps.accountState.loading).toBe(false)
    })
    let url
    await act(async () => {
      url = await lastControllerProps.handleGetOnboardingUrl()
    })
    expect(url).toBeNull()
    expect(lastControllerProps.onboardingState).toEqual({
      loading: false,
      error: ['ERROR_STRIPE_CONNECT_PAYOUTS_DISABLED']
    })
  })

  it('returns null and sets the error when the onboarding request fails', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(answer({ error: false, result: null }))
      .mockRejectedValueOnce(new Error('Network request failed'))
    renderController(StripeConnectAccount, {})
    await waitFor(() => {
      expect(lastControllerProps.accountState.loading).toBe(false)
    })
    let url
    await act(async () => {
      url = await lastControllerProps.handleGetOnboardingUrl()
    })
    expect(url).toBeNull()
    expect(lastControllerProps.onboardingState.error).toEqual(['Network request failed'])
  })
})
