export const freeDeliveryOffer = {
  id: 34,
  name: 'Free Delivery',
  businesses: [{ id: 6, slug: 'donospizza' }],
  minimum: 30,
  condition_type: 1,
  target: 2,
  rate_type: 1,
  rate: 100,
  auto: true,
  enabled: true,
  rank: 1
}

export const wrongBusinessFreeDeliveryOffer = {
  ...freeDeliveryOffer,
  id: 35,
  businesses: [{ id: 99, slug: 'another-business' }]
}

export const pickupOrderType = 2

export const fixedDeliveryDiscountOffer = {
  ...freeDeliveryOffer,
  id: 36,
  rate_type: 2,
  rate: 10
}

export const disabledFreeDeliveryOffer = {
  ...freeDeliveryOffer,
  id: 37,
  enabled: false
}

export const nonAutomaticFreeDeliveryOffer = {
  ...freeDeliveryOffer,
  id: 38,
  auto: false
}

export const missingThresholdFreeDeliveryOffer = {
  ...freeDeliveryOffer,
  id: 39,
  minimum: null
}

export const secondFreeDeliveryOffer = {
  ...freeDeliveryOffer,
  id: 40,
  minimum: 20,
  rank: 2
}
