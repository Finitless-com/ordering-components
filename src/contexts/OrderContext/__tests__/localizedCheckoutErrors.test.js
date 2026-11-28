import { describe, expect, it } from 'vitest'
import { checkoutAlertPresentation, checkoutRequestOptions } from '../localizedCheckoutErrors'

describe('checkoutRequestOptions', () => {
  it('returns the exact options object when disabled', () => {
    const options = Object.freeze({ headers: Object.freeze({ authorization: 'token' }), query: Object.freeze({ user_id: 7 }) })
    expect(checkoutRequestOptions(options, false)).toBe(options)
  })

  it('adds the string opt-in without mutating existing query or headers', () => {
    const options = Object.freeze({ headers: Object.freeze({ authorization: 'token' }), query: Object.freeze({ user_id: 7 }), timeout: 123 })
    const result = checkoutRequestOptions(options, true)
    expect(result).not.toBe(options)
    expect(result.query).not.toBe(options.query)
    expect(result).toEqual({ headers: { authorization: 'token' }, query: { user_id: 7, localized_errors: '1' }, timeout: 123 })
    expect(options.query).toEqual({ user_id: 7 })
  })

  it('creates a query when none exists', () => {
    expect(checkoutRequestOptions({ headers: { test: 'value' } }, true)).toEqual({ headers: { test: 'value' }, query: { localized_errors: '1' } })
  })
})

describe('checkoutAlertPresentation', () => {
  const raw = Object.freeze(['first error', 'second error', 'third error'])
  const entries = Object.freeze([Object.freeze({ index: 1, message: 'Segundo error' })])

  it('omits metadata when disabled or unavailable', () => {
    expect(checkoutAlertPresentation(raw, entries, false)).toEqual({})
    expect(checkoutAlertPresentation(raw, undefined, true)).toEqual({})
    expect(checkoutAlertPresentation(raw, [], true)).toEqual({})
    expect(checkoutAlertPresentation(null, entries, true)).toEqual({})
  })

  it('returns separate metadata without changing the raw result or entries', () => {
    expect(checkoutAlertPresentation(raw, entries, true)).toEqual({ localizedErrors: [{ index: 1, message: 'Segundo error' }] })
    expect(raw).toEqual(['first error', 'second error', 'third error'])
    expect(entries).toEqual([{ index: 1, message: 'Segundo error' }])
  })

  it('filters invalid indexes, empty or non-string messages, and duplicate indexes', () => {
    const input = [null, {}, { index: -1, message: 'bad' }, { index: 3, message: 'bad' },
      { index: 1.5, message: 'bad' }, { index: '1', message: 'bad' },
      { index: 0, message: '' }, { index: 0, message: '   ' }, { index: 0, message: Object('bad') },
      { index: 2, message: 'Tercero' }]
    expect(checkoutAlertPresentation(raw, input, true)).toEqual({
      localizedErrors: [{ index: 2, message: 'Tercero' }]
    })
  })

  it('excludes ambiguous duplicate indexes', () => {
    expect(checkoutAlertPresentation(raw, [{ index: 0, message: 'Primero' }, { index: 0, message: 'duplicate' }, { index: 2, message: 'Tercero' }], true))
      .toEqual({ localizedErrors: [{ index: 2, message: 'Tercero' }] })
  })

  it('omits entries when the displayed message has been overridden', () => {
    const metadata = [{ index: 0, message: 'Primero' }, { index: 1, message: 'Segundo' }]
    expect(checkoutAlertPresentation(raw, metadata, true, ['friendly replacement', 'second error', 'third error']))
      .toEqual({ localizedErrors: [{ index: 1, message: 'Segundo' }] })
    expect(checkoutAlertPresentation(raw, metadata, true, ['friendly replacement', 'another replacement', 'third error']))
      .toEqual({})
  })
})
