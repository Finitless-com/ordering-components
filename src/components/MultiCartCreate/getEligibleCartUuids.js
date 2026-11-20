import { normalizeCartUuid } from '../../utils/normalizeCartUuid'

export const getEligibleCartUuids = (carts) => Object.values(carts || {})
  .filter(cart => cart?.valid && cart.status !== 2 && cart.business_id)
  .map(cart => normalizeCartUuid(cart.uuid))
  .filter(Boolean)
