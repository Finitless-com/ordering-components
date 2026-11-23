import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

// Defines the three kinds of message that are displayed
export const ToastType = {
  Info: 'INFO',
  Error: 'ERROR',
  Success: 'SUCCESS'
}

// Creates the toast context
export const ToastContext = createContext()

/**
 * The toast's actions alone (`showToast`, `hideToast`), stable for the
 * provider's life: a provider that only shows toasts (session, order) reads
 * them here and is not rendered again each time a toast shows or hides.
 */
export const ToastActionsContext = createContext()

export const ToastProvider = ({ children }) => {
  // Calls setToastConfig in order to control the toast
  // toastConfig is null by default so the toast is hidden
  const [
    toastConfig,
    setToastConfig
  ] = useState(null)

  const showToast = useCallback((type, message, duration = 3000) => {
    setToastConfig({ type, message, duration })
  }, [])

  const hideToast = useCallback(() => {
    // Sets toast config to null in order to hide the toast
    setToastConfig(null)
  }, [])

  const actions = useMemo(() => ({ showToast, hideToast }), [showToast, hideToast])
  const value = useMemo(() => [toastConfig, actions], [toastConfig, actions])

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastContext.Provider value={value}>
        {children}
      </ToastContext.Provider>
    </ToastActionsContext.Provider>
  )
}

// hook context

export function useToast () {
  const toastManager = useContext(ToastContext)
  return toastManager || [{}, () => {}]
}

/** The toast's actions without its state: does not re-render when a toast shows or hides. */
export function useToastActions () {
  return useContext(ToastActionsContext) || { showToast: () => {}, hideToast: () => {} }
}
