import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ReferralProvider,
  useReferral
} from '../index'

let referralState
let referralActions

const Probe = () => {
  [referralState, referralActions] = useReferral()
  return null
}

describe('ReferralProvider', () => {
  const strategy = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    strategy.getItem.mockResolvedValue(null)
  })

  it('captures the initial referral link and stores its code', async () => {
    render(
      <ReferralProvider
        strategy={strategy}
        getInitialUrl={() => Promise.resolve('ordering://home?referral_code=ab12')}
      >
        <Probe />
      </ReferralProvider>
    )

    await waitFor(() => expect(referralState.loading).toBe(false))
    expect(referralState.referralCode).toBe('AB12')
    expect(strategy.setItem).toHaveBeenCalledWith('referral-code', 'AB12')
  })

  it('restores a stored code when the current link has none', async () => {
    strategy.getItem.mockResolvedValue('STORED1')
    render(
      <ReferralProvider strategy={strategy} getInitialUrl={() => 'https://shop.test/'}>
        <Probe />
      </ReferralProvider>
    )

    await waitFor(() => expect(referralState.loading).toBe(false))
    expect(referralState.referralCode).toBe('STORED1')
  })

  it('captures later links and consumes the stored code', async () => {
    let onUrl
    render(
      <ReferralProvider
        strategy={strategy}
        subscribeToUrls={(handler) => {
          onUrl = handler
          return vi.fn()
        }}
      >
        <Probe />
      </ReferralProvider>
    )
    await waitFor(() => expect(referralState.loading).toBe(false))

    await act(async () => onUrl('ordering://home?referral_code=later2'))
    expect(referralState.referralCode).toBe('LATER2')

    await act(async () => referralActions.consumeReferralCode())
    expect(referralState.referralCode).toBeNull()
    expect(strategy.removeItem).toHaveBeenCalledWith('referral-code')
  })
})
