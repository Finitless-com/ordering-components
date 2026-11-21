import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { useSession } from '../../contexts/SessionContext'
import { useApi } from '../../contexts/ApiContext'
import { useConfig } from '../../contexts/ConfigContext'
import { useWebsocket } from '../../contexts/WebsocketContext'

const codeOutcomeOf = (action, response = null, ok = false) => ({
  action,
  success: ok && response?.error === false,
  response
})

/**
 * Component to manage User Verification behavior without UI component
 */
export const UserVerification = (props) => {
  const {
    UIComponent,
    includeResponse
  } = props

  const [ordering] = useApi()
  const socket = useWebsocket()
  const [{ user, token }, { changeUser }] = useSession()
  const [{ configs }] = useConfig()
  const useWhatsappVerification = configs?.whatsapp_otp_login_enabled?.value === '1'
  const withCodeOutcome = (codeOutcome) => includeResponse ? { codeOutcome } : {}

  const [verifyEmailState, setVerifyEmailState] = useState({
    loadingSendCode: false,
    resultSendCode: null,
    errorSendCode: null,
    loadingCheckCode: false,
    resultCheckCode: null,
    errorCheckCode: null
  })

  const [verifyPhoneState, setVerifyPhoneState] = useState({
    loadingSendCode: false,
    resultSendCode: null,
    errorSendCode: null,
    loadingCheckCode: false,
    resultCheckCode: null,
    errorCheckCode: null
  })

  /**
   * function to send verify code for email
   * @param {Object} values object with type, channel, size, email values
   */
  const sendVerifyEmailCode = async (values) => {
    try {
      setVerifyEmailState({ ...verifyEmailState, loadingSendCode: true, ...withCodeOutcome(null) })
      const response = await fetch(`${ordering.root}/codes/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        },
        body: JSON.stringify({
          type: values?.type ?? 3,
          channel: values?.channel ?? 1,
          size: values?.size ?? 6,
          email: values?.email
        })
      })
      const payload = await response.json()
      const { error, result } = includeResponse ? payload ?? {} : payload
      const outcome = codeOutcomeOf('send', payload, response.ok)
      setVerifyEmailState({
        ...verifyEmailState,
        loadingSendCode: false,
        resultSendCode: (includeResponse ? !outcome.success : error) ? null : result,
        errorSendCode: error
          ? typeof result === 'string' ? [result] : result
          : null,
        ...withCodeOutcome(outcome)
      })
    } catch (error) {
      setVerifyEmailState({
        ...verifyEmailState,
        loadingSendCode: false,
        errorSendCode: [error.message],
        ...withCodeOutcome(codeOutcomeOf('send'))
      })
    }
  }

  /**
   * function to check code for verify user email
   * @param {Object} values object with channel and code values
   */
  const checkVerifyEmailCode = async (values) => {
    try {
      setVerifyEmailState({ ...verifyEmailState, loadingCheckCode: true, ...withCodeOutcome(null) })
      const response = await fetch(`${ordering.root}/users/${user?.id}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        },
        body: JSON.stringify({
          channel: values?.channel ?? 1,
          code: values?.code
        })
      })
      const payload = await response.json()
      const { error, result } = includeResponse ? payload ?? {} : payload
      const outcome = codeOutcomeOf('check', payload, response.ok)
      const failed = includeResponse ? !outcome.success : error

      if (result?.id && !failed) {
        changeUser({ ...user, ...result })
      }

      setVerifyEmailState({
        ...verifyEmailState,
        loadingCheckCode: false,
        resultCheckCode: failed ? null : result,
        errorSendCode: error
          ? typeof result === 'string' ? [result] : result
          : null,
        ...withCodeOutcome(outcome)
      })
    } catch (error) {
      setVerifyEmailState({
        ...verifyEmailState,
        loadingCheckCode: false,
        errorCheckCode: [error.message],
        ...withCodeOutcome(codeOutcomeOf('check'))
      })
    }
  }

  /**
   * function for clean errors state
   */
  const cleanErrorsState = (value) => {
    if (value === 'phone') {
      setVerifyPhoneState({
        ...verifyPhoneState,
        errorCheckCode: null,
        errorSendCode: null,
        ...withCodeOutcome(null)
      })
      return
    }
    setVerifyEmailState({
      ...verifyEmailState,
      errorCheckCode: null,
      errorSendCode: null,
      ...withCodeOutcome(null)
    })
  }

  /**
   * function to send verify code with twilio
   * @param {Object} values object with cellphone and country code values
   */
  const sendVerifyPhoneCode = async (values) => {
    try {
      setVerifyPhoneState({
        ...verifyPhoneState,
        loadingSendCode: true,
        errorCheckCode: false,
        ...withCodeOutcome(null)
      })
      const response = await fetch(`${ordering.root}/codes/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        },
        body: JSON.stringify({
          type: values?.type ?? 2,
          channel: values?.channel ?? 2,
          size: values?.size ?? 4,
          cellphone: values?.cellphone,
          country_phone_code: values?.country_phone_code
        })
      })
      const payload = await response.json()
      const { error, result } = includeResponse ? payload ?? {} : payload
      const outcome = codeOutcomeOf('send', payload, response.ok)
      setVerifyPhoneState({
        ...verifyPhoneState,
        loadingSendCode: false,
        resultSendCode: (includeResponse ? !outcome.success : error) ? null : result,
        errorSendCode: error
          ? typeof result === 'string' ? [result] : result
          : null,
        ...withCodeOutcome(outcome)
      })
    } catch (error) {
      setVerifyPhoneState({
        ...verifyPhoneState,
        loadingSendCode: false,
        errorSendCode: [error.message],
        ...withCodeOutcome(codeOutcomeOf('send'))
      })
    }
  }

  /**
   * function to verify code with endpoint
   * @param {Object} values object with cellphone and country code values
   */
  const checkVerifyPhoneCode = async (values) => {
    try {
      setVerifyPhoneState({ ...verifyPhoneState, loadingCheckCode: true, ...withCodeOutcome(null) })
      const response = await fetch(`${ordering.root}/users/${user?.id}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        },
        body: JSON.stringify({
          channel: values?.channel ?? 2,
          code: values?.code
        })
      })
      const payload = await response.json()
      const { error, result } = includeResponse ? payload ?? {} : payload
      const outcome = codeOutcomeOf('check', payload, response.ok)
      const failed = includeResponse ? !outcome.success : error
      if (result?.id && !failed) {
        changeUser({ ...user, ...result })
      }
      setVerifyPhoneState({
        ...verifyPhoneState,
        loadingCheckCode: false,
        resultCheckCode: failed ? null : result,
        errorSendCode: error
          ? typeof result === 'string' ? [result] : result
          : null,
        ...withCodeOutcome(outcome)
      })
    } catch (error) {
      setVerifyPhoneState({
        ...verifyPhoneState,
        loadingCheckCode: false,
        errorCheckCode: [error.message],
        ...withCodeOutcome(codeOutcomeOf('check'))
      })
    }
  }

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          verifyEmailState={verifyEmailState}
          verifyPhoneState={verifyPhoneState}
          sendVerifyEmailCode={sendVerifyEmailCode}
          sendVerifyPhoneCode={sendVerifyPhoneCode}
          checkVerifyEmailCode={checkVerifyEmailCode}
          checkVerifyPhoneCode={checkVerifyPhoneCode}
          cleanErrorsState={cleanErrorsState}
          useWhatsappVerification={useWhatsappVerification}
        />
      )}
    </>
  )
}

UserVerification.propTypes = {
  UIComponent: PropTypes.elementType,
  /** Expose each channel's latest codeOutcome with the full response and status. */
  includeResponse: PropTypes.bool
}
