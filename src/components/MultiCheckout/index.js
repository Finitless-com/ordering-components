import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

import { useOrder } from '../../contexts/OrderContext'
import { useApi } from '../../contexts/ApiContext'
import { useSession } from '../../contexts/SessionContext'
import { useToast, ToastType } from '../../contexts/ToastContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useWebsocket } from '../../contexts/WebsocketContext'
import { isBlockingApplePayConfirmError } from '../../utils/applePayConfirm'
import { getPlaceAmount } from '../../utils/placeAmount'

/**
 * Component to manage Multi businesses checkout page behavior without UI component
 */

const returnMethods = ['epayco']

const forterGateways = ['braintree', 'paypal_braintree', 'google_pay_braintree', 'apple_pay_braintree']

export const MultiCheckout = (props) => {
  const {
    UIComponent,
    onPlaceOrderClick,
    cartUuid,
    userId,
    actionsBeforePlace,
    returnUrl,
    urlscheme
  } = props

  const qParams = userId ? `?user_id=${userId}` : ''

  const [ordering] = useApi()
  const socket = useWebsocket()
  /**
   * Session content
   */
  const [{ token }] = useSession()
  const [, { placeMultiCarts, confirmMultiCarts }] = useOrder()
  /**
* Toast state
*/
  const [, { showToast }] = useToast()
  const [, t] = useLanguage()
  /**
  * Delivery Instructions options
  */
  const [instructionsOptions, setInstructionsOptions] = useState({ loading: false, result: [{ id: null, enabled: true, name: t('EITHER_WAY', 'Either way') }], error: null })
  /**
  * Delivery instructions selected
  */
  const [deliveryOptionSelected, setDeliveryOptionSelected] = useState(undefined)
  const [loyaltyPlansState, setLoyaltyPlansState] = useState({ loading: true, error: null, result: [] })

  const [placing, setPlacing] = useState(false)
  const [paymethodSelected, setPaymethodSelected] = useState({})
  const [cartGroup, setCartGroup] = useState({ loading: true, error: null, result: null })
  const [walletState, setWalletState] = useState({ loading: false, error: null, result: null })
  const [checkoutFieldsState, setCheckoutFieldsState] = useState({ fields: [], loading: false, error: null })
  const [cartsRequireConfirm, setCartsRequireConfirm] = useState(null)
  const openCarts = (cartGroup?.result?.carts?.filter(cart => cart?.valid && cart?.status !== 1 && cart?.business_id) || null) || []
  const cartsInvalid = (cartGroup?.result?.carts?.filter(cart => cart?.status !== 1) || null) || []
  const totalCartsPrice = openCarts?.length && openCarts.reduce((total, cart) => { return total + cart?.total }, 0)
  const totalCartsFee = openCarts?.length && openCarts?.filter(cart => cart?.status !== 1 && cart?.valid)?.reduce((total, cart) => { return total + (cart?.delivery_price_with_discount) }, 0)

  const handleGroupPlaceOrder = async (confirmPayment) => {
    if (placing) {
      showToast(ToastType.Info, t('CART_IN_PROGRESS', 'Cart in progress'))
      return
    }
    let paymethodData = paymethodSelected?.paymethod_data
    if (paymethodSelected?.paymethod_data && ['stripe', 'stripe_connect', 'stripe_direct'].includes(paymethodSelected?.paymethod?.gateway)) {
      paymethodData = JSON.stringify({
        source_id: paymethodSelected?.paymethod_data?.id
      })
    }
    if (returnMethods.includes(paymethodSelected?.paymethod?.gateway)) {
      paymethodData = JSON.stringify(paymethodSelected.paymethod_data)
    }
    let payload = {
      amount: getPlaceAmount(cartGroup?.result)
    }
    if (paymethodSelected?.paymethod) {
      payload = {
        ...payload,
        paymethod_id: paymethodSelected?.paymethod?.id || paymethodSelected?.id
      }
    }
    if (paymethodData) {
      payload = {
        ...payload,
        paymethod_data: paymethodData
      }
    }
    if (paymethodSelected?.wallet_id) {
      payload = {
        ...payload,
        wallet_id: paymethodSelected.wallet_id,
        wallet_data: paymethodSelected.wallet_data
      }
    }
    if (forterGateways.includes(paymethodSelected?.paymethod?.gateway)) {
      const forterToken = typeof props.getForterToken === 'function' ? props.getForterToken() : null
      if (forterToken) {
        payload.forter_token = forterToken
      }
      const forterMobileUid = typeof props.getForterMobileUid === 'function' ? props.getForterMobileUid() : null
      if (forterMobileUid) {
        payload.forter_mobile_uid = forterMobileUid
      }
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json')
        const ipData = await ipRes.json()
        if (ipData?.ip) {
          payload.customer_ip = ipData.ip
        }
      } catch {}
    }
    setPlacing(true)
    const { error, result } = await placeMultiCarts(payload, cartUuid)

    if (error) {
      setPlacing(false)
      return
    }

    if ((result?.paymethod_data?.status === 2 || result?.status === 'payment_incomplete') && actionsBeforePlace) {
      await actionsBeforePlace(paymethodSelected, result)
    }

    if (confirmPayment && paymethodSelected?.gateway === 'global_apple_pay') {
      const paymentEvent = result?.payment_events?.find(event => event?.data?.extra?.client_secret)
      if (paymentEvent?.data?.extra?.client_secret) {
        const { error: confirmApplePayError } = await confirmPayment(paymentEvent?.data?.extra?.client_secret)
        if (isBlockingApplePayConfirmError(confirmApplePayError)) {
          showToast(ToastType.Error, confirmApplePayError?.message || confirmApplePayError?.localizedMessage)
          setPlacing(false)
          return
        }
      }
    }
    setPlacing(false)
    if (!error && result?.status !== 'payment_incomplete') {
      onPlaceOrderClick && onPlaceOrderClick(result)
    }
    setCartGroup({
      ...cartGroup,
      error,
      result
    })
  }

  const handleSelectPaymethod = (paymethod) => {
    setPaymethodSelected(paymethod === null
      ? {}
      : {
          ...paymethodSelected,
          ...paymethod,
          paymethod_data: returnMethods.includes(paymethod?.gateway)
            ? {
                ...paymethod?.paymethod_data,
                ...(returnUrl && {
                  success_url: returnUrl.replace('undefined', cartGroup?.result?.uuid),
                  cancel_url: returnUrl.replace('undefined', cartGroup?.result?.uuid),
                  urlscheme
                })
              }
            : paymethod?.paymethod_data
        })
  }

  const handleSelectWallet = async (isChecked, wallet) => {
    setWalletState({ ...walletState, loading: true, error: null })
    const url = isChecked
      ? `${ordering.root}/cart_groups/${cartGroup?.result?.uuid}/wallets`
      : `${ordering.root}/cart_groups/${cartGroup?.result?.uuid}/wallets/${wallet.id}`
    try {
      const response = await fetch(url,
        {
          method: isChecked ? 'POST' : 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-App-X': ordering.appId,
            'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
            'X-Socket-Id-X': socket?.getId()
          },
          ...(isChecked && {
            body: JSON.stringify({
              wallet_id: wallet.id
            })
          })
        }
      )
      const { error, result } = await response.json()
      if (!error) {
        setCartGroup({
          ...cartGroup,
          result: {
            ...cartGroup.result,
            wallets: result?.wallets,
            payment_events: result?.payment_events,
            balance: result?.balance
          }
        })
      }
      setWalletState({
        ...walletState,
        loading: false,
        error: error ? result : null,
        result: error ? null : result
      })
    } catch (err) {
      setWalletState({
        ...walletState,
        loading: false,
        error: err?.message ?? err
      })
    }
  }

  const handlePaymethodDataChange = (data) => {
    setPaymethodSelected({
      ...paymethodSelected,
      paymethod_data: data
    })
  }

  const getDeliveryOptions = async () => {
    try {
      const response = await fetch(`${ordering.root}/delivery_options${qParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        }
      })
      const { result, error } = await response.json()
      if (!error) {
        setInstructionsOptions({ loading: false, result: [...instructionsOptions.result, ...result] })
        return
      }
      setInstructionsOptions({ loading: false, error: true, result })
      showToast(ToastType.Error, result)
    } catch (err) {
      setInstructionsOptions({ loading: false, error: true, result: err.message })
      showToast(ToastType.Error, err.message)
    }
  }

  const multiHandleChangeDeliveryOption = async (value, cartUuidArr) => {
    try {
      const allPromise = cartUuidArr.map(cartId => {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
          const body = { delivery_option_id: value }
          if (userId) body.user_id = userId
          const response = await fetch(`${ordering.root}/carts/${cartId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `bearer ${token}`,
              'X-App-X': ordering.appId,
              'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
              'X-Socket-Id-X': socket?.getId()
            },
            body: JSON.stringify(body)
          })
          const { result, error } = await response.json()
          if (!error && result?.delivery_option_id === value) {
            resolve(result)
          } else {
            // eslint-disable-next-line prefer-promise-reject-errors
            reject(false)
          }
        })
      })
      await Promise.all(allPromise) && setDeliveryOptionSelected(value)
    } catch (err) {
      showToast(ToastType.Error, err.message)
    }
  }

  const handleChangeDeliveryOption = async (value) => {
    const cartUuidArr = openCarts.map(cart => cart?.uuid)
    multiHandleChangeDeliveryOption(value, cartUuidArr)
  }

  const getMultiCart = async (confirmAfterGetOrder = false, data) => {
    try {
      if (!cartUuid) return
      setCartGroup({
        ...cartGroup,
        loading: true
      })
      const response = await fetch(`${ordering.root}/cart_groups/${cartUuid}${qParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        }
      })
      const { result, error } = await response.json()
      setCartGroup({
        ...cartGroup,
        loading: false,
        result,
        error
      })
      if (confirmAfterGetOrder && result?.status === 'payment_incomplete') {
        handleConfirmMulticarts(data?.params)
      }
      if (cartsRequireConfirm === null) {
        setCartsRequireConfirm(result?.status === 'payment_incomplete')
      }
    } catch (err) {
      setCartGroup({
        ...cartGroup,
        loading: false,
        error: err.message
      })
    }
  }

  const getLoyaltyPlans = async () => {
    try {
      const req = await fetch(`${ordering.root}/loyalty_plans`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-App-X': ordering.appId,
            'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
            'X-Socket-Id-X': socket?.getId()
          }
        }
      )
      const { error, result } = await req.json()
      setLoyaltyPlansState({
        ...loyaltyPlansState,
        loading: false,
        result: error ? [] : result,
        rewardRate: result?.find(loyal => loyal.type === 'credit_point')?.accumulation_rate ?? 0
      })
    } catch (error) {
      setLoyaltyPlansState({
        ...loyaltyPlansState,
        loading: false,
        result: []
      })
    }
  }

  const getValidationFieldOrderTypes = async () => {
    try {
      setCheckoutFieldsState({ ...checkoutFieldsState, loading: true })

      const requestOptions = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      }
      const response = await fetch(`${ordering.root}/validation_field_order_types`, requestOptions)
      const content = await response.json()
      if (!content?.error) {
        setCheckoutFieldsState({ fields: content?.result, loading: false })
      } else {
        setCheckoutFieldsState({ ...checkoutFieldsState, loading: false, error: content?.result })
      }
    } catch (err) {
      setCheckoutFieldsState({ ...checkoutFieldsState, loading: false, error: [err.message] })
    }
  }

  const handleConfirmMulticarts = async (params = {}) => {
    const data = {
      ...params
    }
    const confirmCartRes = await confirmMultiCarts(cartUuid, data)
    if (confirmCartRes.result.order?.uuid || confirmCartRes?.result?.status === 'completed') {
      onPlaceOrderClick && onPlaceOrderClick(confirmCartRes.result.order || { id: confirmCartRes.result.id })
    }
  }

  useEffect(() => {
    if (deliveryOptionSelected === undefined) {
      setDeliveryOptionSelected(null)
    }
  }, [instructionsOptions])

  useEffect(() => {
    Promise.any([getDeliveryOptions(), getLoyaltyPlans()])
    getValidationFieldOrderTypes()
  }, [])

  useEffect(() => {
    if (typeof window?.location?.search === 'string') {
      const urlParams = new URLSearchParams(window?.location?.search)
      const paramsObj = Object.fromEntries(urlParams.entries())
      getMultiCart(true, {
        params: {
          ...paramsObj
        }
      })
    } else {
      getMultiCart()
    }
  }, [])

  useEffect(() => {
    if (cartGroup?.result?.status === 'completed') {
      onPlaceOrderClick && onPlaceOrderClick(cartGroup.result, { id: cartGroup.result.id })
    }
  }, [cartGroup?.result?.status])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          placing={placing}
          openCarts={openCarts}
          rewardRate={loyaltyPlansState?.rewardRate}
          loyaltyPlansState={loyaltyPlansState}
          totalCartsPrice={totalCartsPrice}
          paymethodSelected={paymethodSelected}
          handleSelectPaymethod={handleSelectPaymethod}
          handleGroupPlaceOrder={handleGroupPlaceOrder}
          handleSelectWallet={handleSelectWallet}
          handlePaymethodDataChange={handlePaymethodDataChange}
          handleChangeDeliveryOption={handleChangeDeliveryOption}
          deliveryOptionSelected={deliveryOptionSelected}
          instructionsOptions={instructionsOptions}
          cartGroup={cartGroup}
          walletState={walletState}
          totalCartsFee={totalCartsFee}
          cartsInvalid={cartsInvalid}
          checkoutFieldsState={checkoutFieldsState}
          getMultiCart={getMultiCart}
        />
      )}
    </>
  )
}

MultiCheckout.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType
}
