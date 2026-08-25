import { describe, it, expect } from 'vitest'
import { isOrderStatusRegressionError, ORDER_STATUS_REGRESSION_ERROR_CODE } from '../orderStatusRegression'

describe('isOrderStatusRegressionError', () => {
  it('assumes regression when the API sends no error codes', () => {
    expect(isOrderStatusRegressionError(undefined)).toBe(true)
    expect(isOrderStatusRegressionError(null)).toBe(true)
  })

  it('trusts the error codes when the API sends them', () => {
    expect(isOrderStatusRegressionError([ORDER_STATUS_REGRESSION_ERROR_CODE])).toBe(true)
    expect(isOrderStatusRegressionError(['guest_access.expired'])).toBe(false)
    expect(isOrderStatusRegressionError([])).toBe(false)
  })
})
