export const getLoginSessionDecision = ({ user, allowedLevels }) => {
  const token = user?.session?.access_token
  if (allowedLevels?.length > 0 && !allowedLevels.includes(user?.level)) {
    return {
      persistSession: false,
      logoutToken: token,
      error: 'YOU_DO_NOT_HAVE_PERMISSION'
    }
  }

  return {
    persistSession: true,
    user,
    token
  }
}
