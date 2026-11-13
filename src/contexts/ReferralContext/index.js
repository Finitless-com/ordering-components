import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'
import PropTypes from 'prop-types'
import {
  getReferralCodeFromUrl,
  normalizeReferralCode,
  REFERRAL_CODE_STORAGE_KEY
} from '../../utils/referral'

export const ReferralContext = createContext()

export const ReferralProvider = ({
  children,
  strategy,
  getInitialUrl,
  subscribeToUrls
}) => {
  const referralCodeRef = useRef(null)
  const [state, setState] = useState({
    loading: true,
    referralCode: null
  })

  const setReferralCode = useCallback((referralCode) => {
    referralCodeRef.current = referralCode
    setState({ loading: false, referralCode })
  }, [])

  const captureReferralUrl = useCallback(async (url) => {
    const referralCode = getReferralCodeFromUrl(url)
    if (!referralCode) return null
    try {
      await strategy.setItem(REFERRAL_CODE_STORAGE_KEY, referralCode)
    } catch {
      // Keep the code available for this session even if persistence is unavailable.
    }
    setReferralCode(referralCode)
    return referralCode
  }, [strategy, setReferralCode])

  const getReferralCode = useCallback(async () => {
    if (referralCodeRef.current) return referralCodeRef.current
    return normalizeReferralCode(await strategy.getItem(REFERRAL_CODE_STORAGE_KEY))
  }, [strategy])

  const consumeReferralCode = useCallback(async () => {
    try {
      await strategy.removeItem(REFERRAL_CODE_STORAGE_KEY)
    } catch {
      // A storage failure must not turn a successful signup or order into an error.
    }
    setReferralCode(null)
  }, [strategy, setReferralCode])

  useEffect(() => {
    let active = true
    const initialize = async () => {
      let storedCode = null
      let initialUrl = null
      try {
        storedCode = normalizeReferralCode(await strategy.getItem(REFERRAL_CODE_STORAGE_KEY))
      } catch {
        // Continue with the referral code from the current link.
      }
      try {
        initialUrl = getInitialUrl ? await getInitialUrl() : null
      } catch {
        // Continue with the previously stored referral code.
      }
      const linkedCode = getReferralCodeFromUrl(initialUrl)
      if (!active) return
      if (linkedCode) {
        try {
          await strategy.setItem(REFERRAL_CODE_STORAGE_KEY, linkedCode)
        } catch {
          // Keep the linked code in memory for this session.
        }
      }
      setReferralCode(linkedCode || storedCode)
    }
    initialize()

    const unsubscribe = subscribeToUrls
      ? subscribeToUrls(captureReferralUrl)
      : null
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [captureReferralUrl, getInitialUrl, strategy, setReferralCode, subscribeToUrls])

  return (
    <ReferralContext.Provider value={[
      state,
      {
        captureReferralUrl,
        consumeReferralCode,
        getReferralCode
      }
    ]}>
      {children}
    </ReferralContext.Provider>
  )
}

ReferralProvider.propTypes = {
  children: PropTypes.node,
  strategy: PropTypes.shape({
    getItem: PropTypes.func.isRequired,
    setItem: PropTypes.func.isRequired,
    removeItem: PropTypes.func.isRequired
  }).isRequired,
  getInitialUrl: PropTypes.func,
  subscribeToUrls: PropTypes.func
}

export const useReferral = () => {
  const context = useContext(ReferralContext)
  return context || [{ loading: false, referralCode: null }, {
    captureReferralUrl: async () => null,
    consumeReferralCode: async () => {},
    getReferralCode: async () => null
  }]
}
