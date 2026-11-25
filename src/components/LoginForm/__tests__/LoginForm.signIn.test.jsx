import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { EventProvider } from '../../../contexts/EventContext'

const signIn = vi.hoisted(() => {
  const mockT = (key, fallback) => fallback || key
  const mockLogin = vi.fn()
  const mockAuth = vi.fn()
  const mockSetAccessToken = vi.fn()
  const mockLogoutApi = vi.fn()
  const state = { testConfigs: { email_password_login_enabled: { value: '1' } } }
  const mockOrdering = {
    appId: 'app',
    appInternalName: 'driver_app',
    root: 'https://api.test',
    setAccessToken: (...args) => { mockSetAccessToken(...args); return mockOrdering },
    users: () => ({ auth: mockAuth, logout: mockLogoutApi })
  }
  const okResult = { id: 7, level: 4, session: { access_token: 'tok-7' } }
  return { mockT, mockLogin, mockAuth, mockSetAccessToken, mockLogoutApi, state, mockOrdering, okResult }
})

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ user: null, token: null, auth: false }, { login: signIn.mockLogin, logout: vi.fn() }]
}))
vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ language: { code: 'en' } }, signIn.mockT, vi.fn()]
}))
vi.mock('../../../contexts/ApiContext', () => ({ useApi: () => [signIn.mockOrdering] }))
vi.mock('../../../contexts/ConfigContext', () => ({ useConfig: () => [{ configs: signIn.state.testConfigs }] }))
vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => ({ socket: { connected: true, on: vi.fn(), off: vi.fn() }, getId: () => 'socket-1' })
}))

import { LoginForm } from '../index'

let formStates
let last
const Recorder = (props) => {
  last = props
  if (formStates[formStates.length - 1] !== props.formState) formStates.push(props.formState)
  return <div />
}

const mount = (props = {}) => render(
  <EventProvider>
    <LoginForm UIComponent={Recorder} allowedLevels={[4]} {...props} />
  </EventProvider>
)

const credentials = { email: 'driver@test.com', password: 'secret' }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject })
  return { promise, resolve, reject }
}

