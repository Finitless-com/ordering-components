import React, { useCallback, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useApi } from '../../contexts/ApiContext'
import { useSession } from '../../contexts/SessionContext'

const initialState = {
  loading: true,
  error: null,
  conditions: null,
  mine: null
}

export const InviteAndEarn = (props) => {
  const { UIComponent } = props
  const [ordering] = useApi()
  const [{ token, user }] = useSession()
  const [state, setState] = useState(initialState)
  const { root, appId, appInternalName } = ordering

  const request = useCallback(async (path, accessToken) => {
    const response = await fetch(`${root}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-App-X': appId,
        'X-INTERNAL-PRODUCT-X': appInternalName,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      }
    })
    return response.json()
  }, [appId, appInternalName, root])

  const refreshReferralProgram = useCallback(async () => {
    setState(previous => ({ ...previous, loading: true, error: null }))
    try {
      const [conditionsResponse, mineResponse] = await Promise.all([
        request('/referral_program/conditions'),
        user?.id && token
          ? request('/referral_program/mine', token)
          : Promise.resolve(null)
      ])
      const errors = [
        conditionsResponse?.error ? conditionsResponse.result : null,
        mineResponse?.error ? mineResponse.result : null
      ].filter(Boolean)
      setState({
        loading: false,
        error: errors.length ? errors : null,
        conditions: conditionsResponse?.error ? null : conditionsResponse?.result,
        mine: mineResponse?.error ? null : mineResponse?.result
      })
    } catch (error) {
      setState(previous => ({
        ...previous,
        loading: false,
        error: [error.message]
      }))
    }
  }, [request, token, user?.id])

  useEffect(() => {
    refreshReferralProgram()
  }, [refreshReferralProgram])

  const benefits = state.mine?.benefits || {}

  return UIComponent
    ? (
      <UIComponent
        {...props}
        loading={state.loading}
        error={state.error}
        conditions={state.conditions}
        code={state.mine?.code ?? null}
        link={state.mine?.link ?? null}
        remainingRewardedInvites={state.mine?.remaining_rewarded_invites ?? 0}
        pendingBenefits={benefits.pending || []}
        obtainedBenefits={benefits.obtained || []}
        invitees={state.mine?.invitees || []}
        refreshReferralProgram={refreshReferralProgram}
      />
      )
    : null
}

InviteAndEarn.propTypes = {
  UIComponent: PropTypes.elementType
}
