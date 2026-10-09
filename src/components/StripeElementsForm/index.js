import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useApi } from '../../contexts/ApiContext'
import { useSession } from '../../contexts/SessionContext'
import { useWebsocket } from '../../contexts/WebsocketContext'
import { getCardsGateway, isBusinessCardsGateway } from '../../utils/stripeCardsGateway'

/**
 * Component to manage stripe elements form behavior without UI component
 */
export const StripeElementsForm = (props) => {
  const {
    UIComponent,
    toSave,
    businessId
  } = props

  const [ordering] = useApi()
  const socket = useWebsocket()
  const [{ token }] = useSession()
  const [requirements, setRequirements] = useState()
  const cardsGateway = getCardsGateway(props.cardsGateway)

  /**
   * Method to get client id for create stripe payment method
   */
  const getRequirements = async () => {
    // Replace for a sdk method
    const businessParam = isBusinessCardsGateway(cardsGateway) && businessId ? `&business_id=${businessId}` : ''
    const response = await fetch(
      `${ordering.root}/payments/${cardsGateway}/requirements?type=add_card${businessParam}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        }
      }
    )
    const { result } = await response.json()
    setRequirements(result)
  }

  useEffect(() => {
    if (!token) return
    toSave && getRequirements()
  }, [token, cardsGateway])

  return (
    <UIComponent
      {...props}
      requirements={requirements}
    />
  )
}

StripeElementsForm.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
   * Business id to get cards from API
   */
  businessId: PropTypes.number,
  /**
   * Gateway that keeps the cards. Only `stripe_connect_v2` changes the endpoints (and needs `businessId`),
   * any other value (or none) uses the `stripe` ones
   */
  cardsGateway: PropTypes.string,
  /**
   * Create card to save or pay
   */
  toSave: PropTypes.bool,
  /**
   * save stripe public key to use stripe form
   */
  publicKey: PropTypes.string,
  /**
   * Save client secret id used in stripe for create a payment method
   */
  clientSecret: PropTypes.string,
  /**
   * method used for handle card token created
   */
  handleSource: PropTypes.func
}
