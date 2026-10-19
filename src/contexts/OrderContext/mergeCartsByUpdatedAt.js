import dayjs from 'dayjs'

const isLocalCartNewer = (current, incoming) => {
  if (!current?.updated_at || !incoming?.updated_at) return false
  const currentTime = dayjs(current.updated_at)
  const incomingTime = dayjs(incoming.updated_at)
  return currentTime.isValid() && incomingTime.isValid() && currentTime.isAfter(incomingTime)
}

const pickNewerCart = (current, incoming) => {
  if (!incoming) return current
  if (!current) return incoming
  return isLocalCartNewer(current, incoming) ? current : incoming
}

export const mergeCartsByUpdatedAt = (prevCarts = {}, incomingCarts = {}) => {
  const next = { ...prevCarts }
  Object.keys(incomingCarts || {}).forEach((key) => {
    const cart = incomingCarts[key]
    if (!cart) return
    next[key] = pickNewerCart(next[key], cart)
  })
  return next
}

const isMergeableCart = (cart) => (
  cart !== null &&
  typeof cart === 'object' &&
  !Array.isArray(cart) &&
  (cart.business_id === null || Boolean(cart.business_id))
)

export const mergeCartResult = (prevCarts, cart) => {
  if (!isMergeableCart(cart)) return { ...(prevCarts || {}) }
  return mergeCartsByUpdatedAt(prevCarts, {
    [`businessId:${cart.business_id}`]: cart
  })
}

export const mergeCartsFromList = (prevCarts = {}, carts = []) => {
  const incoming = {}
  if (Array.isArray(carts)) {
    carts.forEach((cart) => {
      if (!isMergeableCart(cart)) return
      incoming[`businessId:${cart.business_id}`] = cart
    })
  }
  return mergeCartsByUpdatedAt(prevCarts, incoming)
}

export const resolveOrderOptionsCarts = (prevCarts, carts) => {
  if (!Array.isArray(carts)) {
    return { apply: false, carts: prevCarts }
  }
  return { apply: true, carts: mergeCartsFromList(prevCarts, carts) }
}
