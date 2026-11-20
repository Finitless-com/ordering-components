export const getEligibleCartUuids = (carts) => Object.values(carts || {})
  .filter(cart => cart?.valid && cart.status !== 2 && cart.business_id && typeof cart.uuid === 'string' && cart.uuid.trim())
  .map(cart => cart.uuid)
