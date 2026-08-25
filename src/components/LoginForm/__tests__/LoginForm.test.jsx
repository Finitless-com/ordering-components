import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const auth = vi.hoisted(() => {
  const mockT = (key, fallback) => fallback || key
  const mockLogin = vi.fn()
  const mockLogout = vi.fn()
  const mockAuth = vi.fn()
  const mockLogoutApi = vi.fn()
  const state = { testConfigs: { email_password_login_enabled: { value: '1' } } }
  const mockOrdering = {
    appId: 'app',
    appInternalName: 'web',
    root: 'https://api.test',
    setAccessToken: vi.fn(function () { return mockOrdering }),
    users: vi.fn(() => ({ auth: mockAuth, logout: mockLogoutApi }))
  }
  const mockSocket = {
    socket: { connected: true, on: vi.fn(), off: vi.fn() },
    getId: () => 'socket-1'
  }
  const reset = () => {
    state.testConfigs = { email_password_login_enabled: { value: '1' } }
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({
      content: { error: false, result: { id: 1, level: 3, session: { access_token: 'new-tok' } } }
    })
    mockLogoutApi.mockResolvedValue({ content: { error: false } })
  }
  return { mockT, mockLogin, mockLogout, mockAuth, mockLogoutApi, state, mockOrdering, mockSocket, reset }
})

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    user: { id: 5, session_strategy: 'jwt_session' },
    token: 'tok',
    auth: true
  }, { login: auth.mockLogin, logout: auth.mockLogout }]
}))

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ language: { code: 'en' } }, auth.mockT, vi.fn()]
}))

vi.mock('../../../contexts/EventContext', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useEvent: () => [{ emit: vi.fn() }] }
})

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [auth.mockOrdering]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{ configs: auth.state.testConfigs }]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => auth.mockSocket
}))

import { LoginForm } from '../index'

describe('LoginForm', () => {
  beforeEach(() => auth.reset())

  it('exposes login handlers and default tab', () => {
    renderController(LoginForm, { allowedLevels: [3] })
    expect(lastControllerProps.loginTab).toBe('email')
    expect(typeof lastControllerProps.handleButtonLoginClick).toBe('function')
    expect(lastControllerProps.credentials).toEqual({ email: '', cellphone: '', password: '' })
    expect(lastControllerProps.useLoginByEmail).toBe(true)
  })

  it('defaults to cellphone tab when email login is disabled', () => {
    auth.state.testConfigs = {
      email_password_login_enabled: { value: '0' },
      phone_password_login_enabled: { value: '1' }
    }
    renderController(LoginForm, {})
    expect(lastControllerProps.loginTab).toBe('cellphone')
    expect(lastControllerProps.useLoginByCellphone).toBe(true)
  })

  it('delegates to handleCustomLogin when provided', async () => {
    const handleCustomLogin = vi.fn()
    renderController(LoginForm, { handleCustomLogin })
    await lastControllerProps.handleButtonLoginClick({ email: 'a@test.com', password: 'x' })
    expect(handleCustomLogin).toHaveBeenCalled()
  })

  it('authenticates via API and logs in on success', async () => {
    const handleSuccessLogin = vi.fn()
    renderController(LoginForm, { allowedLevels: [3], handleSuccessLogin })
    const ok = await lastControllerProps.handleButtonLoginClick({ email: 'a@test.com', password: 'secret' })
    expect(ok).toBe(true)
    expect(auth.mockAuth).toHaveBeenCalled()
    expect(auth.mockLogin).toHaveBeenCalled()
    expect(handleSuccessLogin).toHaveBeenCalled()
  })

  it('rejects login when user level is not allowed', async () => {
    auth.mockAuth.mockResolvedValueOnce({
      content: {
        error: false,
        result: { id: 2, level: 9, session: { access_token: 'bad-tok' } }
      }
    })
    renderController(LoginForm, { allowedLevels: [3] })
    const ok = await lastControllerProps.handleButtonLoginClick({ email: 'a@test.com', password: 'secret' })
    expect(ok).toBeUndefined()
    expect(auth.mockLogin).not.toHaveBeenCalled()
    expect(auth.mockLogoutApi).toHaveBeenCalled()
    expect(auth.mockLogout).not.toHaveBeenCalled()
  })

  it('returns false when auth API reports an error', async () => {
    auth.mockAuth.mockResolvedValueOnce({
      content: { error: true, result: ['Invalid credentials'] }
    })
    renderController(LoginForm, { allowedLevels: [3] })
    const ok = await lastControllerProps.handleButtonLoginClick({ email: 'a@test.com', password: 'wrong' })
    expect(ok).toBe(false)
    await waitFor(() => {
      expect(lastControllerProps.formState.result.error).toBe(true)
    })
  })

  it('rejects OTP login when user level is not allowed', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        error: false,
        result: { id: 9, level: 3, session: { access_token: 'otp-tok' } }
      })
    })
    renderController(LoginForm, { allowedLevels: [4] })
    await lastControllerProps.handleCheckPhoneCode({ cellphone: '5551234', code: '123456' })
    expect(auth.mockLogin).not.toHaveBeenCalled()
    expect(auth.mockLogout).not.toHaveBeenCalled()
    expect(auth.mockLogoutApi).toHaveBeenCalled()
    global.fetch = originalFetch
  })

  it('logs in via OTP when user level is allowed', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        error: false,
        result: { id: 4, level: 4, session: { access_token: 'otp-tok' } }
      })
    })
    renderController(LoginForm, { allowedLevels: [4] })
    await lastControllerProps.handleCheckPhoneCode({ cellphone: '5551234', code: '123456' })
    expect(auth.mockLogin).toHaveBeenCalled()
    global.fetch = originalFetch
  })

  it('rejects Spoonity login when user level is not allowed', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        error: false,
        result: { id: 9, level: 3, session: { access_token: 'spoon-tok' } }
      })
    })
    renderController(LoginForm, { allowedLevels: [0, 2] })
    lastControllerProps.handleChangeInput({ target: { name: 'email', value: 'a@test.com' } })
    lastControllerProps.handleChangeInput({ target: { name: 'password', value: 'secret' } })
    await lastControllerProps.handleLoginSpoonity()
    expect(auth.mockLogin).not.toHaveBeenCalled()
    expect(auth.mockLogout).not.toHaveBeenCalled()
    expect(auth.mockLogoutApi).toHaveBeenCalled()
    global.fetch = originalFetch
  })
})
