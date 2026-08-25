import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useSession } from '../../contexts/SessionContext'
import { useApi } from '../../contexts/ApiContext'
import { useWebsocket } from '../../contexts/WebsocketContext'
import { useToast, ToastType } from '../../contexts/ToastContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useEvent } from '../../contexts/EventContext'
import { useOrder } from '../../contexts/OrderContext'
import { useUtils } from '../../contexts/UtilsContext'
import { PROJECTS_WITH_LOGISTIC_DEFAULT_ETA } from '../../constants/logistic'
import { shouldApplyOrderFetch } from './shouldApplyOrderFetch'

export const OrderDetails = (props) => {
  const {
    orderId,
    orderAssingId,
    hashKey,
    UIComponent,
    userCustomerId,
    isFetchDrivers,
    driverAndBusinessId,
    sendCustomMessage,
    isDisabledOrdersRoom,
    isDriverNotification,
    isBusinessApp
  } = props

  const [{ user, token, loading }] = useSession()
  const accessToken = props.accessToken || token
  const [ordering] = useApi()
  const [, { showToast }] = useToast()
  const [, t] = useLanguage()
  const [events] = useEvent()
  const [{ carts }, { reorder, clearCart }] = useOrder()
  const [{ parsePrice }] = useUtils()

  const [orderState, setOrderState] = useState({ order: props.order ?? null, businessData: {}, loading: !props.order, error: null })
  const requestedOrderIdRef = useRef(orderId)
  requestedOrderIdRef.current = orderId
  const [drivers, setDrivers] = useState({ drivers: [], loadingDriver: false, error: null })
  const [messageErrors, setMessageErrors] = useState({ status: null, loading: false, error: null })
  const [messages, setMessages] = useState({ loading: true, error: null, messages: [] })
  const socket = useWebsocket()
  const [driverLocation, setDriverLocation] = useState(props.order?.driver?.location || orderState.order?.driver?.location || null)
  const [messagesReadList, setMessagesReadList] = useState([])
  const [driverUpdateLocation, setDriverUpdateLocation] = useState({ loading: false, error: null, newLocation: null })
  const [forceUpdate, setForceUpdate] = useState(null)
  const [reorderState, setReorderState] = useState({ loading: false, result: [], error: null })
  const [cartState, setCartState] = useState({ loading: false, error: null })
  const [showReservationAlert, setShowReservationAlert] = useState(false)
  const [loyaltyPlansState, setLoyaltyPlansState] = useState({ loading: true, result: [] })
  /**
   * Method to accept or reject a logistic order
   */

  /**
   * Save the delivery time (in minutes) on every order of an accepted logistic assign request
   * @param {Array} orderIds ids of the orders to update
   * @param {Number} deliveredIn delivery time in minutes
   */
  const handleUpdateLogisticOrdersEta = async (orderIds, deliveredIn) => {
    const ids = (orderIds ?? []).filter(Boolean)
    const parsedEta = parseInt(deliveredIn, 10)
    if (!ids.length || isNaN(parsedEta)) return []
    const setOrderEta = async (id) => {
      try {
        const { content: { result, error } } = await ordering.setAccessToken(accessToken).orders(id).save({ delivered_in: parsedEta, id })
        return error ? null : result
      } catch {
        return null
      }
    }
    return await Promise.all(ids.map(id => setOrderEta(id)))
  }

  const handleClickLogisticOrder = async (status, orderId, orders) => {
    try {
      const response = await fetch(`${ordering.root}/drivers/${user?.id}/assign_requests/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          status,
          user_id: user?.id
        })
      })
      const { result, error } = await response.json()
      if (!error) {
        if (status === 1) {
          const groupOrders = orders?.order_group?.orders ?? orders?.order?.order_group?.orders
          const targetOrderIds = (groupOrders?.length
            ? groupOrders.map(o => o?.id)
            : [orders?.order?.id ?? orders?.id]
          ).filter(Boolean)
          let defaultEta = null
          if (PROJECTS_WITH_LOGISTIC_DEFAULT_ETA.includes(ordering?.project)) {
            defaultEta = parseInt(t('LOGISTIC_DEFAULT_ETA_TIME', '10'), 10) || 10
            await handleUpdateLogisticOrdersEta(targetOrderIds, defaultEta)
          }
          showToast(
            ToastType.Success,
            t('SPECIFIC_ORDER_ACCEPTED', 'Your accepted the order number _NUMBER_').replace('_NUMBER_', orders?.id)
          )
          return { error: false, order: orders?.order ?? orders, orderIds: targetOrderIds, defaultEta }
        } else {
          showToast(
            ToastType.Info,
            t('SPECIFIC_ORDER_REJECTED', 'Your rejected the order number _NUMBER_').replace('_NUMBER_', orders?.id)
          )
        }
        return { error: false }
      }
      showToast(ToastType.Error, result)
      return { error: true, result }
    } catch (err) {
      showToast(ToastType.Error, err.message)
      return { error: true, result: err.message }
    }
  }

  const propsToFetch = ['header', 'slug']

  const deliveryMessages = {
    delivery: {
      text: 'outside delivery area, insert reasons to force update',
      value: 11
    },
    pickup: {
      text: 'outside pickup area, insert reasons to force update',
      value: 9
    }
  }

  const requestsState = {}

  /**
   * Method to format a price number
   * @param {Number} price
   */
  const formatPrice = price => price && parsePrice(price)

  /**
   * Method to Load message for first time
   */
  const loadMessages = async () => {
    try {
      setMessages({ ...messages, loading: true })
      const url = (userCustomerId || driverAndBusinessId)
        ? `${ordering.root}/orders/${orderState.order?.id}/messages?mode=dashboard`
        : `${ordering.root}/orders/${orderState.order?.id}/messages`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        }
      })
      const { error, result } = await response.json()
      if (!error) {
        setMessages({
          messages: result,
          loading: false,
          error: null
        })
      } else {
        setMessages({
          ...messages,
          loading: false,
          error: result
        })
      }
    } catch (error) {
      setMessages({ ...messages, loading: false, error: [error.Messages] })
    }
  }

  /**
   * Method to send a message
   * @param {string} spot
   */
  const sendMessage = async (spot) => {
    if (sendCustomMessage) {
      return sendCustomMessage(spot)
    }
    try {
      setMessageErrors({
        ...messageErrors,
        loading: true
      })
      const { status } = await fetch(`${ordering.root}/orders/${orderState.order?.id}/messages`, {
        method: 'post',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        },
        body: JSON.stringify({
          can_see: '0,2,3',
          comment: `I am on the parking number: ${spot}`,
          order_id: orderState.order?.id,
          type: 2
        })
      })
      setMessageErrors({
        ...messageErrors,
        loading: false,
        status
      })
    } catch (e) {
      setMessageErrors({
        ...messageErrors,
        loading: false,
        error: [e.message]
      })
    }
  }

  /**
   * Sends a courtesy chat message to the customer with the estimated delivery/preparation
   * time, replicating the old v4 behavior where the customer received a dedicated push with
   * the time. Fired after any successful save whose body sets delivered_in or prepared_in
   * (with or without a status change). The text uses the app's own language. can_see is '3'
   * (customer only) so it triggers the customer push without spamming business/driver, who
   * already see the time via the status-change message.
   */
  const notifyEstimatedTimeMessage = async (sentBody, isFormData, order) => {
    try {
      if (isFormData || !sentBody || typeof sentBody !== 'object') return
      // Fire whenever the time field is present in the saved body, regardless of any
      // status change: prepared_in / delivered_in can be set or edited without the
      // order status changing (e.g. editing the time on an already-accepted order).
      let key
      let minutes
      if (sentBody.delivered_in != null) {
        key = 'ESTIMATED_DELIVERY_TIME'
        minutes = sentBody.delivered_in
      } else if (sentBody.prepared_in != null) {
        key = 'ESTIMATED_PREPARATION_TIME'
        minutes = sentBody.prepared_in
      } else {
        return
      }

      // Always use the app's own language (driver/business). We intentionally do NOT
      // resolve the customer's language to keep this simple; mismatches are rare.
      const template = t(key)
      if (!template || template === key) return

      // The dictionary text normally contains the `_min_` placeholder
      // (e.g. "The estimated delivery time is _min_ minutes"). Replace it with the
      // minutes; if the project's translation has no `_min_`, the text is sent as-is.
      const comment = String(template)
        .replace('_min_', String(minutes))
        .replace('_order_', String(order?.id ?? ''))

      await fetch(`${ordering.root}/orders/${order?.id ?? orderId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-App-X': ordering?.appId,
          'X-INTERNAL-PRODUCT-X': ordering?.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        },
        body: JSON.stringify({ comment, type: 2, can_see: '3', order_id: order?.id ?? orderId })
      })
    } catch (e) {
      // Courtesy message only — never block or fail the status update because of it.
    }
  }

  /**
   * Method to update differents orders status
  */
  const handleChangeOrderStatus = async (status, isAcceptOrReject = {}, options) => {
    const dataToSave = options?.dataToSave
    if (dataToSave) {
      const order = Object.assign(orderState.order, { ...dataToSave, oldStatus: orderState.order?.status })
      setOrderState({ ...orderState, order })
      return order
    }

    try {
      const statusesRequiringLocation = [3, 9, 11, 26]
      const requiresLocation = statusesRequiringLocation.includes(status) && options?.location

      let bodyToSend = Object.keys(isAcceptOrReject || {}).length > 0 ? isAcceptOrReject : { status }

      if (requiresLocation) {
        bodyToSend = {
          ...bodyToSend,
          location: {
            lat: options.location.latitude,
            lng: options.location.longitude
          }
        }
      }

      setOrderState({ ...orderState, loading: true })

      const isFormData = bodyToSend && bodyToSend instanceof FormData

      let result, error

      if (isFormData) {
        const response = await fetch(`${ordering.root}/orders/${orderState?.order?.id ?? orderId}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-App-X': ordering.appId,
            'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
            'X-Socket-Id-X': socket?.getId()
          },
          body: bodyToSend
        })

        const responseData = await response.json()
        result = responseData.result
        error = responseData.error
      } else {
        const requestOptions = {}
        const { content } = await ordering.setAccessToken(token).orders(orderState.order?.id ?? orderId).save(bodyToSend, requestOptions)
        result = content.result
        error = content.error
      }

      if (!error) {
        setOrderState({
          ...orderState,
          order: Object.assign(orderState.order, result),
          loading: false
        })
        if (result?.status === 7 && result?.reservation && isBusinessApp) {
          setShowReservationAlert(true)
        }
        const updatedOrder = Object.assign(orderState.order, result)
        notifyEstimatedTimeMessage(bodyToSend, isFormData, updatedOrder)
        return updatedOrder
      }
      if (error) {
        const selected = result.includes(deliveryMessages.delivery.text)
          ? deliveryMessages.delivery
          : result.includes(deliveryMessages.pickup.text)
            ? deliveryMessages.pickup
            : null
        if (selected) {
          setForceUpdate(null)
          setOrderState({ ...orderState, loading: false })
          setForceUpdate(selected.value)
        } else {
          const message = Array.isArray(result) ? result[0] : typeof result === 'string' ? result : 'INTERNAL_ERROR'
          const defaultMessage = message !== 'INTERNAL_ERROR' ? message : t('INTERNAL_ERROR', 'Internal Error')

          setOrderState({ ...orderState, error: [defaultMessage], loading: false })
        }
        return null
      }
    } catch (err) {
      setOrderState({ ...orderState, loading: false, error: [err?.message || t('NETWORK_ERROR', 'Network Error')] })
      return null
    }
  }

  const updateDriverPosition = async (newLocation = {}) => {
    try {
      setDriverLocation({ ...driverUpdateLocation, loading: true })
      const { content: { error, result } } = await ordering.setAccessToken(token).users(user?.id).driverLocations().save(newLocation)
      if (error) {
        setDriverUpdateLocation({ ...driverUpdateLocation, loading: false, error: [result[0] || result || t('ERROR_UPDATING_POSITION', 'Error updating position')] })
      } else {
        setDriverUpdateLocation({ ...driverUpdateLocation, loading: false, newLocation: { ...newLocation, ...result } })
      }
    } catch (error) {
      setDriverUpdateLocation({ ...driverUpdateLocation, loading: false, error: [error?.message || t('NETWORK_ERROR', 'Network Error')] })
    }
  }

  /**
     * Method to assign a driver for order
  */
  const handleAssignDriver = async (driverId) => {
    try {
      const bodyToSend = { driver_id: driverId }
      setOrderState({ ...orderState, loading: true })
      const { content: { error, result } } = await ordering
        .setAccessToken(token)
        .orders(orderState?.order?.id ?? orderId)
        .save(bodyToSend)

      setOrderState({
        ...orderState,
        loading: false,
        order: Object.assign(orderState.order, result),
        error: error ? result : null
      })
    } catch (e) {
      setOrderState({
        ...orderState,
        loading: false,
        error: e?.message ? drivers.error?.push(e?.message) : ['ERROR']
      })
    }
  }

  /**
   * handler send message with spot info
   * @param {number} param0
   */
  const handlerSubmitSpotNumber = ({ spot }) => {
    sendMessage(spot)
  }

  /**
   * Method to get order from API
   */
  const getOrder = async () => {
    const requestedOrderId = orderId
    setOrderState(prev => ({ ...prev, loading: true }))
    const source = {}
    requestsState.order = source
    requestsState.business = source
    const options = {}
    if (hashKey) {
      options.headers = {
        'X-uuid-access-X': hashKey
      }
    }
    if (userCustomerId || driverAndBusinessId) {
      options.query = {
        mode: 'dashboard'
      }
    }

    try {
      let result, error
      if (orderAssingId) {
        const response = await fetch(`${ordering.root}/drivers/${user.id}/assign_requests/${orderAssingId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-App-X': ordering.appId,
            'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
            'X-Socket-Id-X': socket?.getId()
          }
        })
        const res = await response.json()
        result = res.result
        error = res.error
      } else {
        const { content } = await ordering.setAccessToken(token).orders(orderId).get({ ...options, cancelToken: source })
        result = content.result
        error = content.error
      }
      if (!shouldApplyOrderFetch(requestedOrderId, requestedOrderIdRef.current)) return
      const order = error ? null : result?.order || result
      let err = error ? Array.isArray(result) ? result[0] : result : null
      let businessData = null
      if (err) {
        setOrderState(prev => ({
          ...prev,
          loading: false,
          error: [err ?? 'ERROR']
        }))
        return
      }
      try {
        const { content } = await ordering.setAccessToken(token).businesses(order?.business_id).select(propsToFetch).get({ cancelToken: source })
        if (!shouldApplyOrderFetch(requestedOrderId, requestedOrderIdRef.current)) return
        businessData = content.result
        content.error && (err = content.result[0])
      } catch (e) {
        if (!shouldApplyOrderFetch(requestedOrderId, requestedOrderIdRef.current)) return
        err = [e.message ?? 'ERROR']
      }

      if (isFetchDrivers) {
        getDrivers(order?.id ?? orderId)
      }

      if (!shouldApplyOrderFetch(requestedOrderId, requestedOrderIdRef.current)) return
      setOrderState(prev => ({
        ...prev,
        loading: false,
        order,
        businessData,
        error: err
      }))
    } catch (e) {
      if (!shouldApplyOrderFetch(requestedOrderId, requestedOrderIdRef.current)) return
      setOrderState(prev => ({
        ...prev,
        loading: false,
        error: [e.message ?? 'ERROR']
      }))
    }
  }

  const readMessages = async () => {
    const messageId = messages?.messages[messages?.messages?.length - 1]?.id
    if (!messageId) return
    try {
      const response = await fetch(`${ordering.root}/orders/${orderState.order?.id}/messages/${messageId}/read`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        }
      })
      const { result } = await response.json()

      setMessagesReadList(result)
      events.emit('order_message_read', orderState.order?.id)
    } catch {}
  }

  const getDrivers = async (orderId) => {
    try {
      setDrivers({ ...drivers, loadingDriver: true })
      const { content: { error, result } } = await ordering
        .setAccessToken(token)
        .controls(orderId)
        .get()

      setDrivers({
        ...drivers,
        loadingDriver: false,
        drivers: result.drivers,
        error: error ? result : null
      })
    } catch (e) {
      setDrivers({
        ...drivers,
        loadingDriver: false,
        error: e?.message ? drivers.error?.push(e?.message) : ['ERROR']
      })
    }
  }

  const handleReorder = async (orderId) => {
    if (!orderId) return
    try {
      setReorderState({ ...reorderState, loading: true })
      const { error, result } = await reorder(orderId)
      setReorderState({
        ...reorderState,
        loading: false,
        error,
        result
      })
      return !error ? result : null
    } catch (err) {
      setReorderState({
        ...reorderState,
        loading: false,
        error: true,
        result: [err?.message]
      })
    }
  }

  /**
 * Method to remove products from cart
 */
  const handleRemoveCart = async () => {
    const uuid = carts[`businessId:${orderState?.order.business_id}`]?.uuid
    if (!uuid) return
    try {
      setCartState({
        ...cartState,
        loading: true
      })
      const content = await clearCart(uuid)
      if (!content?.error) {
        handleReorder(orderState?.order?.id)
        setCartState({
          loading: false,
          error: null
        })
      } else {
        setCartState({
          loading: false,
          error: content?.result
        })
      }
    } catch (error) {
      setCartState({
        loading: false,
        error: [error.message]
      })
    }
  }

  /**
   * Method to get room socket
   * @param {String} roomType drivers, orders
   * @returns socket room
   */
  const getRoom = (roomType) => {
    if (!token) {
      return {
        room: roomType,
        project: ordering.project,
        role: 'public',
        user_id: hashKey
      }
    }
    return user?.level === 0 ? 'orders' : `orders_${userCustomerId || user?.id}`
  }

  useEffect(() => {
    !orderState.loading && loadMessages()
  }, [orderState?.order?.id, orderState?.order?.status, orderState.loading])

  useEffect(() => {
    if (props.order && !isDriverNotification) {
      setOrderState({
        ...orderState,
        loading: false,
        order: props.order
      })
      if (isFetchDrivers) {
        getDrivers(props.order?.id ?? orderId)
      }
    } else if (
      (!orderState.order ||
        (orderId && orderId !== (isNaN(Number(orderId)) ? orderState.order?.uuid : orderState.order?.id))
      ) && !isDriverNotification
    ) {
      getOrder()
    }

    return () => {
      if (requestsState.order?.cancel) {
        requestsState.order.cancel()
      }
      if (requestsState.business?.cancel) {
        requestsState.business.cancel()
      }
    }
  }, [props.order, orderState.order?.id, orderId])

  useEffect(() => {
    if (orderId && isDriverNotification) {
      getOrder()
    }
  }, [orderId, isDriverNotification])

  useEffect(() => {
    const getLoyaltyPlans = async () => {
      try {
        const req = await fetch(`${ordering.root}/loyalty_plans`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'X-App-X': ordering.appId,
            'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
            'X-Socket-Id-X': socket?.getId()
          }
        })
        const { error, result } = await req.json()
        setLoyaltyPlansState({ loading: false, result: error ? [] : result })
      } catch (err) {
        setLoyaltyPlansState({ loading: false, result: [] })
      }
    }
    if (accessToken) getLoyaltyPlans()
  }, [accessToken])

  useEffect(() => {
    if (orderState.loading || loading || !socket?.socket) return
    const handleUpdateOrderDetails = (order) => {
      if (order?.id !== orderState.order?.id) return
      showToast(ToastType.Info, t('UPDATING_ORDER', 'Updating order...'), 1000)
      delete order.total
      delete order.subtotal
      setOrderState({
        ...orderState,
        order: Object.assign(orderState.order, order)
      })
      events.emit('order_updated', Object.assign(orderState.order, order))
      if (order?.driver?.location) {
        setDriverLocation(order.driver.location)
      }
    }
    const handleTrackingDriver = (data) => {
      const isExternal = data?.source === 'external'
      const incomingId = isExternal ? data?.external_driver_id : data?.driver_id
      const expectedId = isExternal
        ? orderState?.order?.external_driver_id
        : orderState?.order?.driver_id
      if (!incomingId || incomingId !== expectedId) return
      const newLocation = data?.location ?? { lat: -37.9722342, lng: 144.7729561 }
      setDriverLocation(newLocation)
      if (isExternal) return
      setOrderState({
        ...orderState,
        order: {
          ...orderState.order,
          driver: {
            ...orderState.order?.driver,
            location: newLocation
          }
        }
      })
    }

    const hasAnyDriver = !!(orderState.order?.driver_id || orderState.order?.external_driver_id)
    const publicDriversRoom = (!token && hasAnyDriver) ? getRoom('drivers') : null
    const customerOrdersRoom = (token && hasAnyDriver)
      ? {
          room: 'orders',
          project: ordering.project,
          role: 'customer',
          user_id: userCustomerId || user?.id
        }
      : null
    if (!isDisabledOrdersRoom) socket.join(getRoom('orders'))
    if (publicDriversRoom) {
      socket.join(publicDriversRoom)
    }
    if (customerOrdersRoom) {
      socket.join(customerOrdersRoom)
    }
    socket.socket.on('connect', () => {
      if (!isDisabledOrdersRoom) socket.join(getRoom('orders'))
      if (publicDriversRoom) {
        socket.join(publicDriversRoom)
      }
      if (customerOrdersRoom) {
        socket.join(customerOrdersRoom)
      }
    })
    socket.on('tracking_driver', handleTrackingDriver)
    socket.on('update_order', handleUpdateOrderDetails)
    return () => {
      if (!isDisabledOrdersRoom && !props.disabledLeaveOrderSocket) socket.leave(getRoom('orders'))
      socket.off('update_order', handleUpdateOrderDetails)
      socket.off('tracking_driver', handleTrackingDriver)
    }
  }, [orderState?.loading, socket?.socket, loading, userCustomerId, orderState.order?.driver_id, orderState.order?.external_driver_id, orderState.order?.id, hashKey])

  useEffect(() => {
    if (messages.loading) return
    const handleNewMessage = (message) => {
      const actualChat = messages?.messages?.find(_message => _message?.order_id === message?.order?.id)
      const found = messages.messages.find(_message => _message.id === message.id)
      if (!found && actualChat) {
        setMessages({
          ...messages,
          messages: [...messages.messages, message]
        })
      }
    }
    socket.on('message', handleNewMessage)
    return () => {
      socket.off('message', handleNewMessage)
    }
  }, [messages, socket, orderState.order?.status, userCustomerId])

  useEffect(() => {
    if (!socket?.socket) return
    const messagesOrdersRoom = user?.level === 0 ? 'messages_orders' : `messages_orders_${userCustomerId || user?.id}`
    socket.join(messagesOrdersRoom)
    socket.socket.on('connect', () => {
      socket.join(messagesOrdersRoom)
    })
    return () => {
      // neccesary refactor
      if (!isDisabledOrdersRoom) socket.leave(messagesOrdersRoom)
    }
  }, [socket?.socket, userCustomerId])

  useEffect(() => {
    const handleCustomerReviewed = (review) => {
      setOrderState({
        ...orderState,
        order: { ...orderState.order, user_review: review }
      })
    }
    events.on('customer_reviewed', handleCustomerReviewed)
    return () => {
      events.off('customer_reviewed', handleCustomerReviewed)
    }
  }, [orderState])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          order={orderState}
          updateDriverPosition={updateDriverPosition}
          driverLocation={driverLocation}
          messageErrors={messageErrors}
          formatPrice={formatPrice}
          handleAssignDriver={handleAssignDriver}
          handlerSubmit={handlerSubmitSpotNumber}
          handleChangeOrderStatus={handleChangeOrderStatus}
          messages={messages}
          drivers={drivers}
          setMessages={setMessages}
          readMessages={readMessages}
          messagesReadList={messagesReadList}
          driverUpdateLocation={driverUpdateLocation}
          setDriverUpdateLocation={setDriverUpdateLocation}
          forceUpdate={forceUpdate}
          getOrder={getOrder}
          reorderState={reorderState}
          handleReorder={handleReorder}
          handleRemoveCart={handleRemoveCart}
          cartState={cartState}
          handleClickLogisticOrder={handleClickLogisticOrder}
          handleUpdateLogisticOrdersEta={handleUpdateLogisticOrdersEta}
          loadMessages={loadMessages}
          showReservationAlert={showReservationAlert}
          setShowReservationAlert={setShowReservationAlert}
          loyaltyPlansState={loyaltyPlansState}
        />
      )}
    </>
  )
}

OrderDetails.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
   * This must be contains orderId to fetch
   */
  orderId: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.string
  ]),
  /**
   * Order, this must be contains an object with all order info
   */
  order: PropTypes.object
}
