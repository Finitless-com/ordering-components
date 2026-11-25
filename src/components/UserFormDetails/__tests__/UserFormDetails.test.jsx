import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const upm = vi.hoisted(() => {
  const { createUserProjectMiscTestContext } = require('../../../__tests__/helpers/userProjectMiscTestHelpers')
  return createUserProjectMiscTestContext(vi)
})

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => [{ loading: false, language: { code: 'en' } }, upm.mockT]
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => [[], { showToast: upm.mockShowToast }],
  ToastType: { error: 'error', success: 'success', info: 'info' }
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    loading: false,
    user: upm.sampleUser,
    token: 'session-tok'
  }, { changeUser: upm.mockChangeUser }]
}))

vi.mock('../../../contexts/CustomerContext', () => ({
  useCustomer: () => [{ user: upm.sampleUser }, { setUserCustomer: upm.mockSetUserCustomer }]
}))

vi.mock('../../../contexts/ValidationsFieldsContext', () => ({
  useValidationFields: () => [{
    loading: false,
    fields: {
      checkout: {
        name: { enabled: true, required: true },
        email: { enabled: true, required: false }
      }
    }
  }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [upm.mockOrdering, { setOrdering: upm.mockSetOrdering }]
}))

import { UserFormDetails } from '../index'

describe('UserFormDetails', () => {
  beforeEach(() => upm.reset())

  it('uses user prop without API fetch', () => {
    renderController(UserFormDetails, { user: upm.sampleUser })
    expect(lastControllerProps.userState.result.result).toEqual(upm.sampleUser)
    expect(lastControllerProps.userState.loading).toBe(false)
  })

  it('updates form changes through handleChangeInput', () => {
    renderController(UserFormDetails, { user: upm.sampleUser })
    act(() => {
      lastControllerProps.handleChangeInput({ target: { name: 'name', value: 'New Name' } })
    })
    expect(lastControllerProps.formState.changes.name).toBe('New Name')
  })

  it('evaluates showField and isRequiredField helpers', () => {
    renderController(UserFormDetails, { user: upm.sampleUser, useValidationFields: true })
    expect(lastControllerProps.showField('name')).toBe(true)
    expect(lastControllerProps.isRequiredField('name')).toBe(true)
    expect(lastControllerProps.isRequiredField('email')).toBe(false)
  })

  it('saves profile updates through API', async () => {
    renderController(UserFormDetails, {
      user: upm.sampleUser,
      onClose: upm.mockOnClose,
      handleSuccessUpdate: upm.mockHandleSuccessUpdate
    })
    act(() => {
      lastControllerProps.handleChangeInput({ target: { name: 'name', value: 'Updated' } })
    })
    await act(async () => {
      await lastControllerProps.handleButtonUpdateClick()
    })
    expect(upm.mockUserSave).toHaveBeenCalled()
    expect(upm.mockChangeUser).toHaveBeenCalled()
    expect(upm.mockOnClose).toHaveBeenCalled()
    expect(upm.mockHandleSuccessUpdate).toHaveBeenCalled()
  })

  it('sends phone verification code', async () => {
    renderController(UserFormDetails, { user: upm.sampleUser })
    await act(async () => {
      await lastControllerProps.handleSendVerifyCode({
        cellphone: '5551234567',
        country_phone_code: '1'
      })
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/auth/sms/twilio/verify',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('removes user account', async () => {
    renderController(UserFormDetails, { user: upm.sampleUser })
    await act(async () => {
      await lastControllerProps.handleRemoveAccount(8)
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/users/8',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('loads wallets when wallet flags are enabled', async () => {
    renderController(UserFormDetails, {
      user: upm.sampleUser,
      isWalletCashEnabled: true,
      isWalletPointsEnabled: true
    })
    await waitFor(() => {
      expect(lastControllerProps.wallets.loading).toBe(false)
    })
    expect(lastControllerProps.wallets.result.result.cash).toBeTruthy()
    expect(lastControllerProps.wallets.result.result.points).toBeTruthy()
  })

  describe('the photo', () => {
    it('is saved as it always was: the picture the caller gives, as `photo`', async () => {
      renderController(UserFormDetails, { user: upm.sampleUser, onClose: upm.mockOnClose })
      await act(async () => {
        await lastControllerProps.handleButtonUpdateClick(null, true, 'data:image/png;base64,AAAA')
      })
      expect(upm.mockUserSave).toHaveBeenCalledTimes(1)
      expect(upm.mockUserSave.mock.calls[0][0]).toEqual({ photo: 'data:image/png;base64,AAAA' })
      expect(upm.mockChangeUser).toHaveBeenCalled()
    })

    it('offers a way to remove it next to the ones it had', () => {
      renderController(UserFormDetails, { user: upm.sampleUser })
      expect(typeof lastControllerProps.handleRemovePhoto).toBe('function')
      expect(typeof lastControllerProps.handleButtonUpdateClick).toBe('function')
      expect(typeof lastControllerProps.handlechangeImage).toBe('function')
    })

    it('removes it by saving an empty `photo` (the API clears it; a null is refused and a missing photo changes nothing)', async () => {
      upm.mockUserSave.mockResolvedValue({ content: { error: false, result: { ...upm.sampleUser, photo: '' } } })
      renderController(UserFormDetails, {
        user: upm.sampleUser,
        onClose: upm.mockOnClose,
        handleSuccessUpdate: upm.mockHandleSuccessUpdate,
        useDefualtSessionManager: true
      })
      await act(async () => {
        await lastControllerProps.handleRemovePhoto()
      })
      expect(upm.mockUserSave).toHaveBeenCalledTimes(1)
      expect(upm.mockUserSave).toHaveBeenCalledWith({ photo: '' }, { accessToken: 'session-tok' })
      // The session's user takes the answer, as for a new photo.
      expect(upm.mockChangeUser).toHaveBeenCalledWith(expect.objectContaining({ id: upm.sampleUser.id, photo: '' }))
      expect(upm.mockHandleSuccessUpdate).toHaveBeenCalledWith(expect.objectContaining({ photo: '' }))
      expect(upm.mockOnClose).toHaveBeenCalled()
      expect(lastControllerProps.formState.loading).toBe(false)
      expect(lastControllerProps.formState.result.error).toBe(false)
    })

    it('does not leave edit mode, as the save of a photo does not', async () => {
      renderController(UserFormDetails, { user: upm.sampleUser, isEdit: true })
      await act(async () => {
        await lastControllerProps.handleRemovePhoto()
      })
      expect(lastControllerProps.isEdit).toBe(true)
    })

    it('drops a picture that was waiting to be saved', async () => {
      renderController(UserFormDetails, { user: upm.sampleUser })
      act(() => {
        lastControllerProps.handleChangeInput({ target: { name: 'photo', value: 'data:image/png;base64,AAAA' } })
      })
      act(() => {
        lastControllerProps.handleChangeInput({ target: { name: 'name', value: 'Pending' } })
      })
      expect(lastControllerProps.formState.changes.photo).toBe('data:image/png;base64,AAAA')
      await act(async () => {
        await lastControllerProps.handleRemovePhoto()
      })
      expect(lastControllerProps.formState.changes.photo).toBeUndefined()
      expect(lastControllerProps.formState.changes.name).toBe('Pending')
    })

    it('says the API\'s error, leaves the user as he was and keeps the form\'s changes', async () => {
      upm.mockUserSave.mockResolvedValue({ content: { error: true, result: ['Photo not valid'] } })
      renderController(UserFormDetails, { user: upm.sampleUser, onClose: upm.mockOnClose, handleSuccessUpdate: upm.mockHandleSuccessUpdate })
      act(() => {
        lastControllerProps.handleChangeInput({ target: { name: 'name', value: 'Pending' } })
      })
      await act(async () => {
        await lastControllerProps.handleRemovePhoto()
      })
      expect(lastControllerProps.formState.result).toEqual({ error: true, result: ['Photo not valid'] })
      expect(lastControllerProps.formState.loading).toBe(false)
      expect(lastControllerProps.formState.changes.name).toBe('Pending')
      expect(upm.mockChangeUser).not.toHaveBeenCalled()
      expect(upm.mockHandleSuccessUpdate).not.toHaveBeenCalled()
      expect(upm.mockOnClose).not.toHaveBeenCalled()
    })

    it('says a request that fails as an error of the form', async () => {
      upm.mockUserSave.mockRejectedValue(new Error('Network Error'))
      renderController(UserFormDetails, { user: upm.sampleUser })
      await act(async () => {
        await lastControllerProps.handleRemovePhoto()
      })
      expect(lastControllerProps.formState.result).toEqual({ error: true, result: 'Network Error' })
      expect(lastControllerProps.formState.loading).toBe(false)
      expect(upm.mockChangeUser).not.toHaveBeenCalled()
    })

    it('updates the customer instead of the session in customer mode', async () => {
      renderController(UserFormDetails, { user: upm.sampleUser, isCustomerMode: true })
      await act(async () => {
        await lastControllerProps.handleRemovePhoto()
      })
      expect(upm.mockSetUserCustomer).toHaveBeenCalled()
      expect(upm.mockChangeUser).not.toHaveBeenCalled()
    })

    it('removes the photo of the user it was given, not the session\'s', async () => {
      renderController(UserFormDetails, { user: upm.sampleUser, userData: { id: 42 } })
      await act(async () => {
        await lastControllerProps.handleRemovePhoto()
      })
      expect(upm.mockOrdering.users).toHaveBeenCalledWith(42)
    })
  })
})
