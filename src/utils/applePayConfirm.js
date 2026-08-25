/**
 * Apple Pay confirmPayment failed in a way that should stop the success path.
 * Native callers may omit the applePay param; that message is not a real decline.
 */
export const APPLE_PAY_MISSING_PARAM_MESSAGE = 'You must provide the `applePay` parameter.'

export const isBlockingApplePayConfirmError = (confirmError) => {
  if (!confirmError) return false
  if (confirmError.message === APPLE_PAY_MISSING_PARAM_MESSAGE) return false
  return true
}
