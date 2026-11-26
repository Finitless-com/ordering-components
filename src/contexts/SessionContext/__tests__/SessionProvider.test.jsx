import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

vi.mock('../../ApiContext', () => ({ useApi: () => [{ root: 'https://api.test', appId: 'app' }] }))
vi.mock('../../ToastContext', () => ({
  useToastActions: () => ({ showToast: vi.fn() }),
  ToastType: { Error: 'error' }
}))
vi.mock('../../LanguageContext', () => ({ useLanguage: () => [{}, (key, fallback) => fallback || key] }))

import { SessionProvider, useSession } from '../index'

const user1 = { id: 1, name: 'One', session: { access_token: 'tok-1' } }
const user2 = { id: 2, name: 'Two', session: { access_token: 'tok-2' } }

/**
 * In-memory strategy whose operations can be held: `hold('get:device_code')` makes the next call of that
 * operation wait until the returned function is called. A read takes its value when it is CALLED (as the
 * AsyncStorage executor does) and answers later; a write lands when it is released.
 */
const createStrategy = (initial = {}) => {
  const store = { ...initial }
  const calls = []
  const holds = {}
  const hold = (name) => {
    let release
    holds[name] = new Promise((resolve) => { release = resolve })
    return release
  }
  const waitFor = async (name) => {
    const gate = holds[name]
    if (gate) {
      delete holds[name]
      await gate
    }
  }
  const strategy = {
    getItem: vi.fn(async (key) => {
      calls.push(`get:${key}`)
      const value = key in store ? store[key] : null
      await waitFor(`get:${key}`)
      return value
    }),
    setItem: vi.fn(async (key, value) => {
      calls.push(`set:${key}`)
      await waitFor(`set:${key}`)
      store[key] = value
    }),
    removeItem: vi.fn(async (key) => {
      calls.push(`remove:${key}`)
      await waitFor(`remove:${key}`)
      delete store[key]
    })
  }
  return { strategy, store, calls, hold }
}

let session
const Probe = () => {
  session = useSession()
  return null
}

