import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../contexts/ApiContext'
import { useSession } from '../contexts/SessionContext'
import { useOrder } from '../contexts/OrderContext'
import { useWebsocket } from '../contexts/WebsocketContext'
import {
  deriveFreeDeliveryProgress,
  selectFreeDeliveryOffer
} from '../utils/freeDeliveryProgress'

const OFFER_FIELDS = [
  'id',
  'name',
  'businesses',
  'minimum',
  'target',
  'rate',
  'rate_type',
  'auto',
  'enabled',
  'rank',
  'condition_type'
]

const normalizeCoordinate = (value, minimum, maximum) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null

  const coordinate = Number(value)
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null
}

const normalizeIdentity = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null
  }
  if (typeof value !== 'string') return null

  const identity = value.trim()
  return identity || null
}

const normalizeRoot = (root) => {
  if (typeof root !== 'string') return null
  const normalizedRoot = root.trim().replace(/\/+$/, '')
  return normalizedRoot || null
}

const buildRequestUrl = ({ root, location, franchiseId }) => {
  const query = [
    'enabled=true',
    `params=${encodeURIComponent(OFFER_FIELDS.join(','))}`,
    `location=${encodeURIComponent(JSON.stringify(location))}`,
    'order_type_id=1'
  ]

  if (franchiseId) {
    query.push(`franchise_id=${encodeURIComponent(franchiseId)}`)
  }

  return `${root}/offers/public?${query.join('&')}`
}

const hiddenProgress = (diagnosticReason) => ({
  status: 'hidden',
  offer: null,
  minimum: null,
  currentAmount: 0,
  remainingAmount: null,
  progressPercent: 0,
  diagnosticReason
})

