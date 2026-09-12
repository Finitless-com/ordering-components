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

const normalizeCoordinate = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null

  const coordinate = Number(value)
  return Number.isFinite(coordinate) ? coordinate : null
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
  const latitude = normalizeCoordinate(orderState?.options?.address?.location?.lat)
  const longitude = normalizeCoordinate(orderState?.options?.address?.location?.lng)
  const sessionLoading = Boolean(session?.loading)
  const orderLoading = Boolean(orderState?.loading)

  const request = useMemo(() => {
    const location = latitude === null || longitude === null
      ? null
      : { lat: latitude, lng: longitude }
    const normalizedBusiness = {
      id: businessId,
      slug: businessSlug
    }

    let unavailableReason = null
    if (!enabled) unavailableReason = 'disabled'
    else if (sessionLoading) unavailableReason = 'session-loading'
    else if (!token) unavailableReason = 'missing-token'
    else if (orderLoading) unavailableReason = 'order-loading'
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
    enabled,
    latitude,
    longitude,
    normalizedFranchiseId,
    orderLoading,
    orderType,
    root,
    sessionLoading,
    token,
    tokenIdentityRef.current.version
  ])

  const [refreshVersion, setRefreshVersion] = useState(0)
  const [requestState, setRequestState] = useState({
    key: null,
    phase: 'idle',
    publicOffer: null,
    refreshVersion: -1
  })
  const requestSequenceRef = useRef(0)

  const refresh = useCallback(() => {
    setRefreshVersion((currentVersion) => currentVersion + 1)
  }, [])

  useEffect(() => {
    const sequence = ++requestSequenceRef.current
    let active = true

    if (!request.canRequest) {
      setRequestState({
        key: request.key,
        phase: 'idle',
        publicOffer: null,
        refreshVersion
      })
      return () => {
        active = false
        if (requestSequenceRef.current === sequence) {
          requestSequenceRef.current += 1
        }
      }
    }

    setRequestState({
      key: request.key,
      phase: 'loading',
      publicOffer: null,
      refreshVersion
    })

    const loadOffer = async () => {
      try {
        const headers = {
          'Content-Type': 'application/json'
        }
        if (request.token) headers.Authorization = `Bearer ${request.token}`
        if (request.appId) headers['X-App-X'] = request.appId
        if (request.appInternalName) {
          headers['X-INTERNAL-PRODUCT-X'] = request.appInternalName
        }
        const socketId = socketRef.current?.getId?.()
        if (socketId) headers['X-Socket-Id-X'] = socketId

        const response = await fetch(buildRequestUrl(request), {
          method: 'GET',
          headers
        })
        const payload = await response.json()

        if (!active || requestSequenceRef.current !== sequence) return
        if (payload?.error) {
          setRequestState({
            key: request.key,
            phase: 'error',
            publicOffer: null,
            refreshVersion
          })
          return
        }

        const publicOffer = selectFreeDeliveryOffer({
          publicOffers: payload?.result,
          business: request.business
        })
        setRequestState({
          key: request.key,
          phase: 'success',
          publicOffer,
          refreshVersion
        })
      } catch (error) {
        if (!active || requestSequenceRef.current !== sequence) return
        setRequestState({
          key: request.key,
          phase: 'error',
          publicOffer: null,
          refreshVersion
        })
      }
    }

    loadOffer()

    return () => {
      active = false
      if (requestSequenceRef.current === sequence) {
        requestSequenceRef.current += 1
      }
    }
  }, [refreshVersion, request])

  const isCurrentRequest = request.canRequest &&
    requestState.key === request.key &&
    requestState.refreshVersion === refreshVersion

  if (!isCurrentRequest) {
    return {
      ...hiddenProgress(request.unavailableReason || 'loading'),
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
    publicOffers: requestState.publicOffer ? [requestState.publicOffer] : [],
    cartOffers: cart?.offers,
    business: request.business
  })
  const progress = deriveFreeDeliveryProgress({
    offer,
    cart,
    orderType: request.orderType,
    hasLocation: request.hasLocation
  })

  return { ...progress, refresh }
}
