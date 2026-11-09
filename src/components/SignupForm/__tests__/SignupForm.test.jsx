import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const auth = vi.hoisted(() => {
  const mockT = (key, fallback) => fallback || key
  const mockSave = vi.fn()
  const mockOrdering = {
    setAccessToken: vi.fn(function () { return mockOrdering }),
    users: vi.fn(() => ({ save: mockSave }))
  }
  const mockSocket = {
    socket: { connected: true, on: vi.fn(), off: vi.fn() },
    getId: () => 'socket-1'
  }
  const mockGetReferralCode = vi.fn()
  const mockConsumeReferralCode = vi.fn()
  const reset = () => {
    vi.clearAllMocks()
    mockGetReferralCode.mockResolvedValue('REF123')
    mockSave.mockResolvedValue({
      content: {
        error: false,
        result: { id: 99, session: { access_token: 'signup-tok' } },
        referral_attribution: { accepted: true, error_code: null }
      }
    })
  }
  return {
    mockT,
    mockSave,
    mockOrdering,
    mockSocket,
    mockGetReferralCode,
    mockConsumeReferralCode,
    reset
  }
})

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ user: { id: 5 }, token: 'tok', auth: true }, { login: vi.fn() }]
}))

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ language: { code: 'en' } }, auth.mockT, vi.fn()]
}))

vi.mock('../../../contexts/EventContext', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useEvent: () => [{ emit: vi.fn() }] }
})

vi.mock('../../../contexts/ValidationsFieldsContext', () => ({
  useValidationFields: () => [[{ fields: [] }]]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [auth.mockOrdering]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{ configs: {} }]
}))

vi.mock('../../../contexts/WebsocketContext', () => ({
  useWebsocket: () => auth.mockSocket
}))

vi.mock('../../../contexts/ReferralContext', () => ({
  useReferral: () => [{ referralCode: 'REF123' }, {
    getReferralCode: auth.mockGetReferralCode,
    consumeReferralCode: auth.mockConsumeReferralCode
  }]
}))

import { SignupForm } from '../index'

describe('SignupForm', () => {
  beforeEach(() => auth.reset())

  it('exposes signup state and handlers', () => {
    renderController(SignupForm, {})
    expect(typeof lastControllerProps.handleButtonSignupClick).toBe('function')
    expect(lastControllerProps.signupData).toBeDefined()
    expect(lastControllerProps.formState.loading).toBe(false)
  })

  it('delegates to handleCustomSignup when provided', async () => {
    const handleCustomSignup = vi.fn()
    renderController(SignupForm, { handleCustomSignup })
    await lastControllerProps.handleButtonSignupClick({ email: 'new@test.com', password: 'x' })
    expect(handleCustomSignup).toHaveBeenCalled()
  })

  it('creates user via API on default signup path', async () => {
    const handleSuccessSignup = vi.fn()
    renderController(SignupForm, { handleSuccessSignup })
    await lastControllerProps.handleButtonSignupClick({
      email: 'new@test.com',
      password: 'secret',
      cellphone: '5551234'
    })
    expect(auth.mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ referral_code: 'REF123' }),
      expect.any(Object)
    )
    expect(auth.mockConsumeReferralCode).toHaveBeenCalled()
    expect(handleSuccessSignup).toHaveBeenCalled()
  })

  it('keeps the referral code when signup does not settle attribution', async () => {
    auth.mockSave.mockResolvedValue({
      content: { error: false, result: { id: 99, session: { access_token: 'signup-tok' } } }
    })
    renderController(SignupForm, { handleSuccessSignup: vi.fn() })
    await lastControllerProps.handleButtonSignupClick({
      email: 'new@test.com',
      password: 'secret',
      cellphone: '5551234'
    })
    expect(auth.mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ referral_code: 'REF123' }),
      expect.any(Object)
    )
    expect(auth.mockConsumeReferralCode).not.toHaveBeenCalled()
  })

  it('updates signup data through handleChangeInput', async () => {
    renderController(SignupForm, {})
    lastControllerProps.handleChangeInput({ target: { name: 'email', value: 'typed@test.com' } })
    await waitFor(() => {
      expect(lastControllerProps.signupData.email).toBe('typed@test.com')
    })
  })
})
