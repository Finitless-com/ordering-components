import React, { useEffect, useRef, useState } from 'react'
import propTypes from 'prop-types'
import { useLanguage } from '../../contexts/LanguageContext'
import { useSession } from '../../contexts/SessionContext'
import { useOrder } from '../../contexts/OrderContext'

export const PaymentOptionSquare = (props) => {
  const {
    UIComponent,
    cartTotal,
    onPlaceOrderClick,
    body,
    data,
    setCreateOrder,
    singleFlight,
    beforePlace
  } = props

  const [, t] = useLanguage()
  const [{ user }] = useSession()
  const [, { confirmCart, placeCart }] = useOrder()
  const [isSquareReady, setIsSquareReady] = useState(false)
  const [methodSelected, setMethodSelected] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMethod, setIsLoadingMethod] = useState(false)
  const [isLoadingPlace, setIsLoadingPlace] = useState(false)
  // Opt-in `singleFlight`: one attempt at a time across card, ACH and gift card. The handlers are bound
  // once to the DOM buttons, so the lock lives in refs (state would be stale inside them)
  const flightRef = useRef(false)
  const pendingConfirmRef = useRef(false)
  const [pendingConfirm, setPendingConfirmState] = useState(false)
  const setPendingConfirm = (value) => {
    pendingConfirmRef.current = value
    setPendingConfirmState(value)
  }

  const [alertState, setAlertState] = useState({ open: false, content: [] })
  const [payments, setPayments] = useState(null)
  const [paymentRequest, setPaymentRequest] = useState({})
  const [digitalWalletPaymethod, setDigitalWalletPaymethod] = useState('')
  const paymentMethods = [
    { name: t('CARD_PAYMENTS', 'Card payments'), value: 'card_payments' },
    { name: t('ACH_BANK_TRANSFER', 'ACH Back transfer'), value: 'ach_bank_transfer' },
    // { name: t('DIGITAL_WALLETS', 'Digital Wallets'), value: 'digital_wallets' },
    { name: t('GIFT_CARDS', 'Gift Cards'), value: 'gift_cards' }
  ]

  const params = {
    paymethod_id: body.paymethod_id,
    amount: body.amount,
    delivery_zone_id: body.delivery_zone_id
  }

  // Takes the lock, synchronously: a second activation while a token is pending finds it taken.
  // A cart already placed whose confirmation failed (ACH) blocks every new attempt too.
  const takeFlight = () => {
    if (!singleFlight) return true
    if (flightRef.current || pendingConfirmRef.current) return false
    flightRef.current = true
    return true
  }

  // `beforePlace` (singleFlight only) is asked inside the lock, before the token: false stops the attempt
  const mayPlace = async () => !(singleFlight && beforePlace) || !!(await beforePlace())

  // What an attempt sends: a copy of its own with singleFlight, else the shared object as before
  const attemptParams = (token) => {
    if (!singleFlight) {
      params.paymethod_data = { token }
      return params
    }
    return { ...params, paymethod_data: { token } }
  }

  // Ends an attempt that did not leave the page busy for good: the loading and the lock go away
  const endAttempt = () => {
    if (singleFlight) flightRef.current = false
    setCreateOrder && setCreateOrder(false)
    setIsLoadingPlace(false)
  }

  useEffect(() => {
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = 'https://sandbox.web.squarecdn.com/v1/square.js'
    script.async = true
    script.onload = () => {
      setIsLoading(false)
      setIsSquareReady(true)
      initPaymentObject()
    }
    script.onerror = () => {
      setIsLoading(false)
      throw new Error('Square could not be loaded.')
    }

    document.body.appendChild(script)

    return () => {
      script.onload = null
      const cardButton = document.getElementById('card-button')
      cardButton && cardButton.removeEventListener('click')
      const achButton = document.getElementById('ach-button')
      achButton && achButton.removeEventListener('click')
      const giftCardButton = document.getElementById('gift-card-button')
      giftCardButton && giftCardButton.removeEventListener('click')
    }
  }, [])

  const initPaymentObject = async () => {
    const payments = window.Square.payments(
      data?.application_id,
      data?.location_id
    )
    setPayments(payments)
  }

  const initCardPayments = async () => {
    setIsLoadingMethod(true)
    const card = await payments.card()
    await card.attach('#card-container')
    setIsLoadingMethod(false)

    const eventHandler = async (e) => {
      e.preventDefault()
      if (!takeFlight()) return

      setIsLoadingPlace(true)
      setCreateOrder && setCreateOrder(true)
      try {
        if (!(await mayPlace())) {
          endAttempt()
          return
        }
        const result = await card.tokenize()
        if (result.status === 'OK') {
          const response = await placeCart(body.cartUuid, attemptParams(result.token))
          if (!response?.error && response?.result) {
            onPlaceOrderClick(null, null, response?.result)
            return
          }
          if (response?.result) {
            setAlertState({
              open: true,
              content: response?.result
            })
          }
        }
        if (result.status === 'INVALID') {
          setAlertState({
            open: true,
            content: result.errors.map(() => `ValidationError: ${result.errors[0].field}: ${result.errors[0].message}`)
          })
        }
      } catch (e) {
        setAlertState({
          open: true,
          content: e.message
        })
      }
      endAttempt()
    }

    const cardButton = document.getElementById('card-button')
    cardButton.addEventListener('click', eventHandler)
  }

  const initACHBankTransfer = async () => {
    setIsLoadingMethod(true)
    const ach = await payments.ach()
    setIsLoadingMethod(false)

    const eventHandler = async (e) => {
      e.preventDefault()
      if (!takeFlight()) return
      // singleFlight: the loading starts with the attempt, not after the token
      if (singleFlight) {
        setIsLoadingPlace(true)
        setCreateOrder && setCreateOrder(true)
      }
      try {
        if (!(await mayPlace())) {
          endAttempt()
          return
        }
        const result = await ach.tokenize({
          accountHolderName: user?.name
        })
        if (result.status === 'OK') {
          if (!singleFlight) {
            setIsLoadingPlace(true)
            setCreateOrder && setCreateOrder(true)
          }
          const response = await placeCart(body.cartUuid, attemptParams(result.token))
          if (!response?.error && response?.result) {
            const resultConfirm = await confirmCart(body.cartUuid)
            if (!resultConfirm?.error && resultConfirm?.result) {
              onPlaceOrderClick(null, null, resultConfirm?.result)
              return
            }
            setAlertState({
              open: true,
              content: resultConfirm
            })
            // singleFlight: the cart is placed and only its confirmation is missing: it is retried with
            // retryConfirm, never placed again. Before: the loading stayed on.
            if (singleFlight) {
              setPendingConfirm(true)
              endAttempt()
            }
            return
          }
          if (response?.result) {
            setAlertState({
              open: true,
              content: response?.result
            })
          }
        }
      } catch (e) {
        setAlertState({
          open: true,
          content: e.message
        })
      }
      endAttempt()
    }

    const achButton = document.getElementById('ach-button')
    achButton.addEventListener('click', eventHandler)
  }

  const initGiftCard = async () => {
    setIsLoadingMethod(true)
    const giftCard = await payments.giftCard()
    await giftCard.attach('#gift-card-container')
    setIsLoadingMethod(false)
    const eventHandler = async (e) => {
      e.preventDefault()
      if (!takeFlight()) return
      setIsLoadingPlace(true)
      setCreateOrder && setCreateOrder(true)
      try {
        if (!(await mayPlace())) {
          endAttempt()
          return
        }
        const result = await giftCard.tokenize()
        if (result.status === 'OK') {
          const response = await placeCart(body.cartUuid, attemptParams(result.token))
          if (!response?.error && response?.result) {
            onPlaceOrderClick(null, null, response?.result)
            return
          }
          if (response?.result) {
            setAlertState({
              open: true,
              content: response?.result
            })
          }
        }
      } catch (e) {
        setAlertState({
          open: true,
          content: e.message
        })
      }
      endAttempt()
    }

    const giftCardButton = document.getElementById('gift-card-button')
    giftCardButton.addEventListener('click', eventHandler)
  }

  const initDigitalWallets = async () => {
    // setIsLoadingMethod(true)
    const paymentRequest = payments.paymentRequest({
      countryCode: 'US',
      currencyCode: 'USD',
      total: {
        amount: cartTotal.toString(),
        label: t('TOTAL', 'Total')
      }
    })
    setPaymentRequest(paymentRequest)
  }

  const applePay = async () => {
    const applePay = await payments.applePay(paymentRequest)
    setIsLoadingMethod(false)
    const eventHandler = async (e) => {
      e.preventDefault()
      try {
        const result = await applePay.tokenize()
        if (result.status === 'OK') {
          params.paymethod_data = { token: result.token }
          const { error, result: resultApi } = await placeCart(body.cartUuid, params)
          if (!error) {
            onPlaceOrderClick(null, null, resultApi)
          }
        }
      } catch (e) {
        setAlertState({
          open: true,
          content: e.message
        })
      }
    }
    const applePayButtonTarget = document.getElementById('apple-pay-button')
    applePayButtonTarget.addEventListener('click', eventHandler)
  }

  const googlePay = async () => {
    const googlePay = await payments.googlePay(paymentRequest)
    await googlePay.attach('#google-pay-button')

    setIsLoadingMethod(false)
    const eventHandler = async (e) => {
      e.preventDefault()
      try {
        const result = await googlePay.tokenize()
        if (result.status === 'OK') {
          params.paymethod_data = { token: result.token }
          const { error, result: resultApi } = await placeCart(body.cartUuid, params)
          if (!error) {
            onPlaceOrderClick(null, null, resultApi)
          }
        }
      } catch (e) {
        setAlertState({
          open: true,
          content: e.message
        })
      }
    }
    const googlePayButtonTarget = document.getElementById('google-pay-button')
    googlePayButtonTarget.addEventListener('click', eventHandler)
  }

  // singleFlight: asks again for the confirmation of an ACH cart already placed (never places it again)
  const retryConfirm = async () => {
    if (!singleFlight || !pendingConfirmRef.current || flightRef.current) return
    flightRef.current = true
    setIsLoadingPlace(true)
    setCreateOrder && setCreateOrder(true)
    try {
      const resultConfirm = await confirmCart(body.cartUuid)
      if (!resultConfirm?.error && resultConfirm?.result) {
        setPendingConfirm(false)
        onPlaceOrderClick(null, null, resultConfirm?.result)
        return
      }
      setAlertState({
        open: true,
        content: resultConfirm
      })
    } catch (e) {
      setAlertState({
        open: true,
        content: e.message
      })
    }
    endAttempt()
  }

  const handleChangeMethodSelected = (method) => {
    setDigitalWalletPaymethod(null)
    setMethodSelected(method)
    method === 'card_payments'
      ? initCardPayments()
      : method === 'ach_bank_transfer'
        ? initACHBankTransfer()
        : method === 'digital_wallets'
          ? initDigitalWallets()
          : initGiftCard()
  }

  useEffect(() => {
    if (methodSelected !== 'digital_wallets') return
    if (digitalWalletPaymethod === 'apple_pay') applePay()
    if (digitalWalletPaymethod === 'google_pay') googlePay()
  }, [digitalWalletPaymethod])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          isSquareReady={isSquareReady}
          isLoading={isLoading}
          isLoadingMethod={isLoadingMethod}
          paymentMethods={paymentMethods}
          methodSelected={methodSelected}
          alertState={alertState}
          digitalWalletPaymethod={digitalWalletPaymethod}
          initCardPayments={initCardPayments}
          setDigitalWalletPaymethod={setDigitalWalletPaymethod}
          handleChangeMethodSelected={handleChangeMethodSelected}
          setAlertState={setAlertState}
          applePay={applePay}
          isLoadingPlace={isLoadingPlace}
          pendingConfirm={singleFlight ? pendingConfirm : undefined}
          retryConfirm={singleFlight ? retryConfirm : undefined}
        />
      )}
    </>
  )
}

PaymentOptionSquare.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: propTypes.elementType
}
