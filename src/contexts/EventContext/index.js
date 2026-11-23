import React, { createContext, useContext, useState } from 'react'
import { Emitter } from '../../components/Emitter'

/**
 * Create EventContext
 * This context will manage the app events and provide an interface
 */
export const EventContext = createContext()

/**
 * Custom provider to events manager
 * This provider has a reducer for manage event state
 * @param {props} props
 */
export const EventProvider = ({ children }) => {
  // One emitter for the provider's life: a new one on every render left the listeners of a
  // mounted component (an effect that subscribes once) on the old one, deaf to what the rest
  // of the app emitted afterwards.
  const [value] = useState(() => [new Emitter()])

  return (
    <EventContext.Provider value={value}>
      {children}
    </EventContext.Provider>
  )
}

/**
 * Hook to get and update events state
 */
export const useEvent = () => {
  const configManager = useContext(EventContext)
  return configManager || [new Emitter()]
}
