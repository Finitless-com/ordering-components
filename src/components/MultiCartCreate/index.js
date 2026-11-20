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
    recoverMalformedRefresh,
    handleOnRedirectCheckout,
    handleOnRedirectMultiCheckout
  } = props

  const [{ token }] = useSession()
  const [ordering] = useApi()
  const socket = useWebsocket()
  const [orderState, { refreshOrderOptions }] = useOrder()

  const [groupCreationFailed, setGroupCreationFailed] = useState(false)
  const [refreshFailedGroup, setRefreshFailedGroup] = useState(null)
  const [retryingRefresh, setRetryingRefresh] = useState(false)
  const retryInFlight = useRef(false)
  const creationStarted = useRef(false)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const createMultiCart = async (cartList) => {
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
      if (mounted.current) setGroupCreationFailed(true)
      return
    }

    if (!mounted.current) return

    if (typeof uuid !== 'string' || !uuid.trim()) {
      setGroupCreationFailed(true)
      return
    }

    const refresh = recoverMalformedRefresh
      ? await refreshOrderOptions({ deferMalformedResponse: true })
      : await refreshOrderOptions()
    if (!mounted.current || refresh?.status === 401) return
    if (recoverMalformedRefresh && refresh?.invalidResponse) {
      setRefreshFailedGroup(uuid)
      return
    }
    handleOnRedirectMultiCheckout?.(uuid)
  }

  const retryRefresh = async () => {
    if (retryInFlight.current) return
    retryInFlight.current = true
    setRetryingRefresh(true)
    try {
      const refreshed = await refreshOrderOptions({ deferMalformedResponse: true, onlyRead: true })
      if (mounted.current && refreshed === true) {
        setRefreshFailedGroup(null)
        handleOnRedirectMultiCheckout?.(refreshFailedGroup)
      }
    } finally {
      retryInFlight.current = false
      if (mounted.current) setRetryingRefresh(false)
    }
  }

  useEffect(() => {
    if (orderState?.loading || creationStarted.current) return
    const cartList = getEligibleCartUuids(orderState?.carts)
    if (!cartList.length) return

    creationStarted.current = true
    if (cartList.length === 1 && handleOnRedirectCheckout) {
      handleOnRedirectCheckout(cartList[0])
      return
    }
    createMultiCart(cartList)
  }, [orderState?.loading, orderState?.carts])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          groupCreationFailed={groupCreationFailed}
          onRetryRefresh={refreshFailedGroup ? retryRefresh : undefined}
          retryingRefresh={retryingRefresh}
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
