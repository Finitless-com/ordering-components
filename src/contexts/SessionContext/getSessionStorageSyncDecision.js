export const getSessionStorageSyncDecision = ({ stored, current }) => {
  const storedToken = stored?.token || stored?.user?.session?.access_token
  const currentToken = current?.token

  if (storedToken) {
    const identityChanged = !currentToken ||
      storedToken !== currentToken ||
      stored?.user?.id !== current?.user?.id
    if (identityChanged) {
      return {
        action: 'login',
        user: stored.user,
        token: storedToken
      }
    }
    return { action: 'noop' }
  }

  if (currentToken) {
    return { action: 'logout' }
  }

  return { action: 'noop' }
}
