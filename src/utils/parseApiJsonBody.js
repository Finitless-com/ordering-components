import { parseJsonStorage } from './parseJsonStorage'

export const INVALID_API_JSON_BODY = {
  error: true,
  result: ['Invalid JSON response']
}

export const parseApiJsonBody = (value) => {
  const parsed = parseJsonStorage(value)
  if (parsed !== null && typeof parsed === 'object') {
    return parsed
  }
  return INVALID_API_JSON_BODY
}
