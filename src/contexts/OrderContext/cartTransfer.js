import { useOrder } from './index'
import { useSession } from '../SessionContext'
import { useApi } from '../ApiContext'
import { useWebsocket } from '../WebsocketContext'
import { useEvent } from '../EventContext'
import { mergeCartResult, resolveOrderOptionsCarts, withoutCart } from './mergeCartsByUpdatedAt'
import { ORDER_OPTIONS_READ_TIMEOUT_MS, withOrderOptionsTimeout } from './withOrderOptionsTimeout'

const CART_TRANSFER_TIMEOUT_MS = 12000

// The transfer summary looks up removed lines by their original IDs, labels
// their reason, and reads each discarded benefit ID or context field.
const hasCartTransferDetails = (unavailable, discarded) => (
  Array.isArray(unavailable) && unavailable.every(line =>
    Number.isInteger(line?.line_id) &&
    (line.product_id === null || Number.isInteger(line.product_id)) &&
    typeof line.reason === 'string'
  ) &&
  Array.isArray(discarded?.offers) && discarded.offers.every(offer => Number.isInteger(offer?.id)) &&
  Array.isArray(discarded?.wallets) && discarded.wallets.every(wallet => Number.isInteger(wallet?.id)) &&
  Array.isArray(discarded?.context) && discarded.context.every(item => typeof item?.field === 'string' && item.field.trim())
)

