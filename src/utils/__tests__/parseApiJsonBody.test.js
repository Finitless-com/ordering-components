import { describe, expect, it } from 'vitest'
import { INVALID_API_JSON_BODY, parseApiJsonBody } from '../parseApiJsonBody'

describe('parseApiJsonBody', () => {
  it('parses JSON success and error envelopes', () => {
    expect(parseApiJsonBody('{"error":false,"result":{"id":1}}')).toEqual({
      error: false,
      result: { id: 1 }
    })
    expect(parseApiJsonBody('{"error":true,"result":["Not found"]}')).toEqual({
      error: true,
      result: ['Not found']
    })
  })

  it('returns a structured error for HTML, empty, or truncated bodies', () => {
    expect(parseApiJsonBody('<html>404</html>')).toEqual(INVALID_API_JSON_BODY)
    expect(parseApiJsonBody('')).toEqual(INVALID_API_JSON_BODY)
    expect(parseApiJsonBody('{"error":false')).toEqual(INVALID_API_JSON_BODY)
  })
})
