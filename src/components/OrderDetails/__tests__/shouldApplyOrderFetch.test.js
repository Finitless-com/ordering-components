import { describe, expect, it } from 'vitest'
import { shouldApplyOrderFetch } from '../shouldApplyOrderFetch'

describe('shouldApplyOrderFetch', () => {
  it('applies when the response matches the current request', () => {
    expect(shouldApplyOrderFetch(202, 202)).toBe(true)
  })

  it('ignores a late response from a previous order', () => {
    expect(shouldApplyOrderFetch(101, 202)).toBe(false)
  })
})