export const useFreeDeliveryProgress = ({
  business,
  cart,
  franchiseId,
  enabled = true
} = {}) => {
  const [ordering] = useApi()
  const [session] = useSession()
  const [orderState] = useOrder()
  const socket = useWebsocket()
  const socketRef = useRef(socket)
  socketRef.current = socket

  const token = session?.token || null
  const tokenIdentityRef = useRef({ token, version: 0 })
  if (tokenIdentityRef.current.token !== token) {
    tokenIdentityRef.current = {
      token,
      version: tokenIdentityRef.current.version + 1
    }
  }

  const root = normalizeRoot(ordering?.root)
  const appId = normalizeIdentity(ordering?.appId)
  const appInternalName = normalizeIdentity(ordering?.appInternalName)
  const businessId = normalizeIdentity(business?.id)
  const businessSlug = normalizeIdentity(business?.slug)
  const normalizedFranchiseId = normalizeIdentity(franchiseId)
  const orderType = orderState?.options?.type
  const latitude = normalizeCoordinate(
    orderState?.options?.address?.location?.lat,
    -90,
    90
  )
  const longitude = normalizeCoordinate(
    orderState?.options?.address?.location?.lng,
    -180,
    180
  )
  const sessionLoading = Boolean(session?.loading)
  const orderLoading = Boolean(orderState?.loading)

  const eligibility = useMemo(() => {
    const location = latitude === null || longitude === null
      ? null
      : { lat: latitude, lng: longitude }
    const normalizedBusiness = {
      id: businessId,
      slug: businessSlug
    }

    let unavailableReason = null
    if (!token) unavailableReason = 'missing-token'
    else if (orderType !== 1) unavailableReason = 'not-delivery'
    else if (!location) unavailableReason = 'missing-location'
    else if (!businessId && !businessSlug) unavailableReason = 'missing-business'
    else if (!root) unavailableReason = 'missing-api-root'

    const requestKey = unavailableReason
      ? null
      : JSON.stringify([
        tokenIdentityRef.current.version,
        root,
        appId,
        appInternalName,
        normalizedFranchiseId,
        businessId,
        businessSlug,
        orderType,
        latitude,
        longitude
      ])

    return {
      appId,
      appInternalName,
      business: normalizedBusiness,
      canRequest: !unavailableReason,
      franchiseId: normalizedFranchiseId,
      hasLocation: Boolean(location),
      key: requestKey,
      location,
      orderType,
      root,
      token,
      unavailableReason
    }
  }, [
    appId,
    appInternalName,
    businessId,
    businessSlug,
    latitude,
    longitude,
    normalizedFranchiseId,
    orderType,
    root,
    token,
    tokenIdentityRef.current.version
  ])

  const gateReason = !enabled
    ? 'disabled'
    : sessionLoading
      ? 'session-loading'
      : orderLoading
        ? 'order-loading'
        : eligibility.unavailableReason

  const [refreshVersion, setRefreshVersion] = useState(0)
  const [requestState, setRequestState] = useState({
    key: null,
    phase: 'idle',
    publicOffers: [],
    refreshVersion: -1
  })
  const requestStateRef = useRef(requestState)
  requestStateRef.current = requestState
  const requestSequenceRef = useRef(0)

  const refresh = useCallback(() => {
    setRefreshVersion((currentVersion) => currentVersion + 1)
  }, [])

  useEffect(() => {
    const sequence = ++requestSequenceRef.current
    let active = true
    const cleanupRequest = () => {
      active = false
      if (requestSequenceRef.current === sequence) {
        requestSequenceRef.current += 1
      }
    }
    const commitRequestState = (nextState) => {
      requestStateRef.current = nextState
      setRequestState(nextState)
    }

    if (!eligibility.canRequest || !enabled) {
      commitRequestState({
        key: eligibility.key,
        phase: 'idle',
        publicOffers: [],
        refreshVersion
      })
      return cleanupRequest
    }

    if (sessionLoading || orderLoading) {
      return cleanupRequest
    }

    const cachedRequest = requestStateRef.current
    if (
      cachedRequest.key === eligibility.key &&
      cachedRequest.phase === 'success' &&
      cachedRequest.refreshVersion === refreshVersion
    ) {
      return cleanupRequest
    }

    commitRequestState({
      key: eligibility.key,
      phase: 'loading',
      publicOffers: [],
      refreshVersion
    })

    const loadOffer = async () => {
      try {
        const headers = {
          'Content-Type': 'application/json'
        }
        if (eligibility.token) headers.Authorization = `Bearer ${eligibility.token}`
        if (eligibility.appId) headers['X-App-X'] = eligibility.appId
        if (eligibility.appInternalName) {
          headers['X-INTERNAL-PRODUCT-X'] = eligibility.appInternalName
        }
        const socketId = socketRef.current?.getId?.()
        if (socketId) headers['X-Socket-Id-X'] = socketId

        const response = await fetch(buildRequestUrl(eligibility), {
          method: 'GET',
          headers
        })
        const payload = await response.json()

        if (!active || requestSequenceRef.current !== sequence) return
        if (response?.ok === false || payload?.error || !Array.isArray(payload?.result)) {
          commitRequestState({
            key: eligibility.key,
            phase: 'error',
            publicOffers: [],
            refreshVersion
          })
          return
        }

        commitRequestState({
          key: eligibility.key,
          phase: 'success',
          publicOffers: payload.result,
          refreshVersion
        })
      } catch (error) {
        if (!active || requestSequenceRef.current !== sequence) return
        commitRequestState({
          key: eligibility.key,
          phase: 'error',
          publicOffers: [],
          refreshVersion
        })
      }
    }

    loadOffer()

    return cleanupRequest
  }, [eligibility, enabled, orderLoading, refreshVersion, sessionLoading])

  const isCurrentRequest = !gateReason &&
    requestState.key === eligibility.key &&
    requestState.refreshVersion === refreshVersion

  if (!isCurrentRequest) {
    return {
      ...hiddenProgress(gateReason || 'loading'),
      refresh
    }
  }
  if (requestState.phase === 'loading') {
    return { ...hiddenProgress('loading'), refresh }
  }
  if (requestState.phase === 'error') {
    return { ...hiddenProgress('request-error'), refresh }
  }
  if (requestState.phase !== 'success') {
    return { ...hiddenProgress('loading'), refresh }
  }

  const offer = selectFreeDeliveryOffer({
    publicOffers: requestState.publicOffers,
    cartOffers: cart?.offers,
    business: eligibility.business
  })
  const progress = deriveFreeDeliveryProgress({
    offer,
    cart,
    orderType: eligibility.orderType,
    hasLocation: eligibility.hasLocation
  })

  return { ...progress, refresh }
}
