export const normalizeCartUuid = (value) => {
  if (typeof value !== 'string') return null
  const uuid = value.trim()
  return uuid && !/^(undefined|null)$/i.test(uuid) ? uuid : null
}
