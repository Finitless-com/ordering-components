const CONSUMED_CART_ERROR_MARKERS = [
  'error_you_have_not_cart',
  'you do not have a cart'
]

const toMessageList = (result) => {
  if (Array.isArray(result)) return result
  if (result == null) return []
  return [result]
}

export const isConsumedCartError = (result) => {
  return toMessageList(result).some((item) => {
    const text = typeof item === 'string' ? item : item?.message
    if (typeof text !== 'string') return false
    const normalized = text.trim().toLowerCase()
    return CONSUMED_CART_ERROR_MARKERS.some((marker) => normalized.includes(marker))
  })
}

export const shouldEvictConsumedCart = ({ error, result } = {}) => {
  if (!error && (result?.status === 1 || result?.order)) return true
  return Boolean(error && isConsumedCartError(result))
}

export const evictConsumedCart = (carts = {}, { cartUuid, error, result } = {}) => {
  const next = { ...carts }
  if (!cartUuid || !shouldEvictConsumedCart({ error, result })) {
    return next
  }

  Object.keys(next).forEach((key) => {
    if (next[key]?.uuid === cartUuid) {
      delete next[key]
    }
  })

  return next
}
