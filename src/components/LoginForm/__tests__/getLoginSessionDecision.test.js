import { describe, expect, it } from 'vitest'
import { getLoginSessionDecision } from '../getLoginSessionDecision'

const customerUser = {
  id: 91,
  level: 3,
  session: { access_token: 'tok_customer' }
}

const driverUser = {
  id: 4,
  level: 4,
  session: { access_token: 'tok_driver' }
}

describe('getLoginSessionDecision', () => {
  it('rejects a customer so OTP cannot persist a driver or business session', () => {
    expect(getLoginSessionDecision({
      user: customerUser,
      allowedLevels: [4]
    })).toEqual({
      persistSession: false,
      logoutToken: 'tok_customer',
      error: 'YOU_DO_NOT_HAVE_PERMISSION'
    })
  })

  it('allows a driver level that password login already accepts', () => {
    expect(getLoginSessionDecision({
      user: driverUser,
      allowedLevels: [4]
    })).toEqual({
      persistSession: true,
      user: driverUser,
      token: 'tok_driver'
    })
  })

  it('does not gate when allowedLevels is empty, matching marketplace login', () => {
    expect(getLoginSessionDecision({
      user: customerUser,
      allowedLevels: []
    })).toEqual({
      persistSession: true,
      user: customerUser,
      token: 'tok_customer'
    })
  })
})
