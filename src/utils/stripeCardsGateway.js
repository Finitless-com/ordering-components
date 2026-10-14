/**
 * Gateway segment of the saved-cards endpoints (`/payments/{gateway}/cards`, `/requirements`, `/credentials`).
 * Every card gateway keeps its cards under `stripe`, except the ones that own a Stripe account of their own.
 */
export const DEFAULT_CARDS_GATEWAY = 'stripe'

export const GATEWAYS_WITH_OWN_CARDS = ['stripe_connect_v2']

export const getCardsGateway = (gateway) => (
  GATEWAYS_WITH_OWN_CARDS.includes(gateway) ? gateway : DEFAULT_CARDS_GATEWAY
)

/**
 * Those gateways look their credential up by business, so the API needs a real `business_id`.
 */
export const isBusinessCardsGateway = (gateway) => getCardsGateway(gateway) !== DEFAULT_CARDS_GATEWAY
