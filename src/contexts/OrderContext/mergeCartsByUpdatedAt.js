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

export const mergeCartResult = (prevCarts, cart) => {
  if (!cart?.business_id) return { ...(prevCarts || {}) }
  return mergeCartsByUpdatedAt(prevCarts, {
    [`businessId:${cart.business_id}`]: cart
  })
}

export const mergeCartsFromList = (prevCarts = {}, carts = []) => {
  const incoming = {}
  if (Array.isArray(carts)) {
    carts.forEach((cart) => {
      if (!cart || typeof cart !== 'object' || !cart.business_id) return
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
