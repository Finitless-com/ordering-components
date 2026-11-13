import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useEvent } from '../../contexts/EventContext'
import { useSession } from '../../contexts/SessionContext'
const RWG_TOKEN_STORAGE_KEY = 'google_rwg_token'
const REDIRECT_BUSINESS_ID_KEY = 'google_rwg_redirect_business_id'
const INTEGRATION_BASE_URL = 'https://google-redirect.plugins.orderingplus.com'

/**
 * @deprecated Replaced by ORD-2402: OrderContext keeps the site's `rwg_token`
 * for 30 days (`captureReferral`) and sends it on place as `referral.click_id`,
 * and the API reports the conversion to Google (order_referrals,
 * ReportOrderReferral). Do not mount it together with that flow: every order
 * would be reported twice. Kept only for consumers that still mount it.
 */
export const GoogleConversion = (props) => {
  const { projectCode, children } = props

  const [events] = useEvent()
  const [conversionSecret, setConversionSecret] = useState(null)
  const [{ token }] = useSession()
  // Persist rwg_token from URL to sessionStorage when user lands from Google redirect
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location?.search) return
    const params = new URLSearchParams(window.location.search)
    const rwgToken = params.get('rwg_token')
    if (rwgToken && rwgToken.trim() !== '') {
      try {
        sessionStorage.setItem(RWG_TOKEN_STORAGE_KEY, rwgToken.trim())
        const url = new URL(window.location.href)
        url.searchParams.delete('rwg_token')
        const cleanUrl = url.pathname + (url.search || '') + (url.hash || '')
        window.history.replaceState({}, '', cleanUrl)
      } catch (e) {
        // ignore storage / history errors
      }
    }
  }, [])

  // Fetch conversion_secret from integration frontend settings
  useEffect(() => {
    if (!projectCode || typeof projectCode !== 'string' || projectCode.trim() === '' || !token) return
    const url = `${INTEGRATION_BASE_URL.replace(/\/$/, '')}/${projectCode.trim()}/api/frontend/settings`
    const loadSecret = async () => {
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
        const data = await res.json()
        const value = data?.result?.settings?.conversion_secret?.value
        if (typeof value === 'string' && value.trim() !== '') {
          setConversionSecret(value.trim())
        }
      } catch (e) {}
    }
    loadSecret()
  }, [projectCode, token])

  useEffect(() => {
    if (!projectCode || !token) return

    const handleOrderPlaced = async (order) => {
      let rwgToken
      try {
        rwgToken = sessionStorage.getItem(RWG_TOKEN_STORAGE_KEY)
      } catch (e) {
        return
      }
      if (!rwgToken || rwgToken.trim() === '') return

      let redirectBusinessId = null
      try {
        const stored = sessionStorage.getItem(REDIRECT_BUSINESS_ID_KEY)
        if (stored !== null && stored !== '') redirectBusinessId = stored
      } catch (e) {}

      const orderBusinessId = order?.business_id != null ? String(order.business_id) : null
      const sameMerchant = redirectBusinessId !== null && orderBusinessId !== null && redirectBusinessId === orderBusinessId
      const merchantChanged = sameMerchant ? '2' : '1'

      const baseUrl = INTEGRATION_BASE_URL.replace(/\/$/, '')
      const url = `${baseUrl}/${projectCode}/google/conversions/order-completed`
      const payload = {
        rwg_token: rwgToken,
        merchant_changed: merchantChanged,
        order_id: order?.id,
        business_id: order?.business_id
      }

      try {
        await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Conversion-Secret': conversionSecret,
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        })
      } catch (e) {
        // ignore network errors
      } finally {
        try {
          sessionStorage.removeItem(RWG_TOKEN_STORAGE_KEY)
          sessionStorage.removeItem(REDIRECT_BUSINESS_ID_KEY)
        } catch (e) {
          // ignore
        }
      }
    }

    events.on('order_placed', handleOrderPlaced)
    return () => {
      events.off('order_placed', handleOrderPlaced)
    }
  }, [events, projectCode, conversionSecret, token])

  return (
    <>
      {children}
    </>
  )
}

GoogleConversion.propTypes = {
  projectCode: PropTypes.string
}
