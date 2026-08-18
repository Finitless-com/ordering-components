import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useOrder } from '../../contexts/OrderContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useCustomer } from '../../contexts/CustomerContext'
import { useConfig } from '../../contexts/ConfigContext'
import { useApi } from '../../contexts/ApiContext'
import { useSession } from '../../contexts/SessionContext'

const initialOffersState = {
  cartUuid: null,
  offers: [],
  loading: false,
  error: null
}

/**
 * Component to manage coupon form behavior without UI component
 */
export const CouponControl = (props) => {
  const {
    businessId,
    businessIds,
    price,
    UIComponent
  } = props

  const [{ configs }] = useConfig()
  const [orderState, { applyCoupon, applyOffer }] = useOrder()
  const [confirm, setConfirm] = useState({ open: false, content: null, error: false })
  const [offersState, setOffersState] = useState(initialOffersState)
  const [applyingOfferId, setApplyingOfferId] = useState(null)
  const [, t] = useLanguage()
  const [{ user }] = useCustomer()
  const [ordering] = useApi()
  const [session] = useSession()
  const offersRequestRef = useRef({ id: 0, cartUuid: null, promise: null })
  const applyingOfferRef = useRef(false)

  const cart = props.cart || orderState?.carts?.[`businessId:${businessId}`]
  const couponDefault = cart?.coupon || null
  const advancedOffersEnabled = ['1', 1, true].includes(configs?.advanced_offers_module?.value)
  const canLoadOffers = Boolean(
    !businessIds &&
    advancedOffersEnabled &&
    session?.auth &&
    cart?.uuid
  )

  const [couponInput, setCouponInput] = useState(null)

  const loadAvailableOffers = async () => {
    if (!canLoadOffers) {
      setOffersState({
        ...initialOffersState,
        cartUuid: cart?.uuid || null
      })
      return []
    }

    if (
      offersRequestRef.current.cartUuid === cart.uuid &&
      offersRequestRef.current.promise
    ) {
      return offersRequestRef.current.promise
    }

    const requestId = offersRequestRef.current.id + 1
    setOffersState({
      cartUuid: cart.uuid,
      offers: [],
      loading: true,
      error: null
    })

    const request = ordering
      .setAccessToken(session.token)
      .carts(cart.uuid)
      .getOffers({ query: { only_applicable: false } })
      .then(({ content }) => {
        if (offersRequestRef.current.id !== requestId) return []

        if (content?.error) {
          setOffersState({
            cartUuid: cart.uuid,
            offers: [],
            loading: false,
            error: content.result
          })
          return []
        }

        const offers = Array.isArray(content?.result) ? content.result : []
        setOffersState({
          cartUuid: cart.uuid,
          offers,
          loading: false,
          error: null
        })
        return offers
      })
      .catch((error) => {
        if (offersRequestRef.current.id === requestId) {
          setOffersState({
            cartUuid: cart.uuid,
            offers: [],
            loading: false,
            error: error?.message || 'NETWORK_ERROR'
          })
        }
        return []
      })
      .finally(() => {
        if (offersRequestRef.current.id === requestId) {
          offersRequestRef.current = {
            id: requestId,
            cartUuid: cart.uuid,
            promise: null
          }
        }
      })

    offersRequestRef.current = {
      id: requestId,
      cartUuid: cart.uuid,
      promise: request
    }
    return request
  }

  const handleOfferApplyClick = async (offer) => {
    if (!canLoadOffers || !offer?.id || applyingOfferRef.current) return false

    applyingOfferRef.current = true
    setApplyingOfferId(offer.id)

    const offerData = {
      business_id: businessId,
      offer_id: offer.id,
      force: !offer.stackable && Boolean(cart?.offers?.length)
    }
    if (user?.id) offerData.userId = user.id

    try {
      const applied = await applyOffer(offerData)
      if (applied) loadAvailableOffers()
      return applied
    } finally {
      applyingOfferRef.current = false
      setApplyingOfferId(null)
    }
  }

  /**
   * method to manage coupon apply button
   */
  const handleButtonApplyClick = async () => {
    const coupon = couponInput
    setCouponInput('')
    if (!advancedOffersEnabled && !props.forceAdvancedOffersModule) {
      if (user?.id) { // Callcenter
        if (businessIds) {
          return Promise.all(businessIds.map(businessId => (
            applyCoupon({
              business_id: businessId,
              coupon
            }, {
              businessId,
              userId: user?.id
            })
          )))
        }
        return applyCoupon({
          business_id: businessId,
          coupon
        }, {
          businessId,
          userId: user?.id
        })
      } else {
        if (businessIds) {
          return Promise.all(businessIds.map(businessId => (
            applyCoupon({ business_id: businessId, coupon })
          )))
        }
        return applyCoupon({
          business_id: businessId,
          coupon
        })
      }
    } else {
      if (businessIds) {
        return Promise.all(businessIds.map(businessId => {
          const dataOffer = {
            business_id: businessId,
            coupon,
            force: true
          }
          if (user?.id) dataOffer.userId = user?.id // Callcenter
          return applyOffer(dataOffer)
        }))
      }
      const dataOffer = {
        business_id: businessId,
        coupon,
        force: true
      }
      if (user?.id) dataOffer.userId = user?.id // Callcenter
      return applyOffer(dataOffer)
    }
  }

  /**
   * method to manage remove coupon assigned
   */
  const handleRemoveCouponClick = async () => {
    if (businessIds) {
      return Promise.all(businessIds.map(businessId => (
        applyCoupon({ business_id: businessId, coupon: null })
      )))
    }
    const removed = await applyCoupon({
      business_id: businessId,
      coupon: null
    })
    if (removed && offersState.cartUuid === cart?.uuid) {
      await loadAvailableOffers()
    }
    return removed
  }

  useEffect(() => {
    if (price < 0) {
      handleRemoveCouponClick()
      setConfirm({ ...confirm, open: true, content: t('COUPON_TOTAL_ERROR', 'The total value of the cart with discount must be positive'), error: true })
    }
  }, [price])

  useEffect(() => {
    return () => {
      offersRequestRef.current = {
        id: offersRequestRef.current.id + 1,
        cartUuid: null,
        promise: null
      }
      applyingOfferRef.current = false
    }
  }, [])

  const currentOffersState = offersState.cartUuid === cart?.uuid
    ? offersState
    : {
        ...initialOffersState,
        cartUuid: cart?.uuid || null
      }

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          couponDefault={couponDefault}
          couponInput={couponInput}
          onChangeInputCoupon={(val => setCouponInput(val))}
          handleButtonApplyClick={handleButtonApplyClick}
          handleRemoveCouponClick={handleRemoveCouponClick}
          handleLoadOffers={loadAvailableOffers}
          handleOfferApplyClick={handleOfferApplyClick}
          offersState={currentOffersState}
          applyingOfferId={applyingOfferId}
          canLoadOffers={canLoadOffers}
          cart={cart}
          confirm={confirm}
          setConfirm={setConfirm}
        />
      )}
    </>
  )
}

CouponControl.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  businessId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  businessIds: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.number, PropTypes.string])),
  price: PropTypes.number,
  cart: PropTypes.shape({
    uuid: PropTypes.string,
    business_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    offers: PropTypes.array
  }),
  /**
   * isDisabled, flag to enable/disable coupon input
   */
  isDisabled: PropTypes.bool
}
