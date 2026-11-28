export const resolveLogisticRequestNotice = (formatter, { accepted, request }) => {
  try {
    const message = formatter({ accepted, request })
    if (typeof message === 'string' && message.trim()) return message
  } catch {
    // A notice failure must not change the outcome of the successful request.
  }
  return accepted ? 'Delivery request accepted' : 'Delivery request declined'
}
