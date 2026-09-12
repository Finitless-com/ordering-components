import Decimal from 'decimal.js'

const toDecimal = (value) => {
  if (typeof value === 'string' && value.trim() === '') return null
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (typeof value === 'number' && !Number.isFinite(value)) return null

  try {
    const decimal = new Decimal(value)
    const number = decimal.toNumber()
    const preservesNonZeroValue = decimal.isZero() || number !== 0
    return decimal.isFinite() && Number.isFinite(number) && preservesNonZeroValue
      ? decimal
      : null
  } catch (error) {
    return null
  }
}

const isValidId = (id) => {
  if (typeof id === 'number') return Number.isFinite(id)
  return typeof id === 'string' && id.trim() !== ''
}

const idsMatch = (first, second) => {
  if (!isValidId(first) || !isValidId(second)) return false
  return String(first) === String(second)
}

const isSupportedOffer = (offer) => {
  const minimum = toDecimal(offer?.minimum)
  const rate = toDecimal(offer?.rate)

  return Boolean(
    offer &&
    isValidId(offer.id) &&
    offer.target === 2 &&
    offer.rate_type === 1 &&
    rate?.gte(100) &&
    offer.auto === true &&
    offer.enabled === true &&
    minimum?.gt(0)
  )
}

const matchesBusiness = (offer, business) => {
  const businessHasId = isValidId(business?.id)
  const businessHasSlug = typeof business?.slug === 'string' && business.slug.trim() !== ''
  if (!businessHasId && !businessHasSlug) return false

  if (offer.businesses == null) return true
  if (!Array.isArray(offer.businesses)) return false
  if (offer.businesses.length === 0) return true

  return offer.businesses.some((offerBusiness) => {
    const idMatches = businessHasId && idsMatch(offerBusiness?.id, business.id)
    const slugMatches = businessHasSlug &&
      typeof offerBusiness?.slug === 'string' &&
      offerBusiness.slug === business.slug

    return idMatches || slugMatches
  })
}

const compareOptionalDecimals = (first, second) => {
  const firstDecimal = toDecimal(first)
  const secondDecimal = toDecimal(second)

  if (firstDecimal && secondDecimal) return firstDecimal.comparedTo(secondDecimal)
  if (firstDecimal) return -1
  if (secondDecimal) return 1
  return 0
}

const compareIds = (first, second) => {
  const numericComparison = compareOptionalDecimals(first, second)
  const firstIsNumeric = Boolean(toDecimal(first))
  const secondIsNumeric = Boolean(toDecimal(second))

  if (firstIsNumeric || secondIsNumeric) return numericComparison
  return String(first).localeCompare(String(second))
}

export const selectFreeDeliveryOffer = ({
  publicOffers = [],
  cartOffers = [],
  business
} = {}) => {
  const normalizedPublicOffers = Array.isArray(publicOffers) ? publicOffers : []
  const normalizedCartOffers = Array.isArray(cartOffers) ? cartOffers : []
  const appliedIds = normalizedCartOffers
    .map((offer) => offer?.id)
    .filter(isValidId)

  const candidates = [...normalizedPublicOffers, ...normalizedCartOffers]
    .filter((offer) => isSupportedOffer(offer) && matchesBusiness(offer, business))

  candidates.sort((first, second) => {
    const firstIsApplied = appliedIds.some((id) => idsMatch(id, first.id))
    const secondIsApplied = appliedIds.some((id) => idsMatch(id, second.id))
    if (firstIsApplied !== secondIsApplied) return firstIsApplied ? -1 : 1

    const minimumComparison = toDecimal(first.minimum).comparedTo(toDecimal(second.minimum))
    if (minimumComparison !== 0) return minimumComparison

    const rankComparison = compareOptionalDecimals(first.rank, second.rank)
    if (rankComparison !== 0) return rankComparison

    return compareIds(first.id, second.id)
  })

  return candidates[0] || null
}

const hiddenState = ({ offer, minimum, diagnosticReason, ...amounts }) => ({
  status: 'hidden',
  offer: offer || null,
  minimum: minimum?.toNumber() ?? null,
  currentAmount: 0,
  remainingAmount: minimum?.toNumber() ?? null,
  progressPercent: 0,
  diagnosticReason,
  ...amounts
})

export const deriveFreeDeliveryProgress = ({
  offer,
  cart,
  orderType,
  hasLocation
} = {}) => {
  const minimum = isSupportedOffer(offer) ? toDecimal(offer.minimum) : null

  if (orderType !== 1) {
    return hiddenState({ offer, minimum, diagnosticReason: 'not-delivery' })
  }
  if (!hasLocation) {
    return hiddenState({ offer, minimum, diagnosticReason: 'missing-location' })
  }
  if (!minimum) {
    return hiddenState({ offer, minimum, diagnosticReason: 'unsupported-offer' })
  }

  const products = Array.isArray(cart?.products) ? cart.products : []
  if (products.length === 0) {
    if (cart?.reservation) {
      return hiddenState({ offer, minimum, diagnosticReason: 'reservation-only' })
    }

    return {
      status: 'awareness',
      offer,
      minimum: minimum.toNumber(),
      currentAmount: 0,
      remainingAmount: minimum.toNumber(),
      progressPercent: 0,
      diagnosticReason: null
    }
  }

  const currentAmount = toDecimal(cart?.subtotal)
  if (!currentAmount?.gte(0)) {
    return hiddenState({ offer, minimum, diagnosticReason: 'invalid-subtotal' })
  }

  const currentAmountNumber = currentAmount.toNumber()
  const remainingAmount = Decimal.max(minimum.minus(currentAmount), 0).toNumber()
  const progressPercent = Decimal.min(
    Decimal.max(currentAmount.dividedBy(minimum).times(100), 0),
    100
  ).toNumber()
  const isApplied = Array.isArray(cart?.offers) && cart.offers.some((cartOffer) => (
    idsMatch(cartOffer?.id, offer.id)
  ))

  if (isApplied) {
    return {
      status: 'unlocked',
      offer,
      minimum: minimum.toNumber(),
      currentAmount: currentAmountNumber,
      remainingAmount: 0,
      progressPercent: 100,
      diagnosticReason: null
    }
  }

  if (currentAmount.gte(minimum)) {
    return hiddenState({
      offer,
      minimum,
      currentAmount: currentAmountNumber,
      remainingAmount,
      progressPercent,
      diagnosticReason: 'threshold-not-applied'
    })
  }

  return {
    status: 'progress',
    offer,
    minimum: minimum.toNumber(),
    currentAmount: currentAmountNumber,
    remainingAmount,
    progressPercent,
    diagnosticReason: null
  }
}
