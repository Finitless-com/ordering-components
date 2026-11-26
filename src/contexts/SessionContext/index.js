/* eslint-disable camelcase */
import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { useApi } from '../ApiContext'
import { useToastActions, ToastType } from '../ToastContext'
import { useLanguage } from '../LanguageContext'
import { getSessionStorageSyncDecision } from './getSessionStorageSyncDecision'
import { getSessionCheckInterval } from './getSessionCheckInterval'
/**
 * Create SessionContext
 * This context will manage the session internally and provide an easy interface
 */
export const SessionContext = createContext()

/**
 * Custom provider to session manager
 * This provider has a reducer for manage session state
 * @param {props} props
 * @param {number|false|null} [props.checkInterval=2000] Period, in ms, of the poll that compares the
 * stored session (token and user) with the one in memory and adopts the stored one (a login or a logout
 * made by another tab of the same browser, or a token replaced from outside the provider).
 * `0`, `false` or `null` turn the poll OFF: use it when nothing else writes the session storage
 * (for example a React Native app, which has a single JS runtime).
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
  // Session writes (login / logout) in progress, and a counter that changes at the start and at the end of each one:
  // the storage poll uses them to not decide on a session that is being written
  const writesInFlightRef = useRef(0)
  const writesCounterRef = useRef(0)
  // A poll tick in progress: ticks never overlap
  const checkingRef = useRef(false)
  const [ordering] = useApi()
  const { showToast } = useToastActions()
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

  /**
   * Run a write of the session (login / logout) marking it as in flight while it lasts
   * @param {function} write Async function that writes the storage and the state
   */
  const trackSessionWrite = async (write) => {
    writesInFlightRef.current++
    writesCounterRef.current++
    try {
      return await write()
    } finally {
      writesInFlightRef.current--
      writesCounterRef.current++
    }
  }

  const login = (values) => trackSessionWrite(async () => {
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
  })

  const logout = () => trackSessionWrite(async () => {
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
  })

  const changeUser = async (user) => {
    await strategy.setItem('user', user, true)
    setState(prevState => ({
      ...prevState,
      user,
      loading: false
    }))
  }

  const checkLocalStorage = async () => {
    // A tick still reading, or a login / logout writing: the next tick will see a consistent session
    if (checkingRef.current || writesInFlightRef.current > 0) return
    checkingRef.current = true
    const writesCounterAtStart = writesCounterRef.current
    try {
      const stored = await getValuesFromLocalStorage()
      // A login / logout started or ended while this tick was reading: what was read can be half written
      // (a token without its user, or nothing at all) and must not be compared with the new in-memory session
      if (writesInFlightRef.current > 0 || writesCounterRef.current !== writesCounterAtStart) return
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
        await login({
          user: syncDecision.user,
          token: syncDecision.token,
          device_code: device_code || currentState.device_code
        })
      }
      if (syncDecision.action === 'logout') {
        await logout()
      }
    } catch (err) {
      setState(prevState => ({
        ...prevState,
        loading: false
      }))
    } finally {
      checkingRef.current = false
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

  const checkPeriod = getSessionCheckInterval(checkInterval)

  useEffect(() => {
    // The poll is OFF when the period is not a positive number (0, false, null)
    if (checkPeriod === null) return
    // Optimized for kiosk mode: check every 30 seconds instead of 2 seconds
    // to reduce disk I/O and battery drain in 24/7 operation
    const interval = setInterval(() => {
      checkLocalStorage()
    }, checkPeriod)
    return () => clearInterval(interval)
  }, [checkPeriod])

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

SessionProvider.propTypes = {
  /**
   * Period, in ms, of the poll that syncs the in-memory session with the stored one
   * (default 2000). `0`, `false` or `null` turn the poll off.
   */
  checkInterval: PropTypes.oneOfType([PropTypes.number, PropTypes.bool]),
  strategy: PropTypes.object
}

/**
 * Hook to get and update session state
 */
export const useSession = () => {
  const sessionManager = useContext(SessionContext)
  return sessionManager || [{}, () => { }]
}
