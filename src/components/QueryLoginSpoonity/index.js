import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useSession } from '../../contexts/SessionContext'
import { useApi } from '../../contexts/ApiContext'
import { useEvent } from '../../contexts/EventContext'
import { useOrder } from '../../contexts/OrderContext'
import { useSite } from '../../contexts/SiteContext'
/**
 * Component to manage query login behavior without UI component
 */
export const QueryLoginSpoonity = (props) => {
  const {
    UIComponent,
    token
  } = props

  const [ordering] = useApi()
  const [{ auth }, { login }] = useSession()
  const [events] = useEvent()
  const [, { setStateValues }] = useOrder()
  const [{ site }] = useSite()
  let querylat
  let querylng
  const [userState, setUserState] = useState({ loading: true, user: {}, error: null })
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [modalPageToShow, setModalPageToShow] = useState(null)
  const businessUrlTemplate = site?.business_url_template || '/store/:business_slug'
  if (location.search) {
    const query = new URLSearchParams(location.search)
    querylat = query.get('lat')
    querylng = query.get('lng')
  }
  /**
   * Method to get the user from token
   */
  const handleGetUser = async () => {
    try {
      setUserState({ ...userState, loading: true })
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          spoonity_token: token
        })
      }
      const response = await fetch(`${ordering.root}/auth/spoonity`, requestOptions)
      const { error, result } = await response.json()
      if (!error) {
        await login({
          user: result,
          token: result?.session?.access_token
        })
        setUserState({
          ...userState,
          loading: false,
          error: result
        })
      } else {
        setUserState({
          ...userState,
          loading: false,
          error: result
        })
        handleGoToLogin()
      }
    } catch (error) {
      setUserState({
        ...userState,
        loading: false,
        error: [error.message]
      })
      handleGoToLogin()
    }
  }

  /**
   * Method to redirect login page
   */
  const handleGoToLogin = () => {
    setAuthModalOpen(true)
    setModalPageToShow('login')
  }

  useEffect(() => {
    if (token && !auth) {
      handleGetUser()
    }
  }, [token, auth])

  useEffect(() => {
    if (auth) {
      if (querylat && querylng) {
        setStateValues({ location: { lat: querylat, lng: querylng } })
      }
      const filters = ['', 'store', 'search']
      const store = window.location.pathname.split('/')?.filter(text => !filters.includes(text))?.[0]
      if (store) {
        if (businessUrlTemplate === '/store/:business_slug' || businessUrlTemplate === '/:business_slug') {
          events.emit('go_to_page', { page: 'business', params: { business_slug: store } })
        } else {
          events.emit('go_to_page', { page: 'business', search: `?${businessUrlTemplate.split('?')[1].replace(':business_slug', '')}${store}` })
        }
      } else {
        events.emit('go_to_page', { page: 'search' })
      }
    }
  }, [auth])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          userState={userState}
          authModalOpen={authModalOpen}
          setAuthModalOpen={setAuthModalOpen}
          modalPageToShow={modalPageToShow}
          setModalPageToShow={setModalPageToShow}
        />
      )}
    </>
  )
}

QueryLoginSpoonity.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType
}