// In the normal cart payload id is the product ID, while line_id identifies
// the row. Some payloads also carry product_id explicitly.
const normalizeCartProductId = value => {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

const getCartProductId = line => normalizeCartProductId(line?.product_id ?? line?.id)
const getCartProductIds = cart => Array.isArray(cart?.products) ? cart.products.map(getCartProductId) : []

// Installed on the provider's buyer-scoped object on the first transfer only. Reads already in
// flight see newly retired UUIDs too; each reconciliation operates on its own pending snapshot.
const transferMarkers = markers => {
  if (markers.retiredCartIds) return markers
  const retiredCartIds = new Set()
  const pendingTransfers = new Map()
  const filterCarts = carts => Array.isArray(carts) && retiredCartIds.size
    ? carts.filter(cart => !retiredCartIds.has(cart?.uuid))
    : carts
  const beginRead = () => {
    if (!pendingTransfers.size) return
    const pending = [...pendingTransfers]
    return carts => {
      const listed = new Set(carts.map(cart => cart.uuid))
      const retired = new Set()
      for (const [key, transfer] of pending) {
        if (pendingTransfers.get(key) !== transfer) continue
        pendingTransfers.delete(key)
        for (const uuid of [transfer.sourceUuid, transfer.previousDestinationUuid]) {
          if (uuid && !listed.has(uuid)) {
            retired.add(uuid)
            retiredCartIds.add(uuid)
          }
        }
      }
      return {
        ready: pendingTransfers.size === 0,
        merge: previous => {
          const current = Object.fromEntries(Object.entries(previous).filter(([, cart]) => !retired.has(cart?.uuid)))
          return resolveOrderOptionsCarts(current, filterCarts(carts)).carts
        }
      }
    }
  }
  return Object.assign(markers, { retiredCartIds, pendingTransfers, beginRead, filterCarts, isRetired: uuid => retiredCartIds.has(uuid) })
}

export const useCartTransfer = () => {
  const [state, { getCartTransferAccess, refreshOrderOptions, updateOrderOptions }] = useOrder()
  const [session] = useSession()
  const [ordering] = useApi()
  const socket = useWebsocket()
  const [events] = useEvent()
  const { strategy, franchiseId, markers, isCurrent, applyCarts, applyOptions } = getCartTransferAccess()

  // The cart selector needs an acknowledged type change and a matching local
  // draft. A later refresh can replay that draft after a transfer is rolled back.
  const saveCartOrderType = async ({ type, city_id: cityId }) => {
    const changes = {
      type,
      ...(cityId !== undefined && { city_id: cityId })
    }
    try {
      if (session.auth && !await updateOrderOptions(changes)) return false
      if (!isCurrent()) return false

      const storedOptions = await strategy.getItem('options', true)
      if (!isCurrent()) return false
      if (session.auth && !storedOptions) return true

      const localOptions = session.auth ? storedOptions : { ...state.options, ...storedOptions }
      await strategy.setItem('options', { ...localOptions, ...changes }, true)
      if (!isCurrent()) return false
      if (!session.auth) {
        applyOptions(changes)
      }
      return true
    } catch {
      return false
    }
  }

  const reconcileBusinessCart = async (fromBusinessId, toBusinessId, {
    sourceUuid = state.carts[`businessId:${fromBusinessId}`]?.uuid,
    previousDestinationUuid = state.carts[`businessId:${toBusinessId}`]?.uuid,
    expectedDestinationUuid,
    sourceProductIds,
    franchiseId: transferFranchiseId = franchiseId
  } = {}) => {
    const sourceKey = `businessId:${fromBusinessId}`
    const source = state.carts[sourceKey]
    const ids = Array.isArray(sourceProductIds)
      ? sourceProductIds.map(normalizeCartProductId)
      : source?.uuid === sourceUuid ? getCartProductIds(source) : []
    const sourceIds = new Set(ids.filter(id => id !== null))
    const transfer = {
      sourceUuid,
      previousDestinationUuid: previousDestinationUuid !== expectedDestinationUuid ? previousDestinationUuid : undefined
    }
    const { pendingTransfers } = transferMarkers(markers)
    pendingTransfers.set(sourceKey, transfer)
    let verified
    try {
      verified = await refreshOrderOptions({ deferMalformedResponse: true })
      if (!verified?.carts || !isCurrent()) {
        throw Object.assign(new Error('Could not verify the cart after the transfer.'), { recoveryFailed: true })
      }
    } finally {
      if (pendingTransfers.get(sourceKey) === transfer) pendingTransfers.delete(sourceKey)
    }
    if (sourceUuid && verified.carts.some(cart => cart.uuid === sourceUuid)) return { cart: null, recovered: false }
    const destination = verified.carts.find(cart => Number(cart.business_id) === Number(toBusinessId))
    if (!destination) return { cart: null, recovered: false }

    if (sourceUuid && destination.uuid !== sourceUuid) {
      if (expectedDestinationUuid && destination.uuid === expectedDestinationUuid) {
        return { cart: destination, recovered: true }
      }

      // A confirmed UUID from another tab identifies the cart directly. With
      // a lost response, product IDs only support attribution for shared_menu.
      // A key-based strategy can also expose a shared product by coincidence.
      if (!expectedDestinationUuid && destination.uuid !== previousDestinationUuid &&
          Array.isArray(destination.products) && destination.products.some(line => sourceIds.has(getCartProductId(line)))) {
        if (transferFranchiseId && session.token) {
          try {
            const reply = await withOrderOptionsTimeout(transport => {
              if (!isCurrent()) return
              return ordering.get(`franchises/${encodeURIComponent(transferFranchiseId)}`, {
                query: { params: 'id,product_matching' }, json: true, accessToken: session.token, ...transport
              })
            }, ORDER_OPTIONS_READ_TIMEOUT_MS)
            if (isCurrent() &&
                reply?.status === 200 && reply.content?.error === false &&
                reply.content.result?.product_matching === 'shared_menu') {
              return { cart: destination, recovered: true }
            }
          } catch { /* A catalog we cannot verify requires manual review. */ }
        }
      }
    }
    throw Object.assign(new Error('The destination cart could not be attributed to this transfer.'), {
      code: 'cart.review_destination'
    })
  }

  /**
   * Move an existing franchise cart. A lost response may follow a committed
   * transfer, so verify the carts before reporting an uncertain outcome.
   */
  const changeBusiness = async (fromBusinessId, toBusinessId, {
    signal,
    franchiseId: transferFranchiseId = franchiseId,
    sourceUuid = state.carts[`businessId:${fromBusinessId}`]?.uuid,
    previousDestinationUuid = state.carts[`businessId:${toBusinessId}`]?.uuid
  } = {}) => {
    const sourceKey = `businessId:${fromBusinessId}`
    const destinationId = Number(toBusinessId)
    const destinationKey = `businessId:${destinationId}`
    const source = state.carts[sourceKey]
    const sourceProductIds = source?.uuid === sourceUuid ? getCartProductIds(source) : []
    const { retiredCartIds } = transferMarkers(markers)

    // Guest carts also belong to an API user and carry a bearer token.
    if (!session.token) throw new Error('A cart session is required.')

    const recover = async (error) => {
      if (!isCurrent()) throw error
      let recovery
      try {
        recovery = await reconcileBusinessCart(fromBusinessId, destinationId, {
          sourceUuid, previousDestinationUuid, sourceProductIds, franchiseId: transferFranchiseId
        })
      } catch (readError) {
        if (readError.code === 'cart.review_destination' && error.code !== 'cart.destination_occupied') throw readError
        error.recoveryFailed = readError.recoveryFailed
        throw error
      }
      // An explicit occupied rejection must not turn an unrelated cart in
      // the destination into a successful transfer, even if the source left.
      if (!recovery.recovered || error.code === 'cart.destination_occupied') throw error
      return recovery
    }

    if (!sourceUuid || sourceUuid === 'undefined' || retiredCartIds.has(sourceUuid)) {
      return recover(Object.assign(new Error('The source cart is unavailable.'), { code: 'cart.not_found' }))
    }

    const countryCode = await strategy.getItem('country-code')
    if (!isCurrent()) throw new Error('The cart session changed during the transfer.')
    const socketId = socket?.getId()
    const controller = new AbortController()
    let rejectRequest
    const cancelled = new Promise((resolve, reject) => { rejectRequest = reject })
    const cancel = (message) => {
      controller.abort()
      rejectRequest(new Error(message))
    }
    const abort = () => cancel('The cart transfer was cancelled.')
    const timeout = globalThis.setTimeout(() => cancel('The cart transfer timed out.'), CART_TRANSFER_TIMEOUT_MS)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()

    const send = async () => {
      if (controller.signal.aborted) return
      const response = await fetch(`${ordering.root}/carts/${encodeURIComponent(sourceUuid)}/change_business`, {
        method: 'POST',
        body: JSON.stringify({ business_id: destinationId }),
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          ...(ordering.appId && { 'X-APP-X': ordering.appId }),
          ...(ordering.appInternalName && { 'X-INTERNAL-PRODUCT-X': ordering.appInternalName }),
          ...(socketId && { 'X-Socket-Id-X': socketId }),
          ...(countryCode && { 'X-Country-Code-X': countryCode })
        }
      })
      return { response, envelope: await response.json() }
    }

    let result
    let apiErrorCode
    try {
      const { response, envelope } = await Promise.race([cancelled, send()])
      if (!isCurrent()) throw new Error('The cart session changed during the transfer.')
      if (envelope?.error === true) {
        const message = Array.isArray(envelope.result) ? envelope.result[0] : envelope.result
        apiErrorCode = Array.isArray(envelope.error_codes) ? envelope.error_codes[0] : undefined
        throw Object.assign(new Error(typeof message === 'string' ? message : 'Could not move the cart.'), { code: apiErrorCode })
      }
      result = envelope?.result
      const { cart, unavailable, discarded } = result ?? {}
      if (!response.ok || envelope?.error !== false ||
          !cart?.uuid || cart.uuid === sourceUuid || cart.business_id !== destinationId ||
          !Array.isArray(cart.products) || !Number.isFinite(cart.total) ||
          !hasCartTransferDetails(unavailable, discarded)) {
        throw new Error('Invalid cart transfer response.')
      }
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error('Could not move the cart.')
      if (apiErrorCode && apiErrorCode !== 'cart.not_found' && apiErrorCode !== 'cart.destination_occupied') throw error
      return recover(error)
    } finally {
      globalThis.clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }

    const { cart, unavailable, discarded } = result
    retiredCartIds.add(sourceUuid)
    if (previousDestinationUuid && previousDestinationUuid !== cart.uuid) retiredCartIds.add(previousDestinationUuid)
    applyCarts(carts => {
      if (retiredCartIds.has(cart.uuid)) return carts
      const withoutSource = carts[sourceKey]?.uuid === sourceUuid ? withoutCart(carts, sourceKey) : carts
      const currentDestinationUuid = carts[destinationKey]?.uuid
      const nextCarts = retiredCartIds.has(currentDestinationUuid) ? withoutCart(withoutSource, destinationKey) : withoutSource
      return mergeCartResult(nextCarts, cart)
    })
    events.emit('cart_updated', cart)
    return { cart, unavailable, discarded }
  }

  return { changeBusiness, reconcileBusinessCart, saveCartOrderType }
}
