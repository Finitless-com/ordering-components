import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useWebsocket } from '../../../contexts/WebsocketContext'
import { useLanguage } from '../../../contexts/LanguageContext'

/**
 * Component to manage websocket status without UI component
 */
export const WebsocketStatus = (props) => {
  const {
    UIComponent
  } = props

  const [, t] = useLanguage()
  const socket = useWebsocket()

  const [socketStatus, setSocketStatus] = useState(socket?.socket?.connected ? 1 : 2)
  const [connectedDate, setConnectedDate] = useState(
    window.localStorage.getItem('websocket-connected-date')
      ? new Date(window.localStorage.getItem('websocket-connected-date'))
      : new Date()
  )
  const [reconnectAttemptCount, setReconnectAttemptCount] = useState(0)

  const getWebsocketStatus = (num) => {
    switch (num) {
      case 0:
        return t('CONNECTING', 'Connecting')
      case 1:
        return t('OK', 'Ok')
      case 2:
        return t('DISCONNECTED', 'Disconnected')
    }
  }

  useEffect(() => {
    const ioSocket = socket?.socket
    if (!ioSocket) return
    // socket.io-client v3+ emits the reconnect events from the Manager (ioSocket.io), not from the
    // Socket. Listen on only one of them so an attempt is never counted twice: the Manager when
    // there is one, the Socket for a client without Manager.
    const reconnectEmitter = typeof ioSocket.io?.on === 'function' ? ioSocket.io : ioSocket
    // Whether the client will retry on its own: connecting, otherwise disconnected
    const statusAfterFailure = () => ioSocket.active ? 0 : 2

    // The connection may have completed (or dropped) before the listeners attached
    setReconnectAttemptCount(0)
    setSocketStatus(ioSocket.connected ? 1 : 2)

    const handleConnect = () => {
      setReconnectAttemptCount(0)
      setSocketStatus(1)
      setConnectedDate(new Date())
    }
    const handleDisconnect = () => {
      setSocketStatus(2)
    }
    const handleConnectError = () => {
      setSocketStatus(statusAfterFailure())
    }
    const handleReconnectAttempt = () => {
      setReconnectAttemptCount(prev => prev + 1)
      setSocketStatus(0)
    }
    const handleReconnectError = () => {
      setSocketStatus(statusAfterFailure())
    }
    const handleReconnectFailed = () => {
      setSocketStatus(2)
    }
    ioSocket.on('connect', handleConnect)
    ioSocket.on('disconnect', handleDisconnect)
    ioSocket.on('connect_error', handleConnectError)
    reconnectEmitter.on('reconnect_attempt', handleReconnectAttempt)
    reconnectEmitter.on('reconnect_error', handleReconnectError)
    reconnectEmitter.on('reconnect_failed', handleReconnectFailed)
    return () => {
      ioSocket.off('connect', handleConnect)
      ioSocket.off('disconnect', handleDisconnect)
      ioSocket.off('connect_error', handleConnectError)
      reconnectEmitter.off('reconnect_attempt', handleReconnectAttempt)
      reconnectEmitter.off('reconnect_error', handleReconnectError)
      reconnectEmitter.off('reconnect_failed', handleReconnectFailed)
    }
  }, [socket?.socket])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          socketStatus={socketStatus}
          connectedDate={connectedDate}
          getWebsocketStatus={getWebsocketStatus}
          reconnectAttemptCount={reconnectAttemptCount}
        />
      )}
    </>
  )
}

WebsocketStatus.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType
}
