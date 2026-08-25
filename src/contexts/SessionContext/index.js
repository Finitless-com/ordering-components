/* eslint-disable camelcase */
import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useApi } from '../ApiContext'
import { useToast, ToastType } from '../ToastContext'
import { useLanguage } from '../LanguageContext'
import { getSessionStorageSyncDecision } from './getSessionStorageSyncDecision'
/**
 * Create SessionContext
 * This context will manage the session internally and provide an easy interface
 */
export const SessionContext = createContext()

/**
 * Custom provider to session manager
 * This provider has a reducer for manage session state
 * @param {props} props
 */
export const SessionProvider = ({ children, strategy, checkInterval = 2000 }) => {
  const [state, setState] = useState({
    auth: null,
    token: null,
    user: null,
    loading: true,
    device_code: null
  })
  const stateRef = useRef(state)
  const [ordering] = useApi()
  const [, { showToast }] = useToast()
  const [, t] = useLanguage()

  // Keep stateRef in sync with state
  useEffect(() => {
    stateRef.current = state
  }, [state])
  const emptySession = { auth: null, token: null, user: null, device_code: null }

  const setValuesFromLocalStorage = async () => {
    const stored = await getValuesFromLocalStorage()
    const { auth, token, user, device_code } = stored ?? emptySession
    setState(prevState => ({
      ...prevState,
      auth,
      token,
      user,
      loading: false,
      device_code
    }))
  }

  const getValuesFromLocalStorage = async () => {
    try {
      const auth = await strategy.getItem('token')
      const token = await strategy.getItem('token')
      const user = await strategy.getItem('user', true)
      const device_code = await strategy.getItem('device_code')
      return { auth, token, user, device_code }
    } catch (err) {
      setState(prevState => ({
        ...prevState,
        loading: false
      }))
      return emptySession
    }
  }

  const login = async (values) => {
    await strategy.setItem('token', values?.token)
    await strategy.setItem('user', values?.user, true)
    if (values?.device_code) {
      await strategy.setItem('device_code', values?.device_code)
    }
    const nextState = {
      ...stateRef.current,
      auth: true,
      user: values?.user,
      token: values?.token,
      loading: false,
      device_code: values?.device_code || null
    }
    stateRef.current = nextState
    setState(nextState)
    return values?.user
  }

  const logout = async () => {
    await strategy.removeItem('token')
    await strategy.removeItem('user')
    await strategy.removeItem('device_code')
    const countryCodeFromLocalStorage = await strategy.getItem('country-code')
    if (countryCodeFromLocalStorage) {
      await strategy.removeItem('country-code')
    }
    setState(prevState => ({
      ...prevState,
      auth: false,
      user: null,
      token: null,
      loading: false,
      device_code: null
    }))
  }

  const changeUser = async (user) => {
    await strategy.setItem('user', user, true)
    setState(prevState => ({
      ...prevState,
      user,
      loading: false
    }))
  }

  const checkLocalStorage = async () => {
    try {
      const stored = await getValuesFromLocalStorage()
      const { token, user, device_code } = stored ?? emptySession
      const currentState = stateRef.current
      // Update device_code if changed
      if (device_code && device_code !== currentState.device_code) {
        setState(prevState => ({
          ...prevState,
          device_code
        }))
      }
      const syncDecision = getSessionStorageSyncDecision({
        stored: { token, user },
        current: currentState
      })
      if (syncDecision.action === 'login') {
        login({
          user: syncDecision.user,
          token: syncDecision.token,
          device_code: device_code || currentState.device_code
        })
      }
      if (syncDecision.action === 'logout') {
        logout()
      }
    } catch (err) {
      setState(prevState => ({
        ...prevState,
        loading: false
      }))
    }
  }

  const refreshUserInfo = async () => {
    try {
      const currentState = stateRef.current
      const userId = currentState.user?.id
      const token = currentState.token

      if (!token || !userId) {
        return
      }

      const requestOptions = {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `bearer ${token}`,
          'X-APP-X': ordering?.appId
        }
      }
      const response = await fetch(`${ordering.root}/users/${userId}`, requestOptions)
      const { result, error } = await response.json()
      if (!error) {
        const nextState = {
          ...currentState,
          user: result,
          loading: false
        }
        stateRef.current = nextState
        setState(nextState)
        await strategy.setItem('user', result, true)
      } else {
        showToast(ToastType.Error, t('FAILED_TO_REFRESH_USER', 'Failed to refresh user'))
      }
    } catch (err) {
      showToast(ToastType.Error, t('FAILED_TO_REFRESH_USER', 'Failed to refresh user'))
    }
  }

  useEffect(() => {
    // Optimized for kiosk mode: check every 30 seconds instead of 2 seconds
    // to reduce disk I/O and battery drain in 24/7 operation
    const interval = setInterval(() => {
      checkLocalStorage()
    }, checkInterval)
    return () => clearInterval(interval)
  }, [checkInterval])

  useEffect(() => {
    setValuesFromLocalStorage()
  }, [])

  const functions = {
    login,
    logout,
    changeUser,
    refreshUserInfo
  }

  return (
    <SessionContext.Provider value={[state, functions]}>
      {children}
    </SessionContext.Provider>
  )
}

/**
 * Hook to get and update session state
 */
export const useSession = () => {
  const sessionManager = useContext(SessionContext)
  return sessionManager || [{}, () => { }]
}
