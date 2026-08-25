import React, { useState } from 'react'
import PropTypes from 'prop-types'
import * as firebase from 'firebase/app'
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'

import { useApi } from '../../contexts/ApiContext'
import { useConfig } from '../../contexts/ConfigContext'
import { useSession } from '../../contexts/SessionContext'

export const FirebaseGoogleLoginButton = (props) => {
  const {
    UIComponent,
    handleSuccessGoogleLogin,
    isGuest
  } = props

  const [ordering] = useApi()
  const [{ user }] = useSession()
  const [{ configs }] = useConfig()
  const [actionState, setActionState] = useState({ loading: false, error: null })

  /**
   * handling response of Google
   */
  const signInWithGoogle = async () => {
    try {
      firebase.initializeApp({
        apiKey: configs?.google_login_api_key?.value,
        authDomain: configs?.google_login_auth_domain?.value
      })
      const auth = getAuth()
      const googleProvider = new GoogleAuthProvider()
      googleProvider.setCustomParameters({ prompt: 'select_account' })

      const response = await signInWithPopup(auth, googleProvider)
      handleSigninSuccess(response._tokenResponse)
    } catch (error) {
      setActionState({
        loading: false,
        error: [error.message]
      })
    }
  }

  /**
   * Function that return token of the user
   * @param {object} res from Google
   */
  const handleSigninSuccess = async (tokenResponse) => {
    try {
      setActionState({ ...actionState, loading: true })
      const _credentials = {
        access_token: tokenResponse?.oauthIdToken,
        name: tokenResponse?.firstName,
        lastname: tokenResponse?.lastName
      }
      if (isGuest && user?.guest_id) _credentials.guest_token = user?.guest_id
      const { content: { error, result } } = await ordering.setAccessToken(null).users().authGoogle(_credentials)
      if (!error) {
        if (handleSuccessGoogleLogin) {
          handleSuccessGoogleLogin(result)
        }
      }
      setActionState({
        loading: false,
        error: error ? result : null
      })
    } catch (error) {
      setActionState({
        loading: false,
        error: [error.message]
      })
    }
  }

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          signInWithGoogle={signInWithGoogle}
          actionState={actionState}
        />
      )}
    </>
  )
}

FirebaseGoogleLoginButton.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
   * Function to get login with google success event
   * @param {object} user User logged
   */
  handleSuccessGoogleLogin: PropTypes.func
}
