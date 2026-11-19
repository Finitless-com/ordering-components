import { beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [{
    root: 'https://api.test',
    appId: 'app',
    appInternalName: 'web'
  }]
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{ token: 'session-token', user: { id: 8 } }]
}))

import { InviteAndEarn } from '../index'

describe('InviteAndEarn', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url) => ({
      json: async () => url.endsWith('/conditions')
        ? {
            error: false,
            result: {
              status: 'active',
              participants: { inviter: { reward_type: 'discount', value: 10 } }
            }
          }
        : {
            error: false,
            result: {
              code: 'AB12',
              link: '/?referral_code=AB12',
              remaining_rewarded_invites: 3,
              benefits: {
                pending: [{ status: 'pending', value: 10 }],
                obtained: [{ status: 'delivered', value: 5 }]
              },
              invitees: [{ alias: 'Invitee 1' }]
            }
          }
    }))
  })

  it('loads public conditions and the signed-in customer summary', async () => {
    renderController(InviteAndEarn)

    await waitFor(() => expect(lastControllerProps.loading).toBe(false))
    expect(lastControllerProps.code).toBe('AB12')
    expect(lastControllerProps.link).toBe('/?referral_code=AB12')
    expect(lastControllerProps.remainingRewardedInvites).toBe(3)
    expect(lastControllerProps.pendingBenefits).toHaveLength(1)
    expect(lastControllerProps.obtainedBenefits).toHaveLength(1)
    expect(lastControllerProps.invitees).toEqual([{ alias: 'Invitee 1' }])
    expect(lastControllerProps.conditions.status).toBe('active')
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/referral_program/mine',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    )
  })
})
