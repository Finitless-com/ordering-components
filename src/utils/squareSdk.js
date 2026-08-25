export const SQUARE_SANDBOX_SDK_URL = 'https://sandbox.web.squarecdn.com/v1/square.js'
export const SQUARE_PRODUCTION_SDK_URL = 'https://web.squarecdn.com/v1/square.js'

export const getSquareSdkUrl = ({ sandbox, applicationId } = {}) => {
  if (typeof sandbox === 'boolean') {
    return sandbox ? SQUARE_SANDBOX_SDK_URL : SQUARE_PRODUCTION_SDK_URL
  }
  if (typeof applicationId === 'string' && applicationId.startsWith('sandbox-')) {
    return SQUARE_SANDBOX_SDK_URL
  }
  return SQUARE_PRODUCTION_SDK_URL
}
