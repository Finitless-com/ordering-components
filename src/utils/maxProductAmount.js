export const DEFAULT_MAX_PRODUCT_AMOUNT = 100

/**
 * Most units of one product the cart accepts, from the `max_product_amount`
 * config. The setting is `{ value }`; a missing or non-numeric value gives 100.
 * @param {object} configs The config state's `configs`
 * @returns {number}
 */
export const getMaxProductAmount = (configs) => {
  const amount = parseInt(configs?.max_product_amount?.value, 10)
  return Number.isFinite(amount) ? amount : DEFAULT_MAX_PRODUCT_AMOUNT
}
