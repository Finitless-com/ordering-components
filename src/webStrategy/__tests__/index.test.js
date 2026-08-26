import { describe, it, expect } from 'vitest'
import { WebStrategy } from '../index'

describe('WebStrategy', () => {
  const strategy = new WebStrategy()

  it('stores and retrieves plain strings', async () => {
    await strategy.setItem('token', 'abc', false)
    await expect(strategy.getItem('token', false)).resolves.toBe('abc')
  })

  it('stores and retrieves JSON values', async () => {
    const payload = { user: 1, active: true }
    await strategy.setItem('session', payload, true)
    await expect(strategy.getItem('session', true)).resolves.toEqual(payload)
  })

  it('removes items from storage', async () => {
    await strategy.setItem('temp', 'value', false)
    await strategy.removeItem('temp')
    await expect(strategy.getItem('temp', false)).resolves.toBeNull()
  })

  it('treats corrupt JSON as missing instead of throwing', async () => {
    window.localStorage.setItem('language', 'undefined')
    await expect(strategy.getItem('language', true)).resolves.toBeNull()
    window.localStorage.setItem('options', '{"type":1')
    await expect(strategy.getItem('options', true)).resolves.toBeNull()
  })
})
