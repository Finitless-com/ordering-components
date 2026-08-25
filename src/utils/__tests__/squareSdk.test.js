import { describe, expect, it } from 'vitest'
import {
  getSquareSdkUrl,
  SQUARE_PRODUCTION_SDK_URL,
  SQUARE_SANDBOX_SDK_URL
} from '../squareSdk'

describe('getSquareSdkUrl', () => {
  it('loads the production SDK when sandbox is false', () => {
    expect(getSquareSdkUrl({ sandbox: false, applicationId: 'sq0idp-prod' })).toBe(SQUARE_PRODUCTION_SDK_URL)
  })

  it('loads the sandbox SDK when sandbox is true', () => {
    expect(getSquareSdkUrl({ sandbox: true, applicationId: 'sq0idp-prod' })).toBe(SQUARE_SANDBOX_SDK_URL)
  })

  it('loads the sandbox SDK when application_id has the sandbox prefix', () => {
    expect(getSquareSdkUrl({ applicationId: 'sandbox-sq0idb-abc' })).toBe(SQUARE_SANDBOX_SDK_URL)
  })

  it('loads the production SDK when credentials omit sandbox', () => {
    expect(getSquareSdkUrl({ applicationId: 'sq0idp-prod' })).toBe(SQUARE_PRODUCTION_SDK_URL)
  })
})
