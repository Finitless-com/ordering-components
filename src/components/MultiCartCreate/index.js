import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useApi } from '../../contexts/ApiContext'
import { useOrder } from '../../contexts/OrderContext'
import { useSession } from '../../contexts/SessionContext'
import { useWebsocket } from '../../contexts/WebsocketContext'
import { getEligibleCartUuids } from './getEligibleCartUuids'

export const MultiCartCreate = (props) => {
  const {
    UIComponent,
    userId,
    handleOnRedirectCheckout,
    handleOnRedirectMultiCheckout
  } = props

  const [{ token }] = useSession()
  const [ordering] = useApi()
  const socket = useWebsocket()
  const [orderState, { refreshOrderOptions }] = useOrder()

  const [groupCreationFailed, setGroupCreationFailed] = useState(false)
  const creationStarted = useRef(false)

  const createMultiCart = async (cartList) => {
    if (cartList.length === 1) {
      handleOnRedirectCheckout?.(cartList[0])
    }

    const body = { carts: cartList }
    if (userId) body.user_id = userId

    let uuid
    try {
      const response = await fetch(`${ordering.root}/cart_groups`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      const payload = await response.json()
      if (!payload?.error) uuid = payload?.result?.uuid
    } catch {
      setGroupCreationFailed(true)
      return
    }

    if (typeof uuid !== 'string' || !uuid.trim()) {
      setGroupCreationFailed(true)
      return
    }

    await refreshOrderOptions()
    handleOnRedirectMultiCheckout?.(uuid)
  }

  useEffect(() => {
    if (orderState?.loading || creationStarted.current) return
    const cartList = getEligibleCartUuids(orderState?.carts)
    if (!cartList.length) return

    creationStarted.current = true
    createMultiCart(cartList)
  }, [orderState?.loading, orderState?.carts])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          groupCreationFailed={groupCreationFailed}
        />
      )}
    </>
  )
}

MultiCartCreate.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType
}
