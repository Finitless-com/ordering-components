import React, { useCallback, useEffect, useState } from 'react'
import { useEvent } from '../../contexts/EventContext'
import PropTypes from 'prop-types'

const GA4_SCRIPT_ID = 'google-analytics-gtag'
const UA_SCRIPT_ID = 'google-analytics-sdk'

const isGa4MeasurementId = (id) => typeof id === 'string' && id.startsWith('G-')

const isDisabledTrackId = (id) => !id || id === '0'

export const Analytics = (props) => {
  const {
    trackId,
    children
  } = props
  const [events] = useEvent()
  const [analyticsReady, setAnalyticsReady] = useState(false)

  useEffect(() => {
    if (isDisabledTrackId(trackId)) {
      return
    }

    if (isGa4MeasurementId(trackId)) {
      if (window.document.getElementById(GA4_SCRIPT_ID)) {
        if (typeof window.gtag === 'function') {
          setAnalyticsReady(true)
        }
        return
      }

      window.dataLayer = window.dataLayer || []
      if (typeof window.gtag !== 'function') {
        window.gtag = function gtag () {
          window.dataLayer.push(arguments)
        }
      }
      window.gtag('js', new Date())
      window.gtag('config', trackId)

      const script = window.document.createElement('script')
      script.id = GA4_SCRIPT_ID
      script.async = true
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(trackId)}`
      script.onload = () => {
        setAnalyticsReady(true)
      }
      window.document.head.appendChild(script)
      return () => {
        script.onload = null
      }
    }

    if (window.document.getElementById(UA_SCRIPT_ID)) {
      if (typeof window.ga !== 'undefined') {
        setAnalyticsReady(true)
      }
      return
    }

    const js = window.document.createElement('script')
    js.id = UA_SCRIPT_ID
    js.async = true
    js.src = 'https://www.google-analytics.com/analytics.js'
    js.onload = () => {
      if (typeof window.ga === 'undefined') {
        return
      }
      setAnalyticsReady(true)
      window.ga('create', trackId, 'auto')
      window.ga('require', 'ec')
      window.ga('set', 'page', window.location.pathname)
      window.ga('send', 'pageview')
    }

    window.document.body.appendChild(js)
    return () => {
      js.onload = null
    }
  }, [trackId])

  const handlechangeView = useCallback((pageName) => {
    const path = pageName?.page ?? window.location.pathname
    if (isGa4MeasurementId(trackId) && typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_path: path,
        page_location: window.location.href
      })
      return
    }
    if (typeof window.ga !== 'undefined') {
      window.ga('set', 'page', path)
      window.ga('send', 'pageview')
    }
  }, [trackId])

  const handleClickProduct = useCallback((product) => {
    if (isGa4MeasurementId(trackId) && typeof window.gtag === 'function') {
      window.gtag('event', 'select_item', {
        items: [{
          item_id: String(product.id),
          item_name: product.name,
          item_category: product.category_id != null ? String(product.category_id) : undefined,
          price: Number(product.price) || 0
        }]
      })
      return
    }
    if (typeof window.ga !== 'undefined') {
      window.ga('ec:addProduct', {
        id: product.id,
        name: product.name,
        category: product.category_id,
        price: product.price
      })
      window.ga('ec:setAction', 'click')
      window.ga('send', 'event', 'UI', 'click', 'add to cart')
    }
  }, [trackId])

  const handleProductAdded = useCallback((product) => {
    const quantity = Number(product.quantity) || 1
    const price = Number(product.price) || 0
    if (isGa4MeasurementId(trackId) && typeof window.gtag === 'function') {
      window.gtag('event', 'add_to_cart', {
        currency: 'USD',
        value: price * quantity,
        items: [{
          item_id: String(product.id),
          item_name: product.name,
          item_category: product.category_id != null ? String(product.category_id) : undefined,
          price,
          quantity
        }]
      })
      return
    }
    if (typeof window.ga !== 'undefined') {
      window.ga('ec:addProduct', {
        id: product.id,
        name: product.name,
        category: product.category_id,
        price: product.price,
        quantity: product.quantity
      })
      window.ga('ec:setAction', 'add')
      window.ga('send', 'event', 'UI', 'click', 'add to cart')
    }
  }, [trackId])

  const handleLogin = useCallback((data) => {
    if (isGa4MeasurementId(trackId) && typeof window.gtag === 'function') {
      window.gtag('config', trackId, { user_id: String(data.id) })
      return
    }
    if (typeof window.ga !== 'undefined') {
      window.ga('set', 'userId', data.id)
    }
  }, [trackId])

  const handleOrderPlaced = useCallback((order) => {
    if (isGa4MeasurementId(trackId) && typeof window.gtag === 'function') {
      const value = parseFloat(order.total) || 0
      window.gtag('event', 'purchase', {
        transaction_id: String(order.id),
        value,
        tax: parseFloat(order.tax_total) || 0,
        shipping: parseFloat(order.delivery_zone_price) || 0,
        currency: order.currency || 'USD',
        affiliation: order.business?.name
      })
      return
    }
    if (typeof window.ga !== 'undefined') {
      window.ga('ec:setAction', 'purchase', {
        id: order.id,
        affiliation: order.business?.name,
        revenue: order.total,
        tax: order.tax_total,
        shipping: order.delivery_zone_price
      })
      window.ga('send', 'pageview')
    }
  }, [trackId])

  useEffect(() => {
    if (!analyticsReady || isDisabledTrackId(trackId)) {
      return
    }

    const canUseGa4 = isGa4MeasurementId(trackId) && typeof window.gtag === 'function'
    const canUseUa = !isGa4MeasurementId(trackId) && typeof window.ga !== 'undefined'
    if (!canUseGa4 && !canUseUa) {
      return
    }

    events.on('change_view', handlechangeView)
    events.on('userLogin', handleLogin)
    events.on('product_clicked', handleClickProduct)
    events.on('product_added', handleProductAdded)
    events.on('order_placed', handleOrderPlaced)

    return () => {
      events.off('change_view', handlechangeView)
      events.off('userLogin', handleLogin)
      events.off('product_clicked', handleClickProduct)
      events.off('product_added', handleProductAdded)
      events.off('order_placed', handleOrderPlaced)
    }
  }, [
    analyticsReady,
    trackId,
    events,
    handlechangeView,
    handleLogin,
    handleClickProduct,
    handleProductAdded,
    handleOrderPlaced
  ])

  return (
    <>
      {children}
    </>
  )
}

Analytics.propTypes = {
  /**
   * Google Analytics ID: GA4 Measurement ID (G-xxxxxxxxxx) or legacy Universal Analytics (UA-xxxxxxxx-x).
   */
  trackId: PropTypes.string.isRequired
}
