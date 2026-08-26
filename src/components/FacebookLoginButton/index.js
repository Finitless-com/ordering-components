import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useApi } from '../../contexts/ApiContext'
import { useSession } from '../../contexts/SessionContext'

/**
 * Component to manage Facebook login behavior without UI component
 */
export const FacebookLoginButton = (props) => {
  props = { ...defaultProps, ...props }
  const {
    UIComponent,
    appId,
    debug,
    version,
    language,
    domain,
    handleButtonFacebookLoginClick,
    handleSuccessFacebookLogin,
    handleSuccessFacebookLogout,
    isGuest
  } = props

  const [ordering] = useApi()
  const [{ user }] = useSession()
  const [formState, setFormState] = useState({ loading: false, result: { error: false } })
  const [facebookStatus, setFacebookStatus] = useState({ ready: false, logged: false })
  let wasUnmounted = false

  useEffect(() => {
    if (window.document.getElementById('facebook-jssdk')) {
      return
    }
    window.fbAsyncInit = () => {
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version,
        status: true
      })
      !wasUnmounted && setFacebookStatus({ ...facebookStatus, ready: true })
      window.FB.getLoginStatus((response) => {
        if (response.status === 'connected') {
          !wasUnmounted && setFacebookStatus({ ...facebookStatus, logged: true })
        }
      })
    }

    const js = window.document.createElement('script')
    const fjs = window.document.getElementsByTagName('script')[0]
    js.id = 'facebook-jssdk'
    js.async = true
    js.defer = true
    js.src = `https://${domain}/${language}/sdk${debug ? '/debug' : ''}.js`
    fjs.parentNode.insertBefore(js, fjs)
  }, [])

  useEffect(() => {
    return () => {
      wasUnmounted = true
    }
  }, [])

  /**
   * Default fuction for login/signup with Facebook workflow
   * @param {object} Result from facebook
   */
  const handleFacebookLoginClick = async (facebookResponse) => {
    if (handleButtonFacebookLoginClick) {
      handleButtonFacebookLoginClick(facebookResponse)
      return
    }

    try {
      setFormState({ ...formState, loading: true })
      const _credentials = { access_token: facebookResponse.authResponse?.accessToken }
      if (isGuest && user?.guest_id) _credentials.guest_token = user?.guest_id
      const response = await ordering.setAccessToken(null).users().authFacebook(_credentials)
      setFormState({
        result: response.content,
        loading: false
      })
      if (!response.content.error) {
        if (handleSuccessFacebookLogin) {
          handleSuccessFacebookLogin(response.content.result)
        }
      } else {
        handleFacebookLogout()
      }
    } catch (err) {
      setFormState({
        result: {
          error: true,
          result: err.message
        },
        loading: false
      })
    }
  }

  /**
   * Start Facebook login
   * @param {EventTarget} e Click button event
   */
  const handleFacebookLogin = (e) => {
    if (window.FB) {
      window.FB.login((response) => {
        window.FB.api('/me/permissions', (response) => { // only for test
        })
        if (response.status === 'connected') {
          setFormState({ loading: false, result: { error: false } })
          setFacebookStatus({ ...facebookStatus, logged: true })
          handleFacebookLoginClick(response)
        } else {
          setFormState({ loading: false, result: { error: true, result: 'Error login with Facebook' } })
        }
      }, { scope: 'email', auth_type: 'rerequest', return_scopes: true })
    }
  }

  /**
   * Start Facebook logout
   * @param {EventTarget} e Click button event
   */
  const handleFacebookLogout = (e) => {
    if (window.FB) {
      setFormState({ ...formState, loading: true })
      window.FB.logout((response) => {
        setFormState({ loading: false, result: { error: false } })
        setFacebookStatus({ ...facebookStatus, logged: false })
        if (handleSuccessFacebookLogout) {
          handleSuccessFacebookLogout(response)
        }
      })
    }
  }

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          formState={formState}
          facebookStatus={facebookStatus}
          handleFacebookLogout={handleFacebookLogout}
          handleFacebookLogin={handleFacebookLogin}
        />
      )}
    </>
  )
}

FacebookLoginButton.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
   * Function to change default forgot password behavior
   */
  handleButtonForgotPassowrdClick: PropTypes.func,
  /**
   * Function to get forgot password success event
   * @param {string} email Email to which it was sent
   */
  handleSuccessForgotPassoword: PropTypes.func,
  /**
   * Default email to forgot password form
   */
  appId: PropTypes.string.isRequired,
  /**
   * Enable/Disable Facebook login debug mode
   */
  debug: PropTypes.bool,
  /**
   * Facebook SDK version
   */
  version: PropTypes.string,
  /**
   * Facebook SDK languages
   */
  language: PropTypes.string,
  /**
   * Facebook SDK domain
   */
  domain: PropTypes.string
}

const defaultProps = {
  version: 'v7.0',
  language: 'en_US',
  domain: 'connect.facebook.net'
}
