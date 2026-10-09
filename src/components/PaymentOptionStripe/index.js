import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useSession } from '../../contexts/SessionContext'
import { useApi } from '../../contexts/ApiContext'
import { useWebsocket } from '../../contexts/WebsocketContext'
import { useOrder } from '../../contexts/OrderContext'
import { useToast, ToastType } from '../../contexts/ToastContext'
import { getCardsGateway, isBusinessCardsGateway } from '../../utils/stripeCardsGateway'

/**
 * Component to manage payment option stripe behavior without UI component
 */
export const PaymentOptionStripe = (props) => {
  const {
    businessId,
    UIComponent,
    setCardList,
    gateway,
    onPaymentChange,
    paySelected,
    newCardAdded,
    paymethodSelectedInfo,
    paymethodV2Featured,
    setOpenModal,
    createBusinessUserPaymethod,
    handleChangeToCheckoutView
  } = props

  const [{ token, user }] = useSession()
  const [orderState, { changePaymethod }] = useOrder()
  const [ordering] = useApi()
  const socket = useWebsocket()
  const [, { showToast }] = useToast()
  /**
   * Contains and object to save cards, handle loading and error
   */
  const [cardsList, setCardsList] = useState({ cards: [], loading: true, error: null })
  /**
   * save stripe public key
   */
  const [publicKey, setPublicKey] = useState(props.publicKey)

  const [cardSelected, setCardSelected] = useState(null)
  const [cardDefault, setCardDefault] = useState(null)
  const [defaultCardSetActionStatus, setDefaultCardSetActionStatus] = useState({ loading: false, error: null })

  const requestState = {}

  const paymethodsWithoutSaveCards = ['credomatic']
  const paymethodsWithAutoSelectCard = ['braintree']
  /**
   * Gateway segment of the cards endpoints, `stripe` unless the gateway keeps its own cards
   */
  const cardsGateway = getCardsGateway(gateway)

  /**
   * method to get cards from API
   */
  const getCards = async () => {
    if (paymethodsWithoutSaveCards.includes(gateway)) {
      setCardsList({ cards: [], loading: false, error: null })
      setCardList({ cards: [], loading: false, error: null })
      return
    }
    setCardsList({ ...cardsList, loading: true })
    try {
      const source = {}
      requestState.paymentCards = source
      // The order of paymentCards params is businessId, userId. This sdk needs to be improved in the future,
      const { content: { result } } = await ordering.setAccessToken(token).paymentCards(businessId, user.id, null, cardsGateway).get({ cancelToken: source })
      const defaultCard = result?.find(card => card.default || card?.id === newCardAdded?.paymentMethodId)
      if (defaultCard) {
        setCardDefault({
          id: defaultCard.id,
          type: 'card',
          card: {
            brand: defaultCard.brand,
            last4: defaultCard.last4,
            zipcode: defaultCard?.zipcode
          }
        })
      }
      setCardsList({
        ...cardsList,
        loading: false,
        cards: result
      })
      setCardList && setCardList({
        ...cardsList,
        loading: false,
        cards: result
      })
    } catch (error) {
      setCardsList({
        ...cardsList,
        loading: false,
        error
      })
      setCardList && setCardList({
        ...cardsList,
        loading: false,
        error
      })
    }
  }

  /**
   * method to get cards from API
   */
  const deleteCard = async (card) => {
    try {
      if (paymethodsWithoutSaveCards.includes(gateway)) {
        setCardsList({ cards: [], loading: false, error: null })
        setCardSelected(null)
        setCardList({ cards: [], loading: false, error: null })
        return
      }
      // The order of paymentCards params is businessId, userId, cardId. This sdk needs to be improved in the future,
      // Gateways with their own cards find the credential by business, so they need the real business id.
      const cardsBusinessId = isBusinessCardsGateway(gateway) ? businessId : -1
      const { content: { error } } = await ordering.paymentCards(cardsBusinessId, user.id, card.id, cardsGateway).delete()
      if (!error) {
        cardsList.cards = cardsList.cards.filter(_card => _card.id !== card.id)
        setCardsList({
          ...cardsList
        })
        if (paySelected?.data?.id === card?.id) {
          setCardSelected(null)
          onPaymentChange && onPaymentChange(null)
        }
        getCards()
      }
    } catch (error) {
      console.error(error.message)
    }
  }
  /**
   * method to set card as default
   */
  const setDefaultCard = async (card) => {
    if (paymethodsWithoutSaveCards.includes(gateway)) return
    try {
      setDefaultCardSetActionStatus({ ...defaultCardSetActionStatus, loading: true })
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        },
        body: JSON.stringify({
          business_id: businessId,
          user_id: user.id,
          card_id: card.id
        })
      }
      const functionFetch = `${ordering.root}/payments/${cardsGateway}/cards/default`
      const response = await fetch(functionFetch, requestOptions)
      const content = await response.json()
      if (!content.error) {
        setCardDefault({
          id: card.id,
          type: 'card',
          card: {
            brand: card.brand,
            last4: card.last4,
            zipcode: card.zipcode
          }
        })
        setDefaultCardSetActionStatus({ loading: false, error: null })
      } else {
        setDefaultCardSetActionStatus({ loading: false, error: content.result })
      }
    } catch (error) {
      setDefaultCardSetActionStatus({ loading: false, error })
    }
  }
  /**
   * Method to get stripe credentials from API
   */
  const getCredentials = async () => {
    if (paymethodsWithoutSaveCards.includes(gateway)) return
    try {
      const { content: { result } } = await ordering.setAccessToken(token).paymentCards(undefined, undefined, null, cardsGateway).getCredentials()
      setPublicKey(result.publishable)
    } catch (error) {
      console.error(error.message)
    }
  }

  const handleCardClick = (card) => {
    if (paymethodsWithoutSaveCards.includes(gateway)) {
      setCardSelected(card)
    } else {
      setCardSelected({
        id: card.id,
        type: 'card',
        card: {
          brand: card.brand,
          last4: card.last4,
          zipcode: card.zipcode
        }
      })
    }
  }

  const handleNewCard = (card) => {
    cardsList.cards.unshift(card)
    setCardsList({ ...cardsList, card })
    if (paymethodsWithoutSaveCards.includes(gateway)) {
      setCardList({ ...cardsList, card })
    }
    handleCardClick(card)
  }

  const getPaymentUserCards = async () => {
    const where = {
      conditions: [{
        attribute: 'user_paymethod',
        conditions: [{
          attribute: 'business_id',
          value: {
            condition: '=',
            value: businessId
          }
        }],
        operator: 'AND'
      }]
    }
    try {
      const response = await fetch(`${ordering.root}/users/${user.id}/paymethods/${paymethodSelectedInfo?.id}/paymethods?where=${JSON.stringify(where)}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        }
      })
      const content = await response.json()
      if (!content.error) {
        const cards = content.result.map(card => ({
          id: card.id,
          type: card.type,
          last4: card?.type_data?.last4,
          brand: card?.type_data?.brand,
          card_token: card.external_id
        }))
        setCardsList({
          ...cardsList,
          loading: false,
          cards
        })
        setCardList && setCardList({
          ...cardsList,
          loading: false,
          cards
        })
      }
    } catch (error) {
      setCardsList({
        ...cardsList,
        loading: false,
        error
      })
      setCardList && setCardList({
        ...cardsList,
        loading: false,
        error
      })
    }
  }

  const deleteUserCard = async (card) => {
    try {
      const response = await fetch(`${ordering.root}/users/${user.id}/paymethods/${paymethodSelectedInfo?.id}/paymethods/${card.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        }
      })
      const content = await response.json()
      if (!content.error) {
        if (cardSelected?.id === card?.id) {
          setCardSelected(null)
          onPaymentChange && onPaymentChange({
            ...paymethodSelectedInfo,
            data: null
          })
          changePaymethod(businessId, paymethodSelectedInfo.id, '{}')
        }
        setCardsList({
          ...cardsList,
          cards: cardsList.cards.filter(c => c.id !== card.id)
        })
        setCardList && setCardList({
          ...cardsList,
          cards: cardsList.cards.filter(c => c.id !== card.id)
        })
      }
    } catch (error) {
      console.error(error.message)
    }
  }

  const getBusinessUserPaymethods = async () => {
    try {
      setCardsList({
        ...cardsList,
        loading: true
      })
      setCardList && setCardList({
        ...cardsList,
        loading: true
      })
      const url = gateway === 'braintree'
        ? `${ordering.root}/users/${user.id}/paymethods/${paymethodSelectedInfo?.id}/paymethods`
        : `${ordering.root}/business/${businessId}/paymethods/${paymethodSelectedInfo?.id}/users/${user.id}/paymethods`
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        },
        method: 'GET'
      })
      const content = await response.json()
      if (!content.error) {
        const cards = content.result.map(card => ({
          ...card,
          ...card.type_data,
          id: card.id,
          card_token: card.external_id
        }))
        setCardsList({
          ...cardsList,
          loading: false,
          cards
        })
        setCardList && setCardList({
          ...cardsList,
          loading: false,
          cards
        })
        return cards
      }
    } catch (error) {
      setCardsList({
        ...cardsList,
        loading: false,
        error
      })
      setCardList && setCardList({
        ...cardsList,
        loading: false,
        error
      })
    }
  }

  const deleteBusinessUserPaymethod = async (card) => {
    try {
      const url = gateway === 'braintree'
        ? `${ordering.root}/users/${user?.id}/paymethods/${paymethodSelectedInfo?.id}/paymethods/${card.id}`
        : `${ordering.root}/business/${businessId}/paymethods/${paymethodSelectedInfo?.id}/users/${user?.id}/paymethods/${card.id}`
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        }
      })
      const { result, error } = await response.json()
      if (error) {
        showToast(ToastType.Error, result)
        return
      }
      if (cardSelected?.id === card?.id) {
        setCardSelected(null)
        onPaymentChange && onPaymentChange({
          ...paymethodSelectedInfo,
          data: null
        })
        changePaymethod(businessId, paymethodSelectedInfo.id, '{}')
      }
      setCardsList({
        ...cardsList,
        cards: cardsList.cards.filter(c => c.id !== card.id)
      })
      setCardList && setCardList({
        ...cardsList,
        cards: cardsList.cards.filter(c => c.id !== card.id)
      })
    } catch (err) {
      showToast(ToastType.Error, err.message)
    }
  }

  useEffect(() => {
    if (!token || orderState?.loading || (handleChangeToCheckoutView && cardsList.cards.length > 0)) return

    const hasGetCardsFeature =
      paymethodSelectedInfo?.featured?.includes('get_cards') ||
      paymethodSelectedInfo?.paymethod?.featured?.includes('get_cards')

    if (hasGetCardsFeature) {
      if (gateway === 'izipay') {
        getPaymentUserCards()
      } else {
        getBusinessUserPaymethods()
      }
    }
  }, [token, orderState?.loading, gateway, paymethodSelectedInfo?.featured, paymethodSelectedInfo?.paymethod?.featured])

  useEffect(() => {
    if (!token) return

    const hasGetCardsFeature =
      paymethodSelectedInfo?.featured?.includes('get_cards') ||
      paymethodSelectedInfo?.paymethod?.featured?.includes('get_cards')

    if (!hasGetCardsFeature) {
      getCards()
    }
    if (!props.publicKey && !paymethodV2Featured) {
      getCredentials()
    }

    return () => {
      requestState.paymentCards?.cancel?.()
    }
  }, [token, props.publicKey, paymethodV2Featured, paymethodSelectedInfo?.featured, paymethodSelectedInfo?.paymethod?.featured, cardsGateway])

  useEffect(() => {
    if (newCardAdded) {
      getCards()
    }
  }, [JSON.stringify(newCardAdded)])

  useEffect(() => {
    if (!cardsList.loading && cardsList.cards?.length > 0 && !cardSelected && paymethodsWithAutoSelectCard.includes(gateway)) {
      const card = cardsList.cards[0]
      handleCardClick(card)
      onPaymentChange && onPaymentChange({
        ...paymethodSelectedInfo,
        data: {
          ...card,
          card: { ...card.type_data }
        }
      })
    }
  }, [cardsList.loading, cardsList.cards?.length])

  useEffect(() => {
    if (!window.addEventListener) return
    const handleMessage = async (event) => {
      if (event?.origin?.includes('plugins.orderingplus.com')) {
        let payment
        try {
          payment = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        } catch (error) {
          console.error('Could not parse message from iframe:', error)
          return
        }
        const cardToken = payment?.data?.card_token || payment?.data?.transient_token

        if (payment?.action === 'card' && !payment?.data?.transient_token) {
          setOpenModal && setOpenModal(prev => ({ ...prev, iframe: false }))
          const cards = await getBusinessUserPaymethods()
          if (cards?.length) {
            const { last4, brand } = payment?.data?.card_data || {}
            const addedCard = cards.find(c => c.last4 === last4 && c.brand === brand) || cards[cards.length - 1]
            handleCardClick(addedCard)
            onPaymentChange({
              ...paymethodSelectedInfo,
              data: {
                ...addedCard,
                card: { ...addedCard.type_data }
              }
            })
          }
          return
        }

        if (cardToken) {
          if (payment?.data?.transient_token) {
            const cybersourceData = {
              transient_token: cardToken,
              transaction_type: payment?.data?.transaction_type || 'PAYMENT',
              billing: payment?.data?.billing,
              card_data: payment?.data?.card_data
            }

            try {
              await changePaymethod(businessId, paymethodSelectedInfo.id, JSON.stringify({
                ...cybersourceData,
                success_url: window.location.href,
                cancel_url: window.location.href
              }))
              onPaymentChange({
                ...paymethodSelectedInfo,
                data: {
                  ...cybersourceData,
                  success_url: window.location.href,
                  cancel_url: window.location.href
                }
              })
            } catch (error) {
              console.error('Error al actualizar método de pago:', error)
            }

            setOpenModal && setOpenModal(prev => ({ ...prev, iframe: false }))
            handleChangeToCheckoutView && handleChangeToCheckoutView()
          } else if (payment?.data?.card_token) {
            createBusinessUserPaymethod?.({
              external_id: cardToken,
              type_data: JSON.stringify(payment?.data?.card_data),
              type: 'card'
            }, (result) => {
              setCardsList((prev) => ({
                ...prev,
                loading: false,
                cards: [...prev.cards, {
                  ...result,
                  ...result.type_data,
                  id: result.id,
                  card_token: result.external_id
                }]
              }))
              setCardList && setCardList((prev) => ({
                ...prev,
                loading: false,
                cards: [...prev.cards, {
                  ...result,
                  ...result.type_data,
                  id: result.id,
                  card_token: result.external_id
                }]
              }))
              onPaymentChange({
                ...paymethodSelectedInfo,
                data: {
                  ...result,
                  ...result.type_data,
                  id: result.id,
                  card_token: result.external_id,
                  card: {
                    ...result.type_data
                  }
                }
              })
              handleCardClick({
                ...result.type_data,
                id: result.id,
                card_token: result.external_id
              })
              setOpenModal && setOpenModal(prev => ({ ...prev, iframe: false }))
            })
          }
        }
      }
    }
    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [paymethodSelectedInfo?.gateway])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          cardsGateway={cardsGateway}
          cardSelected={cardSelected}
          cardDefault={cardDefault}
          cardsList={cardsList}
          setCardsList={setCardsList}
          setCardList={setCardList}
          handleCardClick={handleCardClick}
          publicKey={publicKey}
          handleNewCard={handleNewCard}
          deleteCard={deleteCard}
          setDefaultCard={setDefaultCard}
          deleteUserCard={deleteUserCard}
          deleteBusinessUserPaymethod={deleteBusinessUserPaymethod}
          defaultCardSetActionStatus={defaultCardSetActionStatus}
          paymethodsWithoutSaveCards={paymethodsWithoutSaveCards}
          getBusinessUserPaymethods={getBusinessUserPaymethods}
        />
      )}
    </>
  )
}

PaymentOptionStripe.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
   * Business id to get cards from API
   */
  businessId: PropTypes.number.isRequired,
  /**
   * Gateway of the paymethod. `stripe_connect_v2` keeps its cards under its own endpoints,
   * any other value (or none) uses the `stripe` ones
   */
  gateway: PropTypes.string,
  /**
   * User id to pass in endpoint to get cards from API,
   */
  userId: PropTypes.number
}
