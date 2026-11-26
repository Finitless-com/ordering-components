/**
 * Default period, in milliseconds, of the poll that compares the stored session
 * with the in-memory one (see SessionProvider)
 */
export const DEFAULT_SESSION_CHECK_INTERVAL = 2000

/**
 * Resolve the `checkInterval` prop of SessionProvider
 * - `undefined` -> the default period (2000 ms)
 * - a finite number greater than 0 (or a numeric string) -> that period in ms
 * - anything else (`0`, `false`, `null`, negative, NaN, non numeric) -> `null`: the poll is OFF
 * Before this helper those values did not mean anything useful: `setInterval` clamps
 * them to a few milliseconds, which made the poll read the storage in a hot loop.
 * @param {number|string|boolean|null|undefined} checkInterval Value received by the provider
 * @returns {number|null} Period in ms or null when the poll must not run
 */
export const getSessionCheckInterval = (checkInterval) => {
  if (checkInterval === undefined) return DEFAULT_SESSION_CHECK_INTERVAL
  if (typeof checkInterval !== 'number' && typeof checkInterval !== 'string') return null
  if (typeof checkInterval === 'string' && checkInterval.trim() === '') return null
  const period = Number(checkInterval)
  return Number.isFinite(period) && period > 0 ? period : null
}
