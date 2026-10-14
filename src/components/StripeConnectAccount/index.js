import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useApi } from '../../contexts/ApiContext'
import { useSession } from '../../contexts/SessionContext'
import { useWebsocket } from '../../contexts/WebsocketContext'

export const StripeConnectAccount = (props) => {
  const {
    UIComponent,
    userId
  } = props

  const [ordering] = useApi()
  const socket = useWebsocket()
  const [{ user, token }] = useSession()

  const ownerId = userId ?? user?.id

  const [accountState, setAccountState] = useState({ account: null, loading: true, error: null })
  const [onboardingState, setOnboardingState] = useState({ loading: false, error: null })
  // Only the last request for the current user may update the account or the onboarding form
  const accountRequest = useRef(0)
  const onboardingRequest = useRef(0)

  const requestOptions = (method) => ({
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-App-X': ordering.appId,
      'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
      'X-Socket-Id-X': socket?.getId()
    }
  })

  /**
   * Method to get the Stripe account of the user from API.
   * The result is null while the user has not started the onboarding
   */
  const handleGetAccount = async () => {
    if (!ownerId) {
      setAccountState({ account: null, loading: false, error: null })
      return
    }
    const request = ++accountRequest.current
    try {
      setAccountState(prevState => ({ ...prevState, loading: true, error: null }))
      const response = await fetch(`${ordering.root}/users/${encodeURIComponent(ownerId)}/stripe_connect_account`, requestOptions('GET'))
      const { result, error } = await response.json()
      if (request !== accountRequest.current) return
      if (!error) {
        setAccountState({ account: result, loading: false, error: null })
      } else {
        setAccountState(prevState => ({ ...prevState, loading: false, error: result }))
      }
    } catch (err) {
      if (request !== accountRequest.current) return
      setAccountState(prevState => ({ ...prevState, loading: false, error: [err.message] }))
    }
  }

  /**
   * Method to get the url of the Stripe onboarding form from API.
   * The url expires in a few minutes and opens once, so it must be requested right before opening it
   * @returns {Promise<string|null>} url of the form, null when it could not be created
   */
  const handleGetOnboardingUrl = async () => {
    if (!ownerId) return null
    const request = ++onboardingRequest.current
    try {
      setOnboardingState({ loading: true, error: null })
      const response = await fetch(`${ordering.root}/users/${encodeURIComponent(ownerId)}/stripe_connect_account/onboarding`, requestOptions('POST'))
      const { result, error } = await response.json()
      if (request !== onboardingRequest.current) return null
      if (!error) {
        setOnboardingState({ loading: false, error: null })
        return result?.url ?? null
      }
      setOnboardingState({ loading: false, error: result })
      return null
    } catch (err) {
      if (request !== onboardingRequest.current) return null
      setOnboardingState({ loading: false, error: [err.message] })
      return null
    }
  }

  useEffect(() => {
    onboardingRequest.current += 1
    setOnboardingState({ loading: false, error: null })
    if (ownerId) {
      // Drop the previous user's account before the next request resolves
      setAccountState({ account: null, loading: true, error: null })
      handleGetAccount()
    } else {
      accountRequest.current += 1
      setAccountState({ account: null, loading: false, error: null })
    }
  }, [ownerId])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          accountState={accountState}
          onboardingState={onboardingState}
          handleGetAccount={handleGetAccount}
          handleGetOnboardingUrl={handleGetOnboardingUrl}
        />
      )}
    </>
  )
}

StripeConnectAccount.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
   * Id of the user that owns the Stripe account, the session user by default
   */
  userId: PropTypes.number
}
