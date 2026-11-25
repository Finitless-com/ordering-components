export const parseUnaddressedOrderTypes = (configValue) => {
  if (!configValue) return []
  return configValue.split('|').map((value) => Number(value)).filter(Number.isFinite)
}

/**
 * Order types that never need the customer's address: the project's
 * `unaddressed_order_types_allowed`, plus pickup when the consumer enabled
 * `pickupWithoutAddress`, plus the consumer's `extraUnaddressedOrderTypes`.
 * Without options it is just the project's rule. No duplicates.
 * @param {string} configValue `unaddressed_order_types_allowed` value, e.g. '1|3'
 * @param {{ pickupWithoutAddress?: boolean, extraUnaddressedOrderTypes?: number[] }} [options] The order state works
 * @returns {number[]}
 */
export const resolveUnaddressedOrderTypes = (configValue, { pickupWithoutAddress, extraUnaddressedOrderTypes } = {}) => {
  const types = parseUnaddressedOrderTypes(configValue)
  if (pickupWithoutAddress) types.push(2)
  if (Array.isArray(extraUnaddressedOrderTypes)) types.push(...extraUnaddressedOrderTypes)
  return [...new Set(types)]
}

export const orderTypeRequiresAddress = (orderType, unaddressedTypes = []) => {
  if (!orderType) return false
  return !unaddressedTypes.includes(Number(orderType))
}

export const hasOrderAddress = (orderOptions) => {
  const address = orderOptions?.address
  if (address?.location?.lat == null || address?.location?.lng == null) return false
  return true
}

export const shouldRequireOrderAddress = (orderType, orderOptions, unaddressedTypes = []) => {
  return orderTypeRequiresAddress(orderType, unaddressedTypes) && !hasOrderAddress(orderOptions)
}
