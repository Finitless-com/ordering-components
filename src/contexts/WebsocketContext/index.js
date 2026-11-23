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
    if (configs.project && (session.token || !configs.use_root_point)) {
      const _socket = new Socket({
        ...configs,
        accessToken: session.token,
        url: socketUrlOf(configs)
      })
      setSocket(_socket)
    }
  }, [session.loading, session.token, JSON.stringify(configs)])

  useEffect(() => {
    if (socket) {
      socket.connect()
    }
    return () => {
      socket && socket.close()
    }
  }, [socket, session?.user?.id])

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
