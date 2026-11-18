import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'
import { resetSocialAuthDom } from '../../../__tests__/helpers/socialAuthTestHelpers'

const mockLogout = vi.fn()
const mockSetStateInitialValues = vi.fn()

const { configTuple } = vi.hoisted(() => ({
  configTuple: [{ configs: {} }]
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ user: { id: 1, level: 0 }, token: 'tok', auth: true }, { logout: mockLogout }]
}))

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [{ options: { type: 1 } }, { setStateInitialValues: mockSetStateInitialValues }]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => configTuple
}))

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{}, (key, fallback) => fallback || key]
}))

const mockOrdering = {
  setAccessToken: vi.fn(function () { return mockOrdering }),
  users: vi.fn(() => ({
    logout: vi.fn().mockResolvedValue({ content: { error: false, result: {} } })
  }))
}

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [mockOrdering]
}))

import { LogoutAction } from '../index'

describe('LogoutAction', () => {
  beforeEach(() => {
    configTuple[0].configs = {}
    resetSocialAuthDom()
    delete window.fbAsyncInit
  })

  it('exposes handleLogoutClick', () => {
    renderController(LogoutAction, { handleSuccessLogout: vi.fn() })
    expect(typeof lastControllerProps.handleLogoutClick).toBe('function')
    expect(lastControllerProps.formState.loading).toBe(false)
  })

  it('logs out via API and clears session', async () => {
    const handleSuccessLogout = vi.fn()
    renderController(LogoutAction, { handleSuccessLogout })
    const ok = await lastControllerProps.handleLogoutClick()
    expect(ok).toBe(true)
    expect(mockLogout).toHaveBeenCalled()
    expect(mockSetStateInitialValues).toHaveBeenCalled()
    expect(handleSuccessLogout).toHaveBeenCalled()
  })

  it('sends notification token on logout when provided', async () => {
    renderController(LogoutAction, {})
    await lastControllerProps.handleLogoutClick({
      notification_app: 'orderingapp',
      notification_token: 'push-token'
    })
    expect(mockOrdering.users).toHaveBeenCalled()
  })

  it.each([
    ['', ''],
    ['0', '0'],
    [0, '0 (number)'],
    ['Add your Facebook ID', 'placeholder text'],
    ['fb-app', 'non-numeric id']
  ])('does not load the Facebook SDK for an invalid facebook_id (%s → %s)', (facebookId) => {
    configTuple[0].configs = { facebook_id: { value: facebookId } }
    renderController(LogoutAction, {})
    expect(window.document.getElementById('facebook-jssdk')).toBeNull()
    expect(window.fbAsyncInit).toBeUndefined()
  })

  it('loads the Facebook SDK for a valid numeric facebook_id', () => {
    document.body.appendChild(document.createElement('script')) // anchor the sdk <script> insertion point
    configTuple[0].configs = { facebook_id: { value: '1234567890' } }
    renderController(LogoutAction, {})
    expect(window.document.getElementById('facebook-jssdk')).not.toBeNull()
    expect(typeof window.fbAsyncInit).toBe('function')
  })
})
