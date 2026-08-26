import { parseJsonStorage } from '../../utils/parseJsonStorage'

export const parseReservationSetting = (value) => {
  const parsed = parseJsonStorage(value)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed
  }
  return {}
}
