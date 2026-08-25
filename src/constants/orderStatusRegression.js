export const ORDER_STATUS_REGRESSION_ERROR_CODE = 'order.status_regression'

export const isOrderStatusRegressionError = (errorCodes) => {
  if (!Array.isArray(errorCodes)) return true
  return errorCodes.includes(ORDER_STATUS_REGRESSION_ERROR_CODE)
}