const mount = async (strategy, props = {}) => {
  render(<SessionProvider strategy={strategy} {...props}><Probe /></SessionProvider>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
}
const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const reads = (calls) => calls.filter(call => call.startsWith('get:')).length

describe('SessionProvider storage poll', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    session = null
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('interval', () => {
    it('polls every 2000 ms by default (4 reads per tick)', async () => {
      const { strategy, calls } = createStrategy()
      await mount(strategy)
      const afterMount = reads(calls)
      await advance(1999)
      expect(reads(calls)).toBe(afterMount)
      await advance(1)
      expect(reads(calls)).toBe(afterMount + 4)
      await advance(2000)
      expect(reads(calls)).toBe(afterMount + 8)
    })

    it('polls at the given period', async () => {
      const { strategy, calls } = createStrategy()
      await mount(strategy, { checkInterval: 500 })
      const afterMount = reads(calls)
      await advance(500)
      expect(reads(calls)).toBe(afterMount + 4)
      await advance(1000)
      expect(reads(calls)).toBe(afterMount + 12)
    })

    it.each([0, false, null])('does not poll when checkInterval is %p', async (checkInterval) => {
      const { strategy, calls } = createStrategy()
      await mount(strategy, { checkInterval })
      const afterMount = reads(calls)
      await advance(120000)
      expect(reads(calls)).toBe(afterMount)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('stops polling on unmount', async () => {
      const { strategy, calls } = createStrategy()
      const view = render(<SessionProvider strategy={strategy}><Probe /></SessionProvider>)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      view.unmount()
      const afterUnmount = reads(calls)
      await advance(10000)
      expect(reads(calls)).toBe(afterUnmount)
    })
  })

  describe('what the poll is for (unchanged)', () => {
    it('adopts a session another tab wrote', async () => {
      const { strategy, store } = createStrategy()
      await mount(strategy)
      expect(session[0].auth).toBeNull()
      store.token = 'tok-1'
      store.user = user1
      await advance(2000)
      expect(session[0].auth).toBe(true)
      expect(session[0].token).toBe('tok-1')
      expect(session[0].user).toEqual(user1)
    })

    it('adopts another user and logs out when another tab cleared the storage', async () => {
      const { strategy, store } = createStrategy({ token: 'tok-1', user: user1 })
      await mount(strategy)
      expect(session[0].user.id).toBe(1)
      store.token = 'tok-2'
      store.user = user2
      await advance(2000)
      expect(session[0].user.id).toBe(2)
      delete store.token
      delete store.user
      await advance(2000)
      expect(session[0].auth).toBe(false)
      expect(session[0].token).toBeNull()
    })

    it('does not touch a stored session that matches the one in memory', async () => {
      const { strategy, calls } = createStrategy({ token: 'tok-1', user: user1 })
      await mount(strategy)
      await advance(10000)
      expect(calls.some(call => call.startsWith('set:') || call.startsWith('remove:'))).toBe(false)
    })
  })

  describe('yields to a login / logout in flight', () => {
    it('a tick that comes while login is writing does not read nor decide anything', async () => {
      const { strategy, calls, store, hold } = createStrategy()
      await mount(strategy)
      const releaseUser = hold('set:user')
      let loginDone
      await act(async () => { loginDone = session[1].login({ user: user1, token: 'tok-1' }) })
      // token written, user not yet: the half written session that the poll used to read
      expect(store.token).toBe('tok-1')
      expect(store.user).toBeUndefined()
      const readsBefore = reads(calls)
      await advance(10000)
      expect(reads(calls)).toBe(readsBefore)
      expect(strategy.removeItem).not.toHaveBeenCalled()
      await act(async () => { releaseUser(); await loginDone })
      expect(session[0].auth).toBe(true)
      expect(session[0].user).toEqual(user1)
      // and afterwards the poll is back and finds nothing to fix
      await advance(4000)
      expect(strategy.removeItem).not.toHaveBeenCalled()
      expect(store.user).toEqual(user1)
      expect(session[0].auth).toBe(true)
    })

    it('a tick that started reading before login and finishes after it does not log the user out', async () => {
      const { strategy, store, hold } = createStrategy()
      await mount(strategy)
      // the tick reads token and user (nothing yet) and waits for the 4th read
      const releaseRead = hold('get:device_code')
      await advance(2000)
      // a whole login happens while that tick is waiting
      await act(async () => { await session[1].login({ user: user1, token: 'tok-1' }) })
      expect(session[0].auth).toBe(true)
      await act(async () => { releaseRead() })
      await advance(0)
      // the stale read (no session) was compared with the new in-memory session: it used to log out
      expect(strategy.removeItem).not.toHaveBeenCalled()
      expect(store.token).toBe('tok-1')
      expect(session[0].auth).toBe(true)
      expect(session[0].user).toEqual(user1)
    })

    it('a tick that comes while logout is removing does not read a half removed session and log in again', async () => {
      const { strategy, store, calls, hold } = createStrategy({ token: 'tok-1', user: user1 })
      await mount(strategy)
      const releaseUser = hold('remove:user')
      let logoutDone
      await act(async () => { logoutDone = session[1].logout() })
      expect(store.token).toBeUndefined()
      expect(store.user).toEqual(user1)
      const readsBefore = reads(calls)
      await advance(10000)
      expect(reads(calls)).toBe(readsBefore)
      await act(async () => { releaseUser(); await logoutDone })
      await advance(4000)
      expect(session[0].auth).toBe(false)
      expect(store.token).toBeUndefined()
      expect(store.user).toBeUndefined()
      expect(strategy.setItem).not.toHaveBeenCalled()
    })

    it('ticks do not pile up behind a slow storage', async () => {
      const { strategy, calls, hold } = createStrategy()
      await mount(strategy)
      const afterMount = reads(calls)
      const releaseRead = hold('get:token')
      await advance(20000) // ten periods with the first read of the first tick still pending
      expect(reads(calls)).toBe(afterMount + 1)
      await act(async () => { releaseRead() })
      await advance(2000)
      expect(reads(calls)).toBeGreaterThan(afterMount + 1)
    })

    it('a login that the poll itself starts and that fails does not leave an unhandled rejection', async () => {
      const { strategy, store } = createStrategy()
      await mount(strategy)
      store.token = 'tok-1'
      store.user = user1
      strategy.setItem.mockRejectedValueOnce(new Error('disk full'))
      await advance(2000)
      expect(session[0].loading).toBe(false)
      // the next tick tries again and now succeeds
      await advance(2000)
      expect(session[0].auth).toBe(true)
    })
  })

  describe('login() as the apps use it', () => {
    it('writes token and user, then sets the state, and resolves with the user', async () => {
      const { strategy, store } = createStrategy()
      await mount(strategy, { checkInterval: null })
      let result
      await act(async () => { result = await session[1].login({ user: user1, token: 'tok-1', device_code: 'dc' }) })
      expect(result).toEqual(user1)
      expect(store).toEqual({ token: 'tok-1', user: user1, device_code: 'dc' })
      expect(session[0]).toMatchObject({ auth: true, token: 'tok-1', user: user1, loading: false, device_code: 'dc' })
    })

    it('rejects when the storage rejects, and releases the in-flight mark', async () => {
      const { strategy, calls } = createStrategy()
      await mount(strategy)
      strategy.setItem.mockRejectedValueOnce(new Error('disk full'))
      let error
      await act(async () => { await session[1].login({ user: user1, token: 'tok-1' }).catch((err) => { error = err }) })
      expect(error.message).toBe('disk full')
      const readsBefore = reads(calls)
      await advance(2000)
      expect(reads(calls)).toBe(readsBefore + 4)
    })
  })
})
