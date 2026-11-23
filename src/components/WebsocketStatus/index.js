import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useWebsocket } from '../../contexts/WebsocketContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useSession } from '../../contexts/SessionContext'
import { isSessionRejectedError } from '../../contexts/WebsocketContext/socket'

/**
 * Component to manage websocket status without UI component
 */
export const WebsocketStatus = (props) => {
  const {
    UIComponent,
    useReconnectByLogin
  } = props

  const [, t] = useLanguage()
  const socket = useWebsocket()
  const [{ auth }] = useSession()
  const [socketStatus, setSocketStatus] = useState(socket?.socket?.connected ? 1 : 2)
  // Mount time until the first `connect` event (or the wrapper's own connect time when the socket
  // was already connected when the listeners attached). It is always a Date.
  const [connectedDate, setConnectedDate] = useState(() => new Date())
  const [reconnectAttemptCount, setReconnectAttemptCount] = useState(0)
  // Last `connect_error` since the last successful connect: { message, isAuth }, or null
  const [connectError, setConnectError] = useState(null)

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
    // there is one (v2 forwards the same events to both), the Socket for a client without Manager.
    const reconnectEmitter = typeof ioSocket.io?.on === 'function' ? ioSocket.io : ioSocket
    // Whether the client will retry on its own: connecting, otherwise disconnected
    const statusAfterFailure = () => ioSocket.active ? 0 : 2

    // The connection may have completed (or dropped) before the listeners attached
    setReconnectAttemptCount(0)
    setConnectError(null)
    if (ioSocket.connected) {
      setSocketStatus(1)
      if (typeof socket.connectedAt === 'number') setConnectedDate(new Date(socket.connectedAt))
    } else {
      setSocketStatus(2)
    }

    const handleConnect = () => {
      setReconnectAttemptCount(0)
      setConnectError(null)
      setSocketStatus(1)
      setConnectedDate(new Date())
    }
    const handleDisconnect = () => {
      setSocketStatus(2)
    }
    const handleConnectError = (error) => {
      const message = typeof error === 'string' ? error : (error?.message ?? String(error))
      setConnectError({ message, isAuth: isSessionRejectedError({ message }) })
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

  useEffect(() => {
    if (auth && socket?.socket?.connected && !socket?.socket?.disconnected && useReconnectByLogin) {
      setReconnectAttemptCount(0)
      setSocketStatus(1)
      setConnectedDate(new Date())
    }
  }, [socket?.socket, auth])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          socketStatus={socketStatus}
          connectedDate={connectedDate}
          getWebsocketStatus={getWebsocketStatus}
          reconnectAttemptCount={reconnectAttemptCount}
          connectError={connectError ? connectError.message : null}
          connectErrorIsAuth={!!connectError?.isAuth}
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