describe('LoginForm sign in', () => {
  beforeEach(() => {
    formStates = []
    last = null
    vi.clearAllMocks()
    signIn.mockAuth.mockResolvedValue({ content: { error: false, result: signIn.okResult } })
    signIn.mockLogin.mockResolvedValue(signIn.okResult)
    signIn.mockLogoutApi.mockResolvedValue({ content: { error: false } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('defaults (no opt in): same as before', () => {
    it('sends the same request and goes idle -> loading and stays loading on success', async () => {
      const handleSuccessLogin = vi.fn()
      mount({ handleSuccessLogin })
      let ok
      await act(async () => { ok = await last.handleButtonLoginClick(credentials) })

      expect(ok).toBe(true)
      expect(signIn.mockSetAccessToken).toHaveBeenCalledWith(null)
      expect(signIn.mockAuth).toHaveBeenCalledTimes(1)
      expect(signIn.mockAuth).toHaveBeenCalledWith(
        { email: 'driver@test.com', password: 'secret' },
        { headers: { 'X-App-X': 'app', 'X-INTERNAL-PRODUCT-X': 'driver_app' } }
      )
      expect(signIn.mockLogin).toHaveBeenCalledWith({ user: signIn.okResult, token: 'tok-7' })
      expect(handleSuccessLogin).toHaveBeenCalledWith(signIn.okResult)
      // exact formState transitions: the spinner is never turned off on success
      expect(formStates).toEqual([
        { loading: false, result: { error: false } },
        { loading: true, result: { error: false } }
      ])
    })

    it('reports a wrong password as before', async () => {
      signIn.mockAuth.mockResolvedValueOnce({ content: { error: true, result: ['Invalid credentials'] } })
      mount()
      let ok
      await act(async () => { ok = await last.handleButtonLoginClick(credentials) })
      expect(ok).toBe(false)
      expect(signIn.mockLogin).not.toHaveBeenCalled()
      // loading and the error land in the same batch: the UI never renders the intermediate state
      expect(formStates).toEqual([
        { loading: false, result: { error: false } },
        { loading: false, result: { error: true, result: ['Invalid credentials'] } }
      ])
    })

    it('reports a network failure as before (message string, no code)', async () => {
      signIn.mockAuth.mockRejectedValueOnce(new Error('Network down'))
      mount()
      await act(async () => { await last.handleButtonLoginClick(credentials) })
      expect(last.formState).toEqual({ loading: false, result: { error: true, result: 'Network down' } })
    })
  })

  describe('awaits the session being stored', () => {
    it('does not emit success nor resolve until login() resolves, and signals loginCompleted', async () => {
      const storing = deferred()
      signIn.mockLogin.mockReturnValueOnce(storing.promise)
      const handleSuccessLogin = vi.fn()
      mount({ handleSuccessLogin })
      expect(last.loginCompleted).toBe(false)

      let done = false
      let click
      await act(async () => {
        click = last.handleButtonLoginClick(credentials).then((value) => { done = value })
      })
      expect(signIn.mockLogin).toHaveBeenCalled()
      expect(handleSuccessLogin).not.toHaveBeenCalled()
      expect(done).toBe(false)
      expect(last.loginCompleted).toBe(false)
      expect(last.formState.loading).toBe(true)

      await act(async () => { storing.resolve(); await click })
      expect(done).toBe(true)
      expect(handleSuccessLogin).toHaveBeenCalledTimes(1)
      expect(last.loginCompleted).toBe(true)
      // the continuous spinner is kept: loading ends only when the app leaves the form
      expect(last.formState).toEqual({ loading: true, result: { error: false } })
    })

    it('reports ERROR_SESSION_STORAGE and turns loading off when login() rejects', async () => {
      signIn.mockLogin.mockRejectedValueOnce(new Error('disk full'))
      const handleSuccessLogin = vi.fn()
      mount({ handleSuccessLogin })
      let ok
      await act(async () => { ok = await last.handleButtonLoginClick(credentials) })
      expect(ok).toBe(false)
      expect(handleSuccessLogin).not.toHaveBeenCalled()
      expect(last.loginCompleted).toBe(false)
      expect(last.formState).toEqual({
        loading: false,
        result: {
          error: true,
          result: ['The session could not be saved on this device'],
          code: 'ERROR_SESSION_STORAGE',
          reason: 'disk full'
        }
      })
    })

    it('a new attempt clears loginCompleted', async () => {
      mount()
      await act(async () => { await last.handleButtonLoginClick(credentials) })
      expect(last.loginCompleted).toBe(true)
      const storing = deferred()
      signIn.mockLogin.mockReturnValueOnce(storing.promise)
      let click
      await act(async () => { click = last.handleButtonLoginClick(credentials) })
      expect(last.loginCompleted).toBe(false)
      await act(async () => { storing.resolve(); await click })
      expect(last.loginCompleted).toBe(true)
    })

    it('OTP login: a rejecting login() ends in the error state with loading off', async () => {
      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ error: false, result: signIn.okResult }) })
      signIn.mockLogin.mockRejectedValueOnce(new Error('disk full'))
      mount()
      await act(async () => { await last.handleCheckPhoneCode({ cellphone: '5551234', code: '123456' }) })
      expect(last.checkPhoneCodeState).toEqual({ loading: false, result: { error: 'disk full' } })
      global.fetch = originalFetch
    })

    it('Spoonity login: a rejecting login() ends in the error state with loading off', async () => {
      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ error: false, result: signIn.okResult }) })
      signIn.mockLogin.mockRejectedValueOnce(new Error('disk full'))
      mount()
      await act(async () => { await last.handleLoginSpoonity() })
      expect(last.formState).toEqual({ loading: false, result: { error: true, result: 'disk full' } })
      global.fetch = originalFetch
    })
  })

  describe('requestTimeout (opt in)', () => {
    it('without the prop the auth call has no cancel token', async () => {
      mount()
      await act(async () => { await last.handleButtonLoginClick(credentials) })
      expect(Object.keys(signIn.mockAuth.mock.calls[0][1])).toEqual(['headers'])
    })

    it('answers in time: signs in, and the timer is cleared', async () => {
      vi.useFakeTimers()
      mount({ requestTimeout: 30000 })
      let ok
      await act(async () => { ok = await last.handleButtonLoginClick(credentials) })
      expect(ok).toBe(true)
      expect(signIn.mockAuth.mock.calls[0][1].cancelToken).toEqual({})
      expect(vi.getTimerCount()).toBe(0)
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(last.formState).toEqual({ loading: true, result: { error: false } })
    })

    it('expires: aborts the request, reports ERROR_REQUEST_TIMEOUT and turns loading off', async () => {
      vi.useFakeTimers()
      const cancel = vi.fn()
      signIn.mockAuth.mockImplementationOnce((creds, options) => {
        options.cancelToken.cancel = cancel
        return new Promise(() => {}) // the SDK never settles an aborted request
      })
      const handleSuccessLogin = vi.fn()
      mount({ requestTimeout: 5000, handleSuccessLogin })
      let click
      let ok
      await act(async () => { click = last.handleButtonLoginClick(credentials).then((value) => { ok = value }) })
      expect(last.formState.loading).toBe(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(4999) })
      expect(last.formState.loading).toBe(true)
      expect(cancel).not.toHaveBeenCalled()
      await act(async () => { await vi.advanceTimersByTimeAsync(1); await click })
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(ok).toBe(false)
      expect(signIn.mockLogin).not.toHaveBeenCalled()
      expect(handleSuccessLogin).not.toHaveBeenCalled()
      expect(last.formState).toEqual({
        loading: false,
        result: { error: true, result: 'The request took too long. Please try again', code: 'ERROR_REQUEST_TIMEOUT' }
      })
    })

    it('a late answer never signs the user in behind the error', async () => {
      vi.useFakeTimers()
      const late = deferred()
      signIn.mockAuth.mockReturnValueOnce(late.promise) // an SDK that does not stop on cancel
      mount({ requestTimeout: 1000 })
      let click
      await act(async () => { click = last.handleButtonLoginClick(credentials) })
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); await click })
      expect(last.formState.result.code).toBe('ERROR_REQUEST_TIMEOUT')
      await act(async () => { late.resolve({ content: { error: false, result: signIn.okResult } }); await Promise.resolve() })
      expect(signIn.mockLogin).not.toHaveBeenCalled()
      expect(last.formState.result.code).toBe('ERROR_REQUEST_TIMEOUT')
      expect(last.loginCompleted).toBe(false)
    })

    it('a late failure is swallowed (no unhandled rejection)', async () => {
      vi.useFakeTimers()
      const late = deferred()
      signIn.mockAuth.mockReturnValueOnce(late.promise)
      mount({ requestTimeout: 1000 })
      let click
      await act(async () => { click = last.handleButtonLoginClick(credentials) })
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); await click })
      late.reject(new Error('aborted'))
      await Promise.resolve()
      expect(last.formState.result.code).toBe('ERROR_REQUEST_TIMEOUT')
    })

    it('ignores a non positive or invalid value', async () => {
      mount({ requestTimeout: 0 })
      await act(async () => { await last.handleButtonLoginClick(credentials) })
      expect(Object.keys(signIn.mockAuth.mock.calls[0][1])).toEqual(['headers'])
    })
  })
})
