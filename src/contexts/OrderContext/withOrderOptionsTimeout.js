export const ORDER_OPTIONS_READ_TIMEOUT_MS = 12000

// Order options requests whose callers need to offer a bounded retry.
export const withOrderOptionsTimeout = (request, timeout) => {
  const cancelToken = {}
  let timer
  const deadline = new Promise((resolve, reject) => {
    timer = globalThis.setTimeout(() => {
      // The SDK's cancel token aborts the XHR without settling its promise.
      reject(Object.assign(new Error('Order options request timed out'), { writeTimeout: true }))
      cancelToken.cancel?.()
    }, timeout)
  })
  const response = Promise.resolve().then(() => request({ cancelToken }))
  return Promise.race([response, deadline]).finally(() => globalThis.clearTimeout(timer))
}
