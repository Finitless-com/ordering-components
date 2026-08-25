import { describe, expect, it } from 'vitest'
import { getSessionStorageSyncDecision } from '../getSessionStorageSyncDecision'

const user1 = { id: 1, name: 'One', session: { access_token: 'tok-1' } }
const user2 = { id: 2, name: 'Two', session: { access_token: 'tok-2' } }

describe('getSessionStorageSyncDecision', () => {
  it('hydrates a guest tab when storage gains a token', () => {
    expect(getSessionStorageSyncDecision({
      stored: { token: 'tok-1', user: user1 },
      current: { token: null, user: null }
    })).toEqual({
      action: 'login',
      user: user1,
      token: 'tok-1'
    })
  })

  it('logs out this tab when another tab cleared storage', () => {
    expect(getSessionStorageSyncDecision({
      stored: { token: null, user: null },
      current: { token: 'tok-1', user: user1 }
    })).toEqual({
      action: 'logout'
    })
  })

  it('does not rewrite the session when token and user id match', () => {
    expect(getSessionStorageSyncDecision({
      stored: { token: 'tok-1', user: user1 },
      current: { token: 'tok-1', user: user1 }
    })).toEqual({
      action: 'noop'
    })
  })

  it('adopts the stored identity when another tab logs in as a different user', () => {
    expect(getSessionStorageSyncDecision({
      stored: { token: 'tok-2', user: user2 },
      current: { token: 'tok-1', user: user1 }
    })).toEqual({
      action: 'login',
      user: user2,
      token: 'tok-2'
    })
  })

  it('adopts storage when the user id changed under the same token', () => {
    expect(getSessionStorageSyncDecision({
      stored: { token: 'tok-1', user: { ...user2, session: { access_token: 'tok-1' } } },
      current: { token: 'tok-1', user: user1 }
    })).toEqual({
      action: 'login',
      user: { ...user2, session: { access_token: 'tok-1' } },
      token: 'tok-1'
    })
  })

  it('adopts a refreshed token for the same user id', () => {
    expect(getSessionStorageSyncDecision({
      stored: { token: 'tok-1-new', user: { ...user1, session: { access_token: 'tok-1-new' } } },
      current: { token: 'tok-1', user: user1 }
    })).toEqual({
      action: 'login',
      user: { ...user1, session: { access_token: 'tok-1-new' } },
      token: 'tok-1-new'
    })
  })
})
