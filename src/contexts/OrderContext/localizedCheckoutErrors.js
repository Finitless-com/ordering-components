export const checkoutRequestOptions = (options, enabled) => enabled
  ? { ...options, query: { ...options.query, localized_errors: '1' } }
  : options

export const checkoutAlertPresentation = (rawResult, localizedErrors, enabled, displayedResult = rawResult, translatedIndexes) => {
  if (!enabled || !Array.isArray(rawResult) || !Array.isArray(displayedResult) || !Array.isArray(localizedErrors)) {
    return {}
  }

  const counts = new Map()
  for (const error of localizedErrors) {
    const index = error?.index
    if (Number.isInteger(index) && index >= 0 && index < rawResult.length) {
      counts.set(index, (counts.get(index) ?? 0) + 1)
    }
  }

  const messages = []
  for (const error of localizedErrors) {
    const index = error?.index
    if (counts.get(index) !== 1 || typeof rawResult[index] !== 'string' ||
      rawResult[index] !== displayedResult[index] || translatedIndexes?.has(index) ||
      typeof error.message !== 'string' || !error.message.trim()) {
      continue
    }
    messages.push({ index, message: error.message })
  }

  return messages.length ? { localizedErrors: messages } : {}
}
