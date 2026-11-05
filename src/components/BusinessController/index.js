import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useOrder } from '../../contexts/OrderContext'
import { useApi } from '../../contexts/ApiContext'
import { useUtils } from '../../contexts/UtilsContext'
import { useSession } from '../../contexts/SessionContext'
import { useToast, ToastType } from '../../contexts/ToastContext'
import { useLanguage } from '../../contexts/LanguageContext'

import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import isBetween from 'dayjs/plugin/isBetween'
import { useWebsocket } from '../../contexts/WebsocketContext'
import { createDayjsWithTimezone } from '../../constants/timezones'

dayjs.extend(timezone)
dayjs.extend(isBetween)

export const BusinessController = (props) => {
  props = { ...defaultProps, ...props }
  const {
    business,
    businessId,
    businessAttributes,
    onBusinessClick,
    handleCustomClick,
    isDisabledInterval,
    minutesToCloseSoon,
    UIComponent,
    handleUpdateBusinessList,
    favoriteIds,
    setFavoriteIds
  } = props

  const [ordering] = useApi()
  const socket = useWebsocket()
  const [{ user, token }] = useSession()
  const [, { showToast }] = useToast()
  const [, t] = useLanguage()

  /**
   * This must be containt business object data
   */
  const [businessState, setBusinessState] = useState({ business, loading: false, error: null })
  /**
   * This must be containt a boolean to indicate if a business is close or not
   */
  const [isBusinessClose, setIsBusinessClose] = useState(false)
  /**
   * Order context data
   */
  const [orderState] = useOrder()
  /**
   * formatPrice function
   */
  const [{ parsePrice }] = useUtils()
  /**
   * timer in minutes when the business is going to close
   */

  const [businessWillCloseSoonMinutes, setBusinessWillCloseSoonMinutes] = useState(null)
  const [actionState, setActionState] = useState({ loading: false, error: null })

  /**
   * Method to get business from SDK
   */
  const getBusiness = async () => {
    if (!businessId) return
    setBusinessState({ ...businessState, loading: true })
    try {
      const { content: { result, error } } = await ordering.businesses(businessId).select(businessAttributes).get()
      if (!error) {
        setBusinessState({ ...businessState, business: result, loading: false })
      } else {
        setBusinessState({ ...businessState, business: result[0], loading: false, error })
      }
    } catch (err) {
      setBusinessState({ ...businessState, loading: false, error: err.message })
    }
  }
  /**
   * Method to return business offert to show
   * @param {object} offer
   */
  const getBusinessOffer = (offers) => {
    if (!offers || !offers.length) return null
    const maxOffer = offers.reduce((acc, cur) => (acc.rate > cur.rate) ? acc : cur)
    return maxOffer.rate !== 0 ? (maxOffer?.rate_type === 1 ? `${maxOffer?.rate}%` : parsePrice(maxOffer?.rate)) : null
  }
  /**
   * Method to return business max offer to show
   * @param {object} max offer
   */
  const getBusinessMaxOffer = (offers) => {
    if (!offers || !offers.length) return null
    const maxOffer = offers.reduce((acc, cur) => (acc.rate > cur.rate) ? acc : cur)
    return maxOffer
  }
  /**
   * Method to format date
   * @param {object} time
   */
  const formatDate = (time) => {
    const formatHour = time?.hour < 10 ? `0${time?.hour}` : time?.hour
    const formatMinute = time?.minute < 10 ? `0${time?.minute}` : time?.minute
    return time ? `${formatHour}:${formatMinute}` : 'none'
  }

  /**
   * Method to format numbers (only 2 decimals)
   * @param {number} num
   */
  const formatNumber = (num) => {
    return Math.round(num * 1e2) / 1e2
  }

  /**
   * Method to add, remove favorite info for user from API
   */
  const handleFavoriteBusiness = async (isAdd = false) => {
    if (!businessState?.business || !user) return

    try {
      setActionState({ ...actionState, loading: true, error: null })
      const changes = { object_id: businessState?.business?.id }
      const requestOptions = {
        method: isAdd ? 'POST' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        },
        ...(isAdd && { body: JSON.stringify(changes) })
      }
      const fetchEndpoint = isAdd
        ? `${ordering.root}/users/${user?.id}/favorite_businesses`
        : `${ordering.root}/users/${user.id}/favorite_businesses/${businessState?.business?.id}`
      const response = await fetch(fetchEndpoint, requestOptions)
      const content = await response.json()

      if (!content.error) {
        setActionState({ ...actionState, loading: false })
        handleUpdateBusinessList && handleUpdateBusinessList(businessState?.business?.id, { favorite: isAdd })
        if (favoriteIds) {
          const updateIds = isAdd
            ? [...favoriteIds, businessState?.business?.id]
            : favoriteIds.filter(item => item !== businessState?.business?.id)
          setFavoriteIds(updateIds)
        }
        setBusinessState({
          ...businessState,
          business: {
            ...businessState.business,
            favorite: isAdd
          }
        })
        props.handleCustomUpdate && props.handleCustomUpdate(businessState?.business?.id, { favorite: isAdd })
        showToast(ToastType.Success, isAdd ? t('FAVORITE_ADDED', 'Favorite added') : t('FAVORITE_REMOVED', 'Favorite removed'))
      } else {
        setActionState({
          ...actionState,
          loading: false,
          error: content.result
        })
        showToast(ToastType.Error, t(content.result, 'Error adding favorite'))
      }
    } catch (error) {
      setActionState({
        ...actionState,
        loading: false,
        error: [error.message]
      })
      showToast(ToastType.Error, [error.message])
    }
  }

  const registerClickBusinessEvent = async (business) => {
    await fetch(`${ordering.root}/tracking_events`, {
      method: 'POST',
      body: JSON.stringify({
        events: JSON.stringify([
          {
            event: 'click',
            model: 'Business',
            object_id: business?.business_id ?? business?.id
          }
        ])
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-App-X': ordering.appId,
        'X-INTERNAL-PRODUCT-X': ordering.appInternalName
      }
    })
  }

  const handleClick = () => {
    const _onBusinessClick = handleCustomClick || onBusinessClick
    _onBusinessClick?.(business)
    registerClickBusinessEvent(business)
  }

  useEffect(() => {
    if (!isDisabledInterval) {
      let timeout = null
      let timeoutCloseSoon = null
      if (!businessState.business?.timezone) return
      const currentDate = createDayjsWithTimezone(businessState.business?.timezone)
      let lapse = null

      if (businessState.business?.today?.enabled) {
        lapse = businessState.business?.today?.lapses?.find(lapse => {
          const from = currentDate.hour(lapse.open.hour).minute(lapse.open.minute)
          const to = currentDate.hour(lapse.close.hour).minute(lapse.close.minute)
          return currentDate.unix() >= from.unix() && currentDate.unix() <= to.unix()
        })
      }

      if (lapse) {
        const to = currentDate.hour(lapse.close.hour).minute(lapse.close.minute)
        const timeToClose = (to.unix() - currentDate.unix()) * 1000

        if (timeToClose <= minutesToCloseSoon * 60000 && timeToClose > 0) {
          setBusinessWillCloseSoonMinutes(timeToClose / 60000)
        } else if (timeToClose > minutesToCloseSoon * 60000) {
          timeoutCloseSoon = setTimeout(() => {
            setBusinessWillCloseSoonMinutes(minutesToCloseSoon)
          }, (timeToClose - (minutesToCloseSoon * 60000)))
        }

        timeout = setTimeout(() => {
          setBusinessState({
            ...businessState,
            business: {
              ...businessState.business,
              open: false
            }
          })
          setIsBusinessClose(true)
        }, timeToClose)
      }
      return () => {
        timeout && clearTimeout(timeout)
        timeoutCloseSoon && clearTimeout(timeoutCloseSoon)
      }
    }
  }, [])

  useEffect(() => {
    let timeout = null

    if (businessWillCloseSoonMinutes) {
      timeout = setTimeout(() => {
        setBusinessWillCloseSoonMinutes(businessWillCloseSoonMinutes - 1)
      }, 60000)
    }

    return () => {
      timeout && clearTimeout(timeout)
    }
  }, [businessWillCloseSoonMinutes])

  useEffect(() => {
    if (business) {
      // Already this business (the first render): no update, no second render.
      if (businessState?.business === business) return
      setBusinessState({ ...businessState, business })
    } else if (!business) {
      getBusiness()
    }
  }, [business])

  const updateBusiness = async (businessId, updateParams = {}) => {
    setBusinessState({ ...businessState, loading: true })
    try {
      const { content: { result, error } } = await ordering.businesses(businessId).save(updateParams)

      if (!error) {
        setBusinessState({ ...businessState, business: result, loading: false })
      } else {
        setBusinessState({ ...businessState, business: result[0], loading: false, error })
      }
    } catch (err) {
      setBusinessState({ ...businessState, loading: false, error: err.message })
    }
  }

  useEffect(() => {
    if (!favoriteIds) return
    // Already marked as the favorites say: no update, no extra render.
    const isFavorite = favoriteIds?.includes(businessState?.business?.id)
    if (!!businessState?.business?.favorite === isFavorite) return

    if (isFavorite) {
      setBusinessState({
        ...businessState,
        business: { ...businessState?.business, favorite: true }
      })
    } else {
      setBusinessState({
        ...businessState,
        business: { ...businessState?.business, favorite: false }
      })
    }
  }, [favoriteIds])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          updateBusiness={updateBusiness}
          orderState={orderState}
          isBusinessClose={isBusinessClose}
          businessState={businessState}
          business={businessState.business}
          formatDate={formatDate}
          formatNumber={formatNumber}
          getBusinessOffer={getBusinessOffer}
          getBusinessMaxOffer={getBusinessMaxOffer}
          handleClick={handleClick}
          businessWillCloseSoonMinutes={businessWillCloseSoonMinutes}
          handleFavoriteBusiness={handleFavoriteBusiness}
        />
      )}
    </>
  )
}

BusinessController.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
   * Business, contains a object with all business properties
   */
  business: PropTypes.object,
  /**
   * businessId, this must be containt id or slug to get business from API
   */
  businessId: PropTypes.number,
  /**
   * businessAttributes, Array of attributes to get business from API
   */
  businessAttributes: PropTypes.arrayOf(PropTypes.string),
  /**
   * onBusinessClick, function to get click event and return business object after default behavior
   */
  onBusinessClick: PropTypes.func,
  /**
   * handleCustomClick, function to get click event and return business object without default behavior
   */
  handleCustomClick: PropTypes.func
}

const defaultProps = {
  minutesToCloseSoon: 30
}
