/**
 * Whether changeDriverTip should skip the API call.
 * Percent mode compares driver_tip_rate. Fixed mode compares driver_tip.
 */
export const isUnchangedDriverTip = (cart, value, isFixedPrice) => {
  if (!cart) return true
  const current = isFixedPrice ? cart.driver_tip : cart.driver_tip_rate
  return current === value
}
