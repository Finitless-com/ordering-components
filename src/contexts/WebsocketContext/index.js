import React, { createContext, useContext, useEffect, useState } from 'react'
import { useSession } from '../SessionContext'
import { Socket } from './socket'

/**
 * Create SessionContext
 * This context will manage the socket conection and provide an easy interface
 */
export const WebsocketContext = createContext()

// let socket = null

/**
 * The socket server every product connects to. The `url` of an app's socket settings is NOT read: every product's
 * configuration still carries the previous host, so honouring it would move them all back.
 */
export const DEFAULT_SOCKET_URL = 'https://sockets-v3.orderingplus.com'

/**
 * The socket server of these settings: `override_url` when an app sets it (a local or a staging socket server), else
 * the default one. Opt-in: without the key nothing changes for anyone.
 */
export const socketUrlOf = (settings) => {
  const override = settings?.override_url
  return typeof override === 'string' && override.trim() ? override.trim() : DEFAULT_SOCKET_URL
}

/**
 * Custom provider to session manager
 * This provider has a reducer for manage session state
 * @param {props} props
 */
export const WebsocketProvider = ({ settings, children, strategy }) => {
  const [session] = useSession()
  const [socket, setSocket] = useState()
  const [configs, setConfigs] = useState(settings)

  useEffect(() => {
    if (session.loading) return
    if (!configs.project) return
    if (session.token || !configs.use_root_point) {
      const _socket = new Socket({
        ...configs,
        accessToken: session.token,
        url: socketUrlOf(configs)
      })
      setSocket(_socket)
    } else {
      // Logged out in a multi-project build: there is no connection without a session, so do not
      // keep the previous user's one. A later login creates a new one.
      setSocket(undefined)
    }
  }, [session.loading, session.token, JSON.stringify(configs)])

  useEffect(() => {
    // Do not (re)connect a socket that belongs to a token the session no longer has: it is about
    // to be replaced or removed by the effect above, and connecting it would revive the previous
    // user's connection and rooms for a moment.
    if (socket && (socket.accessToken || null) === (session.token || null)) {
      socket.connect()
    }
    return () => {
      socket && socket.close()
    }
  }, [socket, session?.user?.id])

  // A socket that is replaced or removed is not used again: drop its rooms and queued listeners
  // too, so nothing of the previous session survives. (The effect above only closes it, because it
  // also runs when the user changes with the same token and then the same wrapper connects again.)
  useEffect(() => {
    return () => {
      socket && socket.dispose()
    }
  }, [socket])

  useEffect(() => {
    if (session.auth) return
    const projectInputInterval = setInterval(async () => {
      let project = null
      if (configs.use_root_point) {
        project = await strategy.getItem('project_name')
      } else {
        await strategy.removeItem('project_name')
        clearInterval(projectInputInterval)
      }
      if (project) {
        try {
          const parsedProject = JSON.parse(project)
          setConfigs((prevConfigs) => ({ ...prevConfigs, project: parsedProject }))
        } catch (error) {
          setConfigs((prevConfigs) => ({ ...prevConfigs, project }))
        }
        clearInterval(projectInputInterval)
      }
    }, 1000)
    return () => clearInterval(projectInputInterval)
  }, [session])

  return (
    <WebsocketContext.Provider value={socket}>
      {children}
    </WebsocketContext.Provider>
  )
}

/**
 * Hook to get and update websocket state
 */
export const useWebsocket = () => {
  const sockerManager = useContext(WebsocketContext)
  return sockerManager || new Socket({})
}
