import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react'
import { useSession } from '../SessionContext'
import { useApi } from '../ApiContext'
import { useWebsocket } from '../WebsocketContext'
import { useLanguage } from '../LanguageContext'
import { useEvent } from '../EventContext'
import { useConfig } from '../ConfigContext'
import { useCustomer } from '../CustomerContext'
import { ToastType, useToastActions } from '../ToastContext'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { INVALID_API_JSON_BODY } from '../../utils/parseApiJsonBody'
import { resolveUnaddressedOrderTypes, shouldRequireOrderAddress } from '../../utils/orderTypeAddress'
import { isUnchangedDriverTip } from './isUnchangedDriverTip'
import { evictConsumedCart, shouldEvictConsumedCart } from './evictConsumedCart'
import {
  mergeCartResult,
  mergeCartsByUpdatedAt,
  resolveOrderOptionsCarts
} from './mergeCartsByUpdatedAt'
import {
  CLICK_ID_STORAGE_KEY,
  REFERRAL_STORAGE_KEY,
  captureVisit,
  clickIdForPlace,
  clickIdToKeep,
  isRepeatedNavigation,
  referralForPlace,
  registerVisit
} from '../../utils/referral'

dayjs.extend(utc)

const REFERRAL_MAX_PENDING = 20
const GUEST_DELIVERY_DEADLINE_MS = 15000

/**
 * Create OrderContext
 * This context will manage the current order with options internally and provide an easy interface
 */
/**
 * The carts without one of them, as a new object: the order's carts are never
 * changed in place, so who reads the order without the copy (useOrderState)
 * sees every change.
 */
const withoutCart = (carts, key) => {
  const next = { ...carts }
  delete next[key]
  return next
}

export const OrderContext = createContext()

/**
 * The order's state as it is (no copy), with a new identity only when it
 * changes. `useOrder()` hands a deep copy on every render of the provider, so
 * every consumer renders again on any of its renders (a toast, a socket event,
 * a session update); `useOrderState()` renders again only when the order does.
 * Read only: never modify what it returns.
 */
export const OrderStateContext = createContext()

/** The order's actions, stable for the provider's life; each runs its latest version. */
export const OrderActionsContext = createContext()

/**
 * Custom provider to order manager
 * This provider has a reducer for manage order state
 * @param {props} props
 * @param {boolean} [props.disableWorkerPickup=false] When the page comes from the
 * worker (`__FIRST_LOAD__` / `__CONFIG__`), the worker's fixed pickup is applied to
 * addressless orders. Set it to true to drop that and use the project's
 * `default_order_type` instead. The web marketplace turns it on; apps have no worker.
 * @param {number[]} [props.supportedOrderTypes] The order type ids the consumer supports. The
 * project's `order_types_allowed` is cut down to them before the provider picks a default, a
 * fallback or a type to replace one that is no longer allowed, so it never starts in or stores a
 * type the consumer does not offer. Without it every allowed type is a candidate, as before.
 * @param {boolean} [props.ignoreStaleTypeResponses=false] Every write that carries an order `type`
 * takes a sequence number. With this on, the answer to a write that a newer type write has
 * superseded no longer applies its `type` (the one the customer chose last stays), so a late
 * answer cannot undo a later change. Off, every answer applies as before.
 * @param {number} [props.orderOptionsWriteTimeout] Milliseconds an authenticated order options
 * write may wait for its answer. When it runs out the request is cancelled and the write fails
 * like any other (an alert, `loading` released, the type already applied locally stays), so a
 * request that never answers cannot hold `loading` and every screen that waits on it. Without
 * it the write waits for as long as the request lasts, as before.
 */
export const OrderProvider = ({
  Alert,
  children,
  strategy,
  isDisableToast,
  franchiseId,
  isDisabledDefaultOpts,
  businessSlug,
  userAgent,
  enableCouponsRetries = false,
  referralEnabled = true,
  waitForGuestDeliveryAddress = false,
  disableWorkerPickup = false,
  supportedOrderTypes,
  ignoreStaleTypeResponses = false,
  orderOptionsWriteTimeout
}) => {
  const [confirmAlert, setConfirm] = useState({ show: false })
  const [alert, setAlert] = useState({ show: false })
  // Off by default: keeps the project's `unaddressed_order_types_allowed` rule for pickup.
  const [pickupWithoutAddress, setPickupWithoutAddressState] = useState(false)
  // Off by default ([]): order types the consumer adds to the project's unaddressed ones.
  const [extraUnaddressedOrderTypes, setExtraUnaddressedOrderTypesState] = useState([])
  const [ordering] = useApi()
  const socket = useWebsocket()
  const [languageState, t] = useLanguage()
  const [events] = useEvent()
  const [configState] = useConfig()
  const [session, { logout }] = useSession()
  const guestDeliverySync = useRef(null)
  const [customerState, { setUserCustomer }] = useCustomer()
  const { showToast } = useToastActions()

  const allowedTypes = configState?.configs?.order_types_allowed?.value.split('|').map(value => Number(value)) || []
  const configTypes = Array.isArray(supportedOrderTypes)
    ? allowedTypes.filter(type => supportedOrderTypes.includes(type))
    : allowedTypes

  const orderTypes = {
    delivery: 1,
    pickup: 2,
    eatin: 3,
    curbside: 4,
    drivethru: 5,
    catering_delivery: 7,
    catering_pickup: 8
  }

  const fromWorker = typeof window !== 'undefined' && (window.__FIRST_LOAD__ || window.__CONFIG__)
  const forceWorkerPickup = Boolean(fromWorker) && !disableWorkerPickup
  const configDefaultOrderType = orderTypes[configState?.configs?.default_order_type?.value]
  // With `disableWorkerPickup` (the web) a `default_order_type` that does not map to an
  // order type (`seatdelivery`, `reservation`...) or is not allowed starts in the first
  // allowed type, so a guest never starts without a type. Without the prop nothing changes.
  const startsInAllowedType = disableWorkerPickup && configTypes.length > 0
  const defaultOrderType = forceWorkerPickup
    ? orderTypes.pickup
    : startsInAllowedType && !configTypes.includes(configDefaultOrderType)
      ? configTypes[0]
      : configDefaultOrderType

  const shouldForceWorkerPickup = (orderOptions) => (
    forceWorkerPickup &&
    !orderOptions?.address_id &&
    !orderOptions?.address?.location &&
    configTypes.includes(orderTypes.pickup)
  )

  const syncWorkerPickupToApi = async () => {
    if (!session.auth || !shouldForceWorkerPickup(state.options)) {
      return true
    }
    return updateOrderOptions({ type: orderTypes.pickup })
  }

  const [state, setState] = useState({
    loading: true,
    options: isDisabledDefaultOpts
      ? { type: null, moment: null, city_id: null }
      : {
          type: defaultOrderType,
          moment: null,
          city_id: null
        },
    carts: {},
    confirmAlert,
    alert
  })

  const intervalRetriesRef = useRef(null)
  // The last write that carried an order `type` (see `ignoreStaleTypeResponses`).
  const typeWriteSeq = useRef(0)
  // The URL's UTM visit this page load already captured, and the queue of captures.
  const referralCapture = useRef({ landing: null, queue: Promise.resolve() })
  // Read at execution time (queued closures and the stable actions outlive a render),
  // so it is kept in a ref instead of captured by the functions below.
  const referralEnabledRef = useRef(referralEnabled)
  referralEnabledRef.current = referralEnabled
  // What the URL carried while attribution was off. Memory only, never storage:
  // it is captured with its own time once the site allows it.
  const pendingReferrals = useRef([])
  const timeIntervalProduct = 4000
  const retriesProduct = 4

  const getGuestDeliverySync = () => {
    const sync = guestDeliverySync.current
    if (!waitForGuestDeliveryAddress || !session.auth) return null
    return sync?.token === session.token && sync?.userId === session.user?.id ? sync : null
  }

  const isCurrentGuestDeliverySync = sync => sync.parent
    ? guestDeliverySync.current === sync.parent && sync.parent.revision === sync
    : guestDeliverySync.current === sync && !sync.selection

  const hasGuestDeliveryAddress = options =>
    [orderTypes.delivery, orderTypes.catering_delivery].includes(Number(options?.type)) && options?.address?.location

  // The ordinary (no guest delivery migration) order options write, with its own deadline.
  const withWriteTimeout = (request, timeout) => {
    const cancelToken = {}
    let timer
    const deadline = new Promise((resolve, reject) => {
      timer = globalThis.setTimeout(() => {
        // The SDK's cancel token aborts the XHR without settling its promise.
        reject(new Error('Order options request timed out'))
        cancelToken.cancel?.()
      }, timeout)
    })
    return Promise.race([request({ cancelToken }), deadline]).finally(() => globalThis.clearTimeout(timer))
  }

  const requestGuestDelivery = (sync, request, write = false) => {
    if (!sync) return request()
    const remaining = sync.deadline - Date.now()
    const deadlineError = () => new Error('Guest delivery migration timed out')
    if (remaining <= 0) return Promise.reject(deadlineError())

    const cancelToken = {}
    let timer
    const timeout = new Promise((resolve, reject) => {
      timer = globalThis.setTimeout(() => {
        // The SDK's cancel token aborts the XHR without settling its promise.
        reject(deadlineError())
        cancelToken.cancel?.()
      }, remaining)
    })
    const response = Promise.resolve().then(() => {
      if (!isCurrentGuestDeliverySync(sync)) throw new Error('Guest delivery selection changed')
      return request({ cancelToken })
    })
    const pending = Promise.race([response, timeout]).finally(() => globalThis.clearTimeout(timer))
    // A newer selection can skip stale reads, but must wait for a dispatched
    // write to settle or be cancelled before writing to the same account.
    if (write) sync.write = pending
    return pending
  }

  const waitForGuestDeliverySelection = async sync => {
    let selection
    let saved
    do {
      selection = sync.selection
      saved = await selection
    } while (selection !== sync.selection)
    return saved
  }

  /**
   * Refresh order options and carts from API. A recovery reports success only
   * after required option writes have succeeded.
   */
  const refreshOrderOptions = async ({ deferMalformedResponse = false, recovering = false, guestDeliveryOptions, migration } = {}) => {
    const sync = getGuestDeliverySync()
    if (!migration && sync && !sync.finished) return ensureGuestDeliveryAddress()
    const isCurrent = () => !migration || isCurrentGuestDeliverySync(migration)
    try {
      if (!state.loading) {
        setState(prevState => ({ ...prevState, loading: true }))
      }
      const countryCodeFromLocalStorage = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      if (!isCurrent()) return false
      const userCustomerId = customerFromLocalStorage?.id
      const options = {}
      if (userCustomerId) {
        options.query = {
          user_id: userCustomerId
        }
      }
      if (franchiseId) {
        options.query = {
          ...options.query,
          franchise_id: franchiseId
        }
      }

      const countryCode = countryCodeFromLocalStorage && countryCodeFromLocalStorage !== state?.options?.address?.country_code
        ? countryCodeFromLocalStorage
        : state?.options?.address?.country_code

      if (countryCode) {
        options.headers = {
          'X-Socket-Id-X': socket?.getId(),
          'X-Country-Code-X': countryCode
        }
      }

      const getOptions = transport => ordering.setAccessToken(session.token).orderOptions().get({ ...options, ...transport })
      const res = await requestGuestDelivery(migration, getOptions)
      if (!isCurrent()) return false
      const status = res?.status
      // Read the sentinel before the SDK casts its result on HTTP 200.
      const invalidResponse = res?.response?.data === INVALID_API_JSON_BODY
      const { error, result } = (invalidResponse ? INVALID_API_JSON_BODY : res?.content) || {}
      let hasApiAddressContext = false
      if (!error) {
        const { carts, ...options } = result
        hasApiAddressContext = Boolean(options.address_id || options.address?.location)

        if (!Array.isArray(carts)) {
          setState(prevState => ({ ...prevState, loading: false }))
          return
        }

        // The final write returns the options for this guest. Until it
        // succeeds, keep the displayed address and preorder moment intact.
        if (!guestDeliveryOptions) {
          setState(prevState => {
            const mergedOptions = { ...prevState.options, ...options }
            if (shouldForceWorkerPickup(mergedOptions)) {
              mergedOptions.type = orderTypes.pickup
            }
            return {
              ...prevState,
              options: mergedOptions,
              carts: resolveOrderOptionsCarts(prevState.carts, carts).carts
            }
          })
        }

        const shouldSyncPickup = !guestDeliveryOptions && shouldForceWorkerPickup(options) && options.type !== orderTypes.pickup
        const shouldSyncCountryCode = !guestDeliveryOptions && !countryCodeFromLocalStorage && options?.address?.country_code

        if (shouldSyncPickup || shouldSyncCountryCode) {
          const syncParams = {}
          if (shouldSyncPickup) syncParams.type = orderTypes.pickup
          if (shouldSyncCountryCode) syncParams.country_code = options.address.country_code
          const synced = await updateOrderOptions(syncParams, { recovering })
          if (recovering && !synced) return false
        } else if (!guestDeliveryOptions) {
          setState(prevState => ({ ...prevState, loading: false }))
        }
      }
      if (error) {
        if (status === 401 && session.auth) {
          // Sesion invalida (p.ej. usuario deshabilitado desde el dashboard).
          // En WEB: se limpia el storage directamente -SIN llamar logout(),
          // que hace setState y alimenta la tormenta de re-renders que puede
          // congelar la pestaña ANTES de alcanzar el reload- y se recarga.
          // Tras recargar no hay token/user => sesion de invitado => no se
          // llama orderOptions autenticado => no hay 401 (sin loop de recargas).
          // El submodulo es compartido con apps React Native: el reload se
          // hace SOLO en web; en el resto se cierra sesion normal con logout().
          const isWeb = typeof window !== 'undefined' &&
            typeof window.document !== 'undefined' &&
            typeof window.location?.reload === 'function'
          if (isWeb) {
            await strategy.removeItem('token')
            await strategy.removeItem('user')
            await strategy.removeItem('device_code')
            window.location.reload()
            return { status }
          }
          await logout()
          return { status }
        }
        if (invalidResponse || recovering) {
          if (invalidResponse && !deferMalformedResponse && !recovering) {
            setAlert({ show: true, content: t('CART_REFRESH_RESPONSE_ERROR', 'We couldn’t refresh your carts. Check your cart before placing your order.'), status })
          }
          setState(prevState => ({ ...prevState, loading: false }))
          return { invalidResponse, status }
        }
        setAlert({ show: true, content: result, status })
      }
      const localOptions = guestDeliveryOptions
        ? { ...guestDeliveryOptions, address: { ...guestDeliveryOptions.address } }
        : await strategy.getItem('options', true)
      if (localOptions) {
        const options = {}
        if (Object.keys(localOptions?.address || {})?.length > 0) {
          const conditions = [
            { attribute: 'address', value: localOptions?.address?.address }
          ]
          const userId = userCustomerId || session.user.id
          // Always look up the address first, including retries of an
          // uncertain POST. A timed-out response may already have been saved.
          const getAddresses = transport => ordering.setAccessToken(session.token).users(userId).addresses().where(conditions).get(transport)
          const addressesResponse = await requestGuestDelivery(migration, getAddresses)
          if (!isCurrent()) return false
          if (guestDeliveryOptions && addressesResponse.content.error) {
            setState(prevState => ({ ...prevState, loading: false }))
            return false
          }
          const savedDetail = value => guestDeliveryOptions ? value || null : value
          let address = addressesResponse.content.result.find(address => {
            localOptions.address.internal_number = localOptions.address?.internal_number || null
            localOptions.address.zipcode = localOptions.address?.zipcode || null
            localOptions.address.address_notes = localOptions.address?.address_notes || null

            return address?.location?.lat === localOptions?.address?.location.lat &&
              address?.location?.lng === localOptions?.address?.location?.lng &&
              savedDetail(address?.internal_number) === localOptions?.address?.internal_number &&
              savedDetail(address?.zipcode) === localOptions?.address?.zipcode &&
              savedDetail(address?.address_notes) === localOptions?.address?.address_notes
          })
          if (!address) {
            Object.keys(localOptions.address).forEach(key => localOptions?.address?.[key] === null && delete localOptions?.address?.[key])
            const save = transport => ordering.setAccessToken(session.token).users(userId).addresses().save(localOptions.address, transport)
            const { content: { error, result } } = await requestGuestDelivery(migration, save, true)
            if (!isCurrent()) return false
            if (!error) {
              address = result
            } else if (recovering) {
              setState(prevState => ({ ...prevState, loading: false }))
              return false
            }
          } else if (!guestDeliveryOptions || !address.default) {
            const save = transport => ordering.setAccessToken(session.token).users(userId).addresses(address.id).save({ default: true }, transport)
            const response = await requestGuestDelivery(migration, save, true)
            if (!isCurrent()) return false
            if (guestDeliveryOptions && response?.content?.error) {
              setState(prevState => ({ ...prevState, loading: false }))
              return false
            }
          }
          if (guestDeliveryOptions && !address?.id) {
            setState(prevState => ({ ...prevState, loading: false }))
            return false
          }
          address && (options.address_id = address.id)
        }
        const localOptionsHasAddress = Boolean(
          localOptions?.address_id ||
          Object.keys(localOptions?.address || {}).length > 0
        )
        if (localOptions.type && (!hasApiAddressContext || localOptionsHasAddress)) {
          options.type = localOptions.type
        }
        if (localOptions.moment) {
          options.moment = dayjs.utc(localOptions.moment, 'YYYY-MM-DD HH:mm:ss').unix()
        } else if (guestDeliveryOptions && localOptions.moment === null) {
          options.moment = null
        }
        if (localOptions?.address_id && !guestDeliveryOptions) {
          options.address_id = localOptions?.address_id
        }
        if (guestDeliveryOptions?.address?.country_code) {
          options.country_code = guestDeliveryOptions.address.country_code
        }
        if (localOptions?.city_id && !hasApiAddressContext) {
          options.city_id = localOptions?.city_id
        }
        if (options && Object.keys(options).length > 0) {
          const synced = await updateOrderOptions(options, { recovering, migration })
          if (!isCurrent()) return false
          if (recovering && !synced) return false
        } else {
          setState(prevState => ({ ...prevState, loading: false }))
        }
        await strategy.removeItem('options')
      } else {
        setState(prevState => ({ ...prevState, loading: false }))
      }
      if (recovering) return true
    } catch (err) {
      if (!isCurrent()) return false
      const message = err?.message?.includes('Internal error')
        ? 'INTERNAL_ERROR'
        : !err.message
            ? t('NETWORK_ERROR', 'Network error')
            : err.message
      if (!recovering) setAlert({ show: true, content: message })
      setState(prevState => ({ ...prevState, loading: false }))
    }
  }

  // Login and the first add share the same save and order-options write.
  // null means this session has no local delivery address to migrate.
  const ensureGuestDeliveryAddress = ({ retry = false } = {}) => {
    if (!waitForGuestDeliveryAddress || !session.auth || !session.user?.id) return Promise.resolve(null)
    const current = getGuestDeliverySync()
    if (current && !(retry && current.failed)) {
      if (current.selection) return waitForGuestDeliverySelection(current)
      return current.promise
    }
    const sync = { token: session.token, userId: session.user.id, failed: false, deadline: Date.now() + GUEST_DELIVERY_DEADLINE_MS }
    guestDeliverySync.current = sync
    sync.promise = (async () => {
      const options = await strategy.getItem('options', true)
      if (!isCurrentGuestDeliverySync(sync)) return false
      if (!hasGuestDeliveryAddress(options)) return null
      const saved = await refreshOrderOptions({ recovering: true, guestDeliveryOptions: options, migration: sync })
      return saved === true
    })().catch(() => {
      if (isCurrentGuestDeliverySync(sync)) setState(prevState => ({ ...prevState, loading: false }))
      return false
    }).then(result => {
      if (sync.selection) return waitForGuestDeliverySelection(sync)
      sync.failed = result === false
      sync.finished = !sync.failed
      return result
    })
    return sync.promise
  }

  const replaceGuestDeliverySelection = async (sync, changes) => {
    const previous = sync.selection || sync.write
    const revision = { parent: sync }
    sync.revision = revision
    sync.failed = false
    const selection = (async () => {
      await previous?.catch(() => {})
      // A moment or delivery-type change can leave the guest address selected.
      // Persist that new selection as a unit so any retry uses the new values.
      const local = changes.address_id === undefined && await strategy.getItem('options', true)
      const revised = local && { ...local, type: changes.type ?? local.type }
      if (hasGuestDeliveryAddress(revised)) {
        if (changes.moment !== undefined) {
          revised.moment = changes.moment === null
            ? null
            : dayjs.unix(changes.moment).utc().format('YYYY-MM-DD HH:mm:ss')
        }
        await strategy.setItem('options', revised, true)
        if (!isCurrentGuestDeliverySync(revision)) return false
        revision.deadline = Date.now() + GUEST_DELIVERY_DEADLINE_MS
        const saved = await refreshOrderOptions({ recovering: true, guestDeliveryOptions: revised, migration: revision })
        if (isCurrentGuestDeliverySync(revision)) sync.failed = saved !== true
        return saved === true
      }
      await strategy.removeItem('options')
      return updateOrderOptions(changes, { selectionHandled: true })
    })()
    sync.selection = selection
    const saved = await selection
    if (sync.selection === selection) sync.finished = saved === true
    return saved
  }

  const refreshOrderOptionsWithRetries = async (cart, product, endpointResult) => {
    if (!enableCouponsRetries) {
      return
    }
    const hasCouponForRetries = cart?.metafields?.find?.(meta => meta?.key === 'pulse_coupons')?.value ||
    product?.metafields?.find?.(meta => meta?.key === 'pulse_coupons')?.value ||
    endpointResult?.endpoint_type === 'multi_product'

    if (hasCouponForRetries) {
      let retries = 0
      clearInterval(intervalRetriesRef.current)
      intervalRetriesRef.current = setInterval(() => {
        retries++
        if (retriesProduct === retries) {
          clearInterval(intervalRetriesRef.current)
        }
        refreshOrderOptions()
      }, timeIntervalProduct)
    }
  }

  const clearTimeout = () => {
    if (intervalRetriesRef.current) {
      clearInterval(intervalRetriesRef.current)
    }
  }

  const checkAddress = (address) => {
    const props = ['address', 'address_notes', 'zipcode', 'location', 'internal_number']
    const values = []
    props.forEach(prop => {
      if (state.options?.address && state.options?.address?.[prop]) {
        if (prop === 'location') {
          values.push(address?.[prop]?.lat === state.options?.address?.[prop]?.lat &&
            address?.[prop]?.lng === state.options?.address?.[prop]?.lng)
        } else {
          values.push(address?.[prop] === state.options?.address?.[prop])
        }
      } else {
        values.push(!address?.[prop])
      }
    })
    return values.every(value => value)
  }

  /**
   * Change order address
   */
  const changeAddress = async (addressId, params) => {
    const isCountryCodeChanged = state.options?.address?.country_code !== params?.country_code
    if (typeof addressId === 'object') {
      const optionsStorage = await strategy.getItem('options', true)
      const options = {
        ...state.options,
        ...optionsStorage,
        ...params,
        address: {
          ...optionsStorage?.address,
          ...addressId
        }
      }
      if (!session.auth) {
        options.type = state?.options?.type
      }
      await strategy.setItem('options', options, true)
      setState({
        ...state,
        options
      })
      if (!session.auth) {
        return
      }
      const syncParams = {}
      if (addressId?.id) syncParams.address_id = addressId.id
      if (params?.country_code) syncParams.country_code = params.country_code
      if (params?.type) syncParams.type = params.type
      if (Object.keys(syncParams).length > 0) {
        await updateOrderOptions(syncParams)
      }
      return
    }

    const _params = { country_code: params?.country_code }

    params?.type && (_params.type = params?.type)

    if (params && params?.address && !checkAddress(params?.address)) {
      _params.address_id = params?.address?.id
      await updateOrderOptions(_params)
      if (isCountryCodeChanged) {
        events.emit('country_code_changed', params?.country_code)
      }
      return
    }
    addressId && (_params.address_id = addressId)
    if (params && params?.isEdit) {
      if (addressId !== state.options.address_id) {
        return
      }
      await updateOrderOptions(_params)
      if (isCountryCodeChanged) {
        events.emit('country_code_changed', params?.country_code)
      }
      return
    }
    await updateOrderOptions(_params)
    if (isCountryCodeChanged) {
      events.emit('country_code_changed', params?.country_code)
    }
  }

  /**
   * Change order type
   */
  const changeType = async (type) => {
    if (state.options.type === type) {
      return
    }

    const params = { type }

    if (state.options?.city_id && type !== 2) {
      params.city_id = null
    }

    const _options = { ...state.options, ...params }
    await strategy.setItem('options', _options, true)
    setState(prevState => ({
      ...prevState,
      options: _options
    }))

    if (session.auth) {
      await updateOrderOptions(params)
    }
  }

  /**
   * Change order moment
   * The optional result lets a picker keep its draft until persistence completes.
   */
  const changeMoment = async (moment, { awaitResult = false } = {}) => {
    const momentUnix = moment ? moment.getTime() / 1000 : null
    const momentFormatted = momentUnix ? dayjs.unix(momentUnix).utc().format('YYYY-MM-DD HH:mm:ss') : null

    const options = {
      ...state.options,
      moment: momentFormatted
    }
    if (state.options.moment === momentFormatted) {
      return awaitResult ? true : undefined
    }

    if (!session.auth) {
      await strategy.setItem('options', options, true)
      setState({
        ...state,
        options
      })
      if (awaitResult) return true
    }

    const update = updateOrderOptions({ moment: momentUnix })
    if (awaitResult) return update
  }

  /**
   * Change order city
   */
  const changeCityFilter = async (id) => {
    const options = {
      ...state.options,
      city_id: id
    }
    if (state.options.city_id === id) {
      return
    }

    if (!session.auth) {
      await strategy.setItem('options', options, true)
      setState({
        ...state,
        options
      })
    }

    updateOrderOptions({ city_id: id })
  }

  /**
   * Clear order address and location (e.g. when selecting a city from home)
   */
  const clearOrderAddress = async () => {
    const options = { ...state.options }
    delete options.address
    delete options.address_id
    await strategy.setItem('options', options, true)
    setState(prevState => ({
      ...prevState,
      options
    }))
  }

  /**
   * Update order option data
   * @param {object} changes Changes to update order options
   */
  const updateOrderOptions = async (changes, { recovering = false, migration, selectionHandled = false } = {}) => {
    if (session.auth) {
      const sync = getGuestDeliverySync()
      if (sync && !sync.finished && !recovering && !selectionHandled &&
        ['address_id', 'type', 'moment'].some(key => changes[key] !== undefined)) {
        return replaceGuestDeliverySelection(sync, changes)
      }
      const typeWrite = changes.type !== undefined ? ++typeWriteSeq.current : null
      const isCurrent = () => !migration || isCurrentGuestDeliverySync(migration)
      const countryCodeFromLocalStorage = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      if (!isCurrent()) return false
      const userCustomerId = customerFromLocalStorage?.id
      const body = {
        ...changes,
        user_id: userCustomerId || session.user.id
      }
      try {
        setState(prevState => ({ ...prevState, loading: true }))
        const options = {}
        state.loading = true
        options.headers = {
          'X-Socket-Id-X': socket?.getId()
        }
        const countryCode = changes?.country_code && changes?.country_code !== state?.options?.address?.country_code
          ? changes?.country_code
          : countryCodeFromLocalStorage ?? changes?.country_code ?? state?.options?.address?.country_code

        if (countryCode) {
          options.headers = {
            ...options.headers,
            'X-Country-Code-X': countryCode
          }
          if (!recovering) await strategy.setItem('country-code', countryCode)
        }
        if (franchiseId) {
          options.query = {
            ...options.query,
            franchise_id: franchiseId
          }
        }
        if (body?.country_code) {
          delete body?.country_code
        }
        const save = transport => ordering
          .setAccessToken(session.token)
          .orderOptions()
          .save(body, { ...options, ...transport })
        const { content: { error, result }, status } = await (migration || !orderOptionsWriteTimeout
          ? requestGuestDelivery(migration, save, true)
          : withWriteTimeout(save, orderOptionsWriteTimeout))
        if (!isCurrent()) return false
        if (!error) {
          if (recovering && countryCode) await strategy.setItem('country-code', countryCode)
          if (!isCurrent()) return false
          const { carts, ...options } = result
          if (ignoreStaleTypeResponses && typeWrite !== null && typeWrite !== typeWriteSeq.current) delete options.type
          setState(prevState => ({
            ...prevState,
            options: { ...prevState.options, ...options },
            carts: resolveOrderOptionsCarts(prevState.carts, carts).carts
          }))
        } else if (!recovering) {
          setAlert({ show: true, content: result, status })
        }
        setState(prevState => ({ ...prevState, loading: false }))
        state.loading = false
        return !error
      } catch (err) {
        if (!isCurrent()) return false
        const message = err?.message?.includes('Internal error')
          ? 'INTERNAL_ERROR'
          : err.message
        if (!recovering) setAlert({ show: true, content: message })
        setState(prevState => ({ ...prevState, loading: false }))
        state.loading = false
        return false
      }
    }
  }

  /**
   * Lets a pickup order proceed without an address. The web marketplace turns
   * this on for a store opened directly by link, or a one-store site; off by
   * default, which keeps the project's `unaddressed_order_types_allowed` rule.
   * @param {boolean} enabled
   */
  const setPickupWithoutAddress = (enabled) => {
    setPickupWithoutAddressState(!!enabled)
  }

  /**
   * Order types that never need the customer's address, on top of the
   * project's `unaddressed_order_types_allowed`. The web marketplace sets
   * every type but delivery and catering delivery; empty by default, which
   * keeps the project's rule.
   * @param {number[]} types
   */
  const setExtraUnaddressedOrderTypes = (types) => {
    setExtraUnaddressedOrderTypesState(Array.isArray(types) ? types.map(Number).filter(Number.isFinite) : [])
  }

  /**
   * Add product to cart
   * @param {object} product product for add
   * @param {object} cart cart of the product
   * @param {boolean} isQuickAddProduct option to add product when clicks
   */
  const addProduct = async (
    product,
    cart,
    isQuickAddProduct,
    isPlatformProduct = false
  ) => {
    try {
      const unaddressedTypes = resolveUnaddressedOrderTypes(
        configState?.configs?.unaddressed_order_types_allowed?.value,
        { pickupWithoutAddress, extraUnaddressedOrderTypes }
      )
      if (shouldRequireOrderAddress(state.options?.type, state.options, unaddressedTypes)) {
        events.emit('require_order_address', { orderType: state.options?.type })
        return false
      }

      if (session.auth) {
        const synced = await syncWorkerPickupToApi()
        if (!synced) {
          return false
        }
      }

      setState(prevState => ({ ...prevState, loading: true }))
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      let body
      const headers = {
        'X-Socket-Id-X': socket?.getId(),
        'X-Country-Code-X': countryCode
      }
      if (!isPlatformProduct) {
        body = {
          product,
          business_id: cart.business_id,
          user_id: userCustomerId || session.user.id
        }
      } else {
        body = {
          platform_product: { ...product }
        }
      }

      const { content: { error, result }, status } = await ordering.setAccessToken(session.token).carts().addProduct(body, { headers })

      if (!error) {
        setState(prevState => ({
          ...prevState,
          carts: mergeCartResult(prevState.carts, result)
        }))
        events.emit('cart_product_added', product, result)
        if (product?.favorite) {
          events.emit('wishlist_product_added_to_cart', product, result)
        }
        events.emit('cart_updated', result)
        events.emit('product_added', product, result)
        isQuickAddProduct && !isDisableToast && showToast(ToastType.Success, t('PRODUCT_ADDED_NOTIFICATION', 'Product _PRODUCT_ added succesfully').replace('_PRODUCT_', product.name))
        setTimeout(() => {
          refreshOrderOptionsWithRetries(cart, product)
        }, 1000)
      } else {
        setAlert({ show: true, content: result, status })
      }
      setState(prevState => ({ ...prevState, loading: false }))
      if (isPlatformProduct) {
        return { error, result }
      } else {
        return !error
      }
    } catch (err) {
      setState(prevState => ({ ...prevState, loading: false }))
      if (isPlatformProduct) {
        return { error: true, result: err.message }
      } else {
        return false
      }
    }
  }

  /**
   * Add multi products to cart / (domino's)
   * @param {object} product product for add
   * @param {object} cart cart of the product
   * @param {boolean} isQuickAddProduct option to add product when clicks
   */
  const addMultiProduct = async (
    product,
    cart,
    isQuickAddProduct
  ) => {
    try {
      setState(prevState => ({ ...prevState, loading: true }))
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const headers = {
        'X-Socket-Id-X': socket?.getId(),
        'X-Country-Code-X': countryCode
      }
      const body = {
        products: JSON.stringify(product),
        business_id: cart.business_id,
        user_id: userCustomerId || session.user.id
      }
      const response = await fetch(`${ordering.root}/carts/multi_product`, {
        method: 'POST',
        body: JSON.stringify({
          ...body,
          products: JSON.stringify([product])
        }),
        headers: {
          ...headers,
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json'
        }
      })
      const { result, error } = await response.json()
      if (!error) {
        setState(prevState => ({
          ...prevState,
          carts: mergeCartResult(prevState.carts, result)
        }))
        events.emit('cart_product_added', product, result)
        if (product?.favorite) {
          events.emit('wishlist_product_added_to_cart', product, result)
        }
        events.emit('cart_updated', result)
        events.emit('product_added', product, result)
        isQuickAddProduct && !isDisableToast && showToast(ToastType.Success, t('PRODUCT_ADDED_NOTIFICATION', 'Product _PRODUCT_ added succesfully').replace('_PRODUCT_', product.name))
        setTimeout(() => {
          refreshOrderOptionsWithRetries(cart, product, result)
        }, 1000)
      } else {
        setAlert({ show: true, content: result, status: response?.status })
      }
      setState(prevState => ({ ...prevState, loading: false }))
      return !error
    } catch (err) {
      setState(prevState => ({ ...prevState, loading: false }))
      return false
    }
  }

  /**
   * Remove product to cart
   */
  const removeProduct = async (product, cart) => {
    try {
      setState(prevState => ({ ...prevState, loading: true }))
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const body = {
        product: {
          id: product.id,
          code: product.code,
          business_id: product.business_id
        },
        business_id: cart.business_id,
        user_id: userCustomerId || session.user.id
      }
      const { content: { error, result }, status } = await ordering.setAccessToken(session.token).carts().removeProduct(body, {
        headers: {
          'X-Socket-Id-X': socket?.getId(),
          'X-Country-Code-X': countryCode
        }
      })
      if (!error) {
        setState(prevState => ({
          ...prevState,
          carts: mergeCartResult(prevState.carts, result)
        }))
        events.emit('cart_product_removed', product, result)
        events.emit('cart_updated', result)
        setTimeout(() => {
          refreshOrderOptionsWithRetries(cart, product)
        }, 1000)
      } else {
        setAlert({ show: true, content: result, status })
      }
      setState(prevState => ({ ...prevState, loading: false }))
      return !error
    } catch (err) {
      setState(prevState => ({ ...prevState, loading: false }))
      return false
    }
  }

  /**
   * Clear products of cart
   */
  const clearCart = async (uuid, configurations = {}) => {
    try {
      setState({ ...state, loading: !configurations?.disableLoading })
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const body = JSON.stringify({
        uuid,
        user_id: userCustomerId || session.user.id
      })
      const response = await fetch(`${ordering.root}/carts/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId(),
          'X-Country-Code-X': countryCode
        },
        body
      })
      const { error, result } = await response.json()
      if (!error) {
        state.carts = { ...state.carts, [`businessId:${result.business_id}`]: result }
      } else {
        setAlert({ show: true, content: result, status: response?.status })
      }
      setState({ ...state, loading: false })
      return { error, result }
    } catch (err) {
      setState({ ...state, loading: false })
      return false
    }
  }

  /**
   * Update product to cart
   */
  const updateProduct = async (product, cart, isQuickAddProduct) => {
    try {
      setState(prevState => ({ ...prevState, loading: true }))
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const body = {
        product,
        business_id: cart.business_id,
        user_id: userCustomerId || session.user.id
      }
      const { content: { error, result }, status } = await ordering.setAccessToken(session.token).carts().updateProduct(body, {
        headers: {
          'X-Socket-Id-X': socket?.getId(),
          'X-Country-Code-X': countryCode
        }
      })
      if (!error) {
        setState(prevState => ({
          ...prevState,
          carts: mergeCartResult(prevState.carts, result)
        }))
        events.emit('cart_product_updated', product, result)
        events.emit('cart_updated', result)
        isQuickAddProduct && !isDisableToast && showToast(ToastType.Success, t('PRODUCT_UPDATED_NOTIFICATION', 'Product _PRODUCT_ updated succesfully').replace('_PRODUCT_', product.name))
        setTimeout(() => {
          refreshOrderOptionsWithRetries(cart, product)
        }, 1000)
      } else {
        setAlert({ show: true, content: result, status })
      }
      setState(prevState => ({ ...prevState, loading: false }))
      return !error
    } catch (err) {
      setState(prevState => ({ ...prevState, loading: false }))
      return false
    }
  }

  const createReservation = async (body) => {
    try {
      const response = await fetch(`${ordering.root}/carts/add_reservation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        },
        body: JSON.stringify(body)
      })
      const { result, error } = await response.json()
      if (!error) {
        state.carts = { ...state.carts, [`businessId:${result.business_id}`]: result }
        events.emit('cart_added', result)
        setState({ ...state, loading: false })
      } else {
        setAlert({ show: true, content: result, status: response?.status })
      }
      return { error, result }
    } catch (err) {
      setState({ ...state, loading: false })
      return { error: true, result: [err.message] }
    }
  }

  /**
   * Apply coupon to cart
   */
  const applyCoupon = async (couponData, customParams) => {
    if (!couponData.business_id) {
      throw new Error('`business_id` is required.')
    }
    if (typeof couponData.coupon === 'undefined') {
      throw new Error('`coupon` is required.')
    }
    if (state.carts[`businessId:${couponData.business_id}`]?.coupon === couponData.coupon) {
      return
    }

    try {
      setState({ ...state, loading: true })
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const body = {
        business_id: couponData.business_id,
        coupon: couponData.coupon,
        user_id: userCustomerId || session.user.id
      }
      const { content, status } = await ordering
        .setAccessToken(session.token)
        .carts()
        .applyCoupon(body, {
          headers: {
            'X-Socket-Id-X': socket?.getId(),
            'X-Country-Code-X': countryCode
          }
        })
      const result = content
      if (!result.error) {
        state.carts = { ...state.carts, [`businessId:${result.result.business_id}`]: result.result }
        events.emit('cart_updated', result.result)
      } else {
        setAlert({ show: true, content: result.result, status })
      }
      setState({ ...state, loading: false })
      return !result.error
    } catch (err) {
      setState({ ...state, loading: false })
      return false
    }
  }

  const applyOffer = async (offerData) => {
    if (!offerData.business_id) {
      throw new Error('`business_id` is required.')
    }
    if (typeof offerData.coupon === 'undefined' && typeof offerData.offer_id === 'undefined') {
      throw new Error('`coupon` or `offer_id` is required.')
    }
    try {
      setState(prevState => ({ ...prevState, loading: true }))
      const countryCode = await strategy.getItem('country-code')
      const offerRequest = {
        user_id: offerData.userId,
        business_id: offerData.business_id,
        force: offerData.force ?? false
      }
      if (typeof offerData.coupon !== 'undefined') offerRequest.coupon = offerData.coupon
      if (typeof offerData.offer_id !== 'undefined') offerRequest.offer_id = offerData.offer_id
      const response = await fetch(`${ordering.root}/carts/add_offer`, {
        method: 'POST',
        body: JSON.stringify(offerRequest),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId(),
          'X-Country-Code-X': countryCode
        }
      })
      const result = await response.json()
      if (!result.error) {
        events.emit('cart_updated', result.result)
        events.emit('offer_applied', { ...result.result, ...offerData })
      } else {
        setAlert({ show: true, content: result.result, status: response?.status })
        events.emit('offer_denied', { ...offerData, reason: result.result })
      }
      setState(prevState => ({
        ...prevState,
        carts: result.error
          ? prevState.carts
          : {
              ...prevState.carts,
              [`businessId:${result.result.business_id}`]: result.result
            },
        loading: false
      }))
      return !result.error
    } catch (err) {
      setState(prevState => ({ ...prevState, loading: false }))
      return false
    }
  }

  const removeOffer = async (offerData) => {
    if (!offerData.business_id) {
      throw new Error('`business_id` is required.')
    }
    if (typeof offerData.offer_id === 'undefined') {
      throw new Error('`offer_id` is required.')
    }
    try {
      const countryCode = await strategy.getItem('country-code')
      setState(prevState => ({ ...prevState, loading: true }))
      const offerRemoveData = {
        business_id: offerData.business_id,
        offer_id: offerData.offer_id
      }
      if (offerData.user_id) offerRemoveData.user_id = offerData.user_id
      const response = await fetch(`${ordering.root}/carts/remove_offer`, {
        method: 'POST',
        body: JSON.stringify(offerRemoveData),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId(),
          'X-Country-Code-X': countryCode
        }
      })
      const result = await response.json()
      if (!result.error) {
        events.emit('cart_updated', result.result)
        events.emit('offer_removed', offerData)
      } else {
        setAlert({ show: true, content: result.result, status: response?.status })
      }
      setState(prevState => ({
        ...prevState,
        carts: result.error
          ? prevState.carts
          : {
              ...prevState.carts,
              [`businessId:${result.result.business_id}`]: result.result
            },
        loading: false
      }))
      return !result.error
    } catch (err) {
      setState(prevState => ({ ...prevState, loading: false }))
      return false
    }
  }

  /**
   * Apply coupon to cart
   */
  const changeDriverTip = async (businessId, driverTipRate = 0, isFixedPrice) => {
    if (!businessId) {
      throw new Error('`businessId` is required.')
    }
    if (!driverTipRate && driverTipRate !== 0) {
      throw new Error('`driverTipRate` is required.')
    }
    if (isUnchangedDriverTip(state.carts[`businessId:${businessId}`], driverTipRate, isFixedPrice)) {
      return
    }
    try {
      setState({ ...state, loading: true })
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const body = {
        business_id: businessId,
        [isFixedPrice ? 'driver_tip' : 'driver_tip_rate']: driverTipRate,
        user_id: userCustomerId || session.user.id
      }
      const { content: { error, result }, status } = await ordering.setAccessToken(session.token).carts().changeDriverTip(body, {
        headers: {
          'X-Socket-Id-X': socket?.getId(),
          'X-Country-Code-X': countryCode
        }
      })
      if (!error) {
        state.carts = { ...state.carts, [`businessId:${result.business_id}`]: result }
        events.emit('cart_updated', result)
      } else {
        setAlert({ show: true, content: result, status })
      }
      setState({ ...state, loading: false })
      return !error
    } catch (err) {
      setState({ ...state, loading: false })
      return false
    }
  }

  /**
   * Change payment method
   */
  const changePaymethod = async (businessId, paymethodId, paymethodData) => {
    if (!businessId) {
      throw new Error('`businessId` is required.')
    }
    if (!paymethodId) {
      throw new Error('`paymethodId` is required.')
    }
    if (!paymethodData) {
      throw new Error('`paymethodData` is required.')
    }
    if (!state.carts[`businessId:${businessId}`]) {
      return
    }
    const cart = state.carts[`businessId:${businessId}`]
    const isSamePaymethod = cart?.paymethodId === paymethodId
    let parsedPaymethodData = paymethodData
    if (typeof paymethodData === 'string') {
      try {
        parsedPaymethodData = JSON.parse(paymethodData)
      } catch {
        parsedPaymethodData = {}
      }
    }
    const hasRedirectData = parsedPaymethodData?.success_url || parsedPaymethodData?.cancel_url
    if (isSamePaymethod && !hasRedirectData) {
      return
    }
    try {
      setState({ ...state, loading: true })
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const body = {
        business_id: businessId,
        paymethod_id: paymethodId,
        paymethod_data: paymethodData,
        user_id: userCustomerId ?? session.user.id
      }
      const { content: { error, result } } = await ordering.setAccessToken(session.token).carts().changePaymethod(body, {
        headers: {
          'X-Socket-Id-X': socket?.getId(),
          'X-Country-Code-X': countryCode
        }
      })
      if (!error) {
        events.emit('cart_updated', result)
      }
      setState(prevState => {
        const newCarts = { ...prevState.carts }
        if (!error) {
          const currentCart = newCarts[`businessId:${result.business_id}`]
          const currentTime = currentCart?.updated_at ? dayjs(currentCart.updated_at) : null
          const resultTime = result?.updated_at ? dayjs(result.updated_at) : null
          if (currentTime?.isValid() && resultTime?.isValid() && currentTime.isAfter(resultTime)) {
            return { ...prevState, loading: false }
          }
          newCarts[`businessId:${result.business_id}`] = result
        }
        return { ...prevState, carts: newCarts, loading: false }
      })
      return !error
    } catch (err) {
      refreshOrderOptions()
      setState(prevState => ({ ...prevState, loading: false }))
      return false
    }
  }

  /**
   * Remember the UTM parameters the current URL carries (ORD-1992). Web only.
   * Called when the site loads, and with `businessId` when the store that URL
   * opened finishes loading: that makes it a visit to that store. A URL
   * without `utm_source` keeps what was remembered (last non-direct click).
   *
   * Calls run one after another: each one reads the stored visits, changes
   * them and writes them back.
   */
  const captureReferral = (businessId) => {
    if (typeof window === 'undefined' || !window.location) return referralCapture.current.queue
    if (!referralEnabledRef.current) {
      const search = window.location.search
      // A store that reloads reports itself again: the first report keeps its time.
      const known = pendingReferrals.current.some(pending => pending.search === search && pending.businessId === businessId)
      if (search && !known) {
        pendingReferrals.current = [
          ...pendingReferrals.current,
          { search, businessId, at: Date.now(), repeated: isRepeatedNavigation(window.performance) }
        ].slice(-REFERRAL_MAX_PENDING)
      }
      return referralCapture.current.queue
    }
    return enqueueReferral(() => ({
      search: window.location.search,
      businessId,
      repeated: isRepeatedNavigation(window.performance)
    }))
  }

  /**
   * Remember a visit from explicit values instead of a URL, for apps with no
   * URL (React Native: the data of a marketing push notification the user
   * opened) and for the web alike. Returns the capture queue promise.
   *
   * `{ source, medium, campaign }` are the `utm_*` values; `source` is
   * required and an unusable one records nothing. `businessId` makes it a
   * visit to that store, like `captureReferral(businessId)`.
   *
   * It goes through the same machinery as a URL visit: same storage, same
   * normalization, 30 days, 20 visits, same queue, and the same consent: while
   * `referralEnabled` is false it is held in memory with its time and stored
   * when attribution turns on; if it never does, nothing is stored.
   *
   * Each call is a click the user made, so it is always a new visit dated now
   * and the newest one wins on place. Calling it again with the same
   * combination (and the same store) does not add a second entry: it
   * replaces the previous one, so its date is the newest click. It never
   * touches the page-load memory `captureReferral` relies on.
   */
  const registerReferral = ({ source, medium, campaign } = {}, businessId) => {
    const register = { source, medium, campaign }
    if (!referralEnabledRef.current) {
      pendingReferrals.current = [
        ...pendingReferrals.current,
        { register, businessId, at: Date.now() }
      ].slice(-REFERRAL_MAX_PENDING)
      return referralCapture.current.queue
    }
    return enqueueReferral(() => ({ register, businessId }))
  }

  /**
   * Queues one capture. `read` runs when its turn comes (the URL can change
   * while earlier captures finish) and may carry the time of the visit.
   */
  const enqueueReferral = (read) => {
    referralCapture.current.queue = referralCapture.current.queue.then(async () => {
      // Checked again here: the site may have turned attribution off while this waited.
      if (!referralEnabledRef.current) return
      const { search, businessId, repeated, now, register } = read()
      if (register) {
        try {
          const registered = registerVisit(await strategy.getItem(REFERRAL_STORAGE_KEY, true), { ...register, businessId, now })
          if (registered) await strategy.setItem(REFERRAL_STORAGE_KEY, registered.stored, true)
        } catch (e) {}
        return
      }
      if (!search) return
      try {
        const captured = captureVisit(await strategy.getItem(REFERRAL_STORAGE_KEY, true), {
          search,
          businessId,
          landing: referralCapture.current.landing,
          repeated,
          now
        })
        if (captured) {
          referralCapture.current.landing = captured.landing
          await strategy.setItem(REFERRAL_STORAGE_KEY, captured.stored, true)
        }
      } catch (e) {}
      try {
        // Google's rwg_token (ORD-2402): one per site, a new one replaces it.
        const clickId = clickIdToKeep(await strategy.getItem(CLICK_ID_STORAGE_KEY, true), search, businessId, now)
        if (clickId) await strategy.setItem(CLICK_ID_STORAGE_KEY, clickId, true)
      } catch (e) {}
    })
    return referralCapture.current.queue
  }

  /**
   * Adds the remembered `referral` (the UTM visit, ORD-1992) and the site's
   * click id (ORD-2402) to a place body; never blocks the place.
   * `businessIds` are the stores being placed. An order placed for a customer
   * (`onBehalf`, the call center) is not a result of the agent's own visit
   * and gets neither.
   */
  const withReferral = async (body, { businessIds = [], onBehalf = false } = {}) => {
    if (body.referral || onBehalf || !referralEnabledRef.current) return body
    try {
      const referral = referralForPlace(await strategy.getItem(REFERRAL_STORAGE_KEY, true), businessIds)
      const clickId = clickIdForPlace(await strategy.getItem(CLICK_ID_STORAGE_KEY, true))
      return referral || clickId ? { ...body, referral: { ...referral, ...clickId } } : body
    } catch (e) {
      return body
    }
  }

  /**
   * Place cart
   */
  const placeCart = async (cardId, data) => {
    try {
      setState({ ...state, loading: true })
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const body = await withReferral({
        ...data,
        user_id: userCustomerId || session.user.id
      }, {
        businessIds: Object.values(state.carts ?? {}).filter(cart => cart?.uuid === cardId).map(cart => cart.business_id),
        onBehalf: !!userCustomerId
      })
      let headers = {
        'X-Socket-Id-X': socket?.getId(),
        'X-Country-Code-X': countryCode,
        'X-APP-X': ordering?.appId
      }
      if (userAgent) {
        headers = { ...headers, 'User-Agent': userAgent }
      }
      const { content: { error, result }, status } = await ordering.setAccessToken(session.token).carts(cardId).place(body, { headers })
      if (!error) {
        if (result.status !== 1) {
          state.carts = { ...state.carts, [`businessId:${result.business_id}`]: result }
          events.emit('cart_updated', result)
        } else {
          state.carts = withoutCart(state.carts, `businessId:${result.business_id}`)
          const orderObject = {
            id: result.order.uuid,
            business: { name: result.business.name },
            total: result.total,
            tax_total: result.tax,
            delivery_zone_price: result.delivery_price,
            business_id: result.business_id,
            paymethod: result.paymethod_data.gateway
          }
          events.emit('order_placed', orderObject)
        }
      } else {
        const toI18nKey = (msg) => msg.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
        const friendlyFallbacks = {
          ERROR_CART_PLACE_TOTAL_DIFFERENT: 'Price adjustments are still being applied. Please try again in a moment.'
        }
        const friendlyContent = Array.isArray(result)
          ? result.map(item => {
            const msg = typeof item === 'string' ? item : item?.message
            if (typeof msg !== 'string') return item
            const key = toI18nKey(msg)
            return t(key, friendlyFallbacks[key] ?? msg)
          })
          : result
        setAlert({ show: true, content: friendlyContent, status })
        setState({ ...state, loading: false })
        return
      }
      setState({ ...state, loading: false })
      return { error, result }
    } catch (err) {
      setState({ ...state, loading: false })
      return {
        error: true,
        result: [err.message]
      }
    }
  }

  /**
   * Place multi carts
   */
  const placeMultiCarts = async (data, cartUuid) => {
    try {
      setState({ ...state, loading: true })
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const body = await withReferral({
        ...data,
        user_id: userCustomerId || session.user.id
      }, {
        businessIds: Object.values(state.carts ?? {}).filter(cart => cart?.cart_group_id).map(cart => cart.business_id),
        onBehalf: !!userCustomerId
      })
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `bearer ${session.token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId(),
          'X-Country-Code-X': countryCode
        },
        body: JSON.stringify(body)
      }

      const response = await fetch(`${ordering.root}/cart_groups/${cartUuid}/place`, requestOptions)
      const { error, result } = await response.json()
      if (!error) {
        result.carts.forEach(cart => {
          state.carts = withoutCart(state.carts, `businessId:${cart.business_id}`)
          const orderObject = {
            id: cart.uuid,
            business: { name: cart.business.name },
            total: cart.total,
            tax_total: cart.tax,
            delivery_zone_price: cart.delivery_price,
            business_id: cart.business_id
          }
          events.emit('order_placed', orderObject)
        })
      } else {
        setAlert({ show: true, content: result, status: response?.status })
      }
      setState({ ...state, loading: false })
      return { error, result }
    } catch (err) {
      setState({ ...state, loading: false })
      return {
        error: true,
        result: [err.message]
      }
    }
  }

  /**
   * Confirm cart
   */
  const confirmCart = async (cardId, data) => {
    try {
      setState(prevState => ({ ...prevState, loading: true }))
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const body = {
        ...data,
        user_id: userCustomerId || session.user.id
      }
      let fetchurl
      if (body.user_id === userCustomerId || data) {
        fetchurl = await ordering.setAccessToken(session.token).carts(cardId).confirmWithData(body, {
          headers: {
            'X-Socket-Id-X': socket?.getId(),
            'X-Country-Code-X': countryCode
          }
        })
      } else {
        fetchurl = await ordering.setAccessToken(session.token).carts(cardId).confirm(body, {
          headers: {
            'X-Socket-Id-X': socket?.getId(),
            'X-Country-Code-X': countryCode
          }
        })
      }
      const { content: { error, result, cart } } = fetchurl
      setState(prevState => {
        let nextCarts = evictConsumedCart(prevState.carts, {
          cartUuid: cardId,
          error,
          result
        })
        const confirmedCartStillPresent = Object.values(nextCarts).some((item) => item?.uuid === cardId)
        if (!error && result?.status !== 1 && !result?.order && result?.business_id != null) {
          nextCarts = {
            ...nextCarts,
            [`businessId:${result.business_id}`]: result
          }
        } else if (error && cart?.business_id != null && confirmedCartStillPresent) {
          nextCarts = {
            ...nextCarts,
            [`businessId:${cart.business_id}`]: cart
          }
        }
        return {
          ...prevState,
          loading: false,
          carts: nextCarts
        }
      })
      if (!shouldEvictConsumedCart({ error, result })) {
        if (!error && result?.status !== 1 && !result?.order) {
          events.emit('cart_updated', result)
        } else if (error && cart) {
          events.emit('cart_updated', cart)
        }
      }
      return { error, result, cart }
    } catch (err) {
      setState(prevState => ({ ...prevState, loading: false }))
      return {
        error: true,
        result: [err.message]
      }
    }
  }

  /**
 * Confirm multi carts
 */
  const confirmMultiCarts = async (cartUuid, data) => {
    try {
      setState({ ...state, loading: true })
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const body = {
        ...data,
        user_id: userCustomerId || session.user.id
      }
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `bearer ${session.token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId(),
          'X-Country-Code-X': countryCode
        }
      }
      if (data) {
        requestOptions.body = JSON.stringify(body)
      }
      const response = await fetch(`${ordering.root}/cart_groups/${cartUuid}/confirm`, requestOptions)
      const { result, error } = await response.json()
      if (!error && result?.carts) {
        result.carts.forEach(cart => {
          if (result.status !== 'completed') {
            state.carts = { ...state.carts, [`businessId:${cart.business_id}`]: result.carts.find(_cart => _cart?.business_id === cart?.business_id) }
            events.emit('cart_updated', result)
          } else {
            state.carts = withoutCart(state.carts, `businessId:${cart.business_id}`)
          }
        })
      }
      setState({ ...state, loading: false })
      return { error, result }
    } catch (err) {
      setState({ ...state, loading: false })
      return {
        error: true,
        result: [err.message]
      }
    }
  }

  /**
   * Reorder an order and get cart
   */
  const reorder = async (orderId, offAlert, configurations = {}) => {
    try {
      setState({ ...state, loading: !configurations?.disableLoading })
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const query = userCustomerId
        ? { user_id: userCustomerId }
        : null
      const options = {
        headers: {
          'X-Socket-Id-X': socket?.getId(),
          'X-Country-Code-X': countryCode
        }
      }
      if (query) {
        options.query = query
      }
      const { content: { error, result }, status } = await ordering.setAccessToken(session.token).orders(orderId).reorder(options)
      if (!error) {
        state.carts = { ...state.carts, [`businessId:${result.business_id}`]: result }
        events.emit('cart_added', result)
      } else if (!offAlert) {
        setAlert({ show: true, content: result, status })
      }
      setState({ ...state, loading: false })
      return { error, result }
    } catch (err) {
      setState({ ...state, loading: false })
      return { error: true, result: [err.message] }
    }
  }

  const setOptionFromLocalStorage = async () => {
    const optionsLocalStorage = await strategy.getItem('options', true)
    const savedAddress = optionsLocalStorage?.address || state?.options?.address || {}
    const savedAddressId = optionsLocalStorage?.address_id || state?.options?.address_id || null
    const savedType = optionsLocalStorage?.type || defaultOrderType
    const resolvedType = shouldForceWorkerPickup({ address: savedAddress, address_id: savedAddressId }) ? orderTypes.pickup : savedType
    if (forceWorkerPickup && !isDisabledDefaultOpts && optionsLocalStorage && optionsLocalStorage.type !== resolvedType) {
      await strategy.setItem('options', { ...optionsLocalStorage, type: resolvedType }, true)
    }
    setState({
      ...state,
      loading: false,
      options: isDisabledDefaultOpts
        ? { type: null, moment: null }
        : {
            type: resolvedType,
            moment: optionsLocalStorage?.moment || null,
            address: savedAddress,
            address_id: savedAddressId,
            city_id: optionsLocalStorage?.city_id || null
          }
    })
  }

  /**
  * get Latest past Order that has no review
  */
  const getLastOrderHasNoReview = async () => {
    if (session?.token) {
      const pastOrderTypes = [1, 2, 5, 6, 10, 11, 12, 15, 16, 17]
      const where = [
        { attribute: 'status', value: pastOrderTypes },
        {
          attribute: 'products',
          conditions: [{
            attribute: 'type',
            value: {
              condition: '!=',
              value: 'gift_card'
            }
          }]
        }]
      if (franchiseId) {
        where.push({
          attribute: 'ref_business',
          conditions: [
            {
              attribute: 'franchise_id',
              value: {
                condition: '=',
                value: franchiseId
              }
            }
          ]
        })
      }
      if (typeof businessSlug === 'number' && businessSlug) {
        where.push({
          attribute: 'ref_business',
          conditions: [
            {
              attribute: 'id',
              value: {
                condition: '=',
                value: businessSlug
              }
            }
          ]
        })
      }
      if (typeof businessSlug === 'string' && businessSlug) {
        where.push({
          attribute: 'ref_business',
          conditions: [
            {
              attribute: 'slug',
              value: {
                condition: '=',
                value: businessSlug
              }
            }
          ]
        })
      }
      const options = {
        query: {
          orderBy: '-delivery_datetime',
          page: 1,
          page_size: 10,
          where
        }
      }
      const { content: { result, error } } = await ordering.setAccessToken(session?.token).orders().get(options)

      if (!error && result?.length > 0) {
        const _noRviewOrder = result?.find(order => !order?.review)
        if (_noRviewOrder?.cart_group_id) {
          where.push({ attribute: 'cart_group_id', value: _noRviewOrder?.cart_group_id })
          const options = {
            query: {
              where,
              page: 1,
              page_size: 10
            }
          }
          const { content: { result, error } } = await ordering.setAccessToken(session?.token).orders().get(options)
          if (!error) {
            const noReviewOrders = result.filter(order => !order?.review)
            return noReviewOrders
          } else {
            return null
          }
        } else {
          return _noRviewOrder
        }
      } else {
        return null
      }
    } else {
      return null
    }
  }

  const setStateValues = (values) => {
    setState(prevState => {
      if (!values?.carts) {
        return { ...prevState, ...values }
      }
      return {
        ...prevState,
        ...values,
        carts: mergeCartsByUpdatedAt(prevState.carts, values.carts)
      }
    })
  }

  const setUserCustomerOptions = async (params) => {
    setState({ ...state, loading: true })
    const options = params.options ?? {}
    await setUserCustomer(params.customer ?? {}, true)
    await updateOrderOptions(options)
    setState({ ...state, loading: false })
  }

  const setStateInitialValues = () => {
    setState({
      loading: false,
      options: isDisabledDefaultOpts
        ? { type: null, moment: null, city_id: null }
        : {
            type: defaultOrderType,
            moment: null,
            city_id: null
          },
      carts: {},
      confirmAlert,
      alert
    })
  }

  const handleOrderStateLoading = (loading) => {
    setState({
      ...state,
      loading
    })
  }

  const handleLogEvent = async (events) => {
    if (!session.token) return
    try {
      const countryCode = await strategy.getItem('country-code')
      const headers = {
        'X-Socket-Id-X': socket?.getId(),
        'X-Country-Code-X': countryCode
      }
      await fetch(`${ordering.root}/tracking_events`, {
        method: 'POST',
        body: JSON.stringify({
          events
        }),
        headers: {
          ...headers,
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json'
        }
      })
    } catch (err) { }
  }

  useEffect(() => {
    captureReferral()
  }, [])

  useEffect(() => {
    if (!referralEnabled || !pendingReferrals.current.length) return
    const pending = pendingReferrals.current
    pendingReferrals.current = []
    // Dated with the visit, not with the consent.
    pending.forEach(({ at, ...visit }) => enqueueReferral(() => ({ ...visit, now: at })))
  }, [referralEnabled])

  useEffect(() => {
    if (session.loading || languageState.loading || !ordering?.project) return
    if (session.auth) {
      if (waitForGuestDeliveryAddress) {
        ensureGuestDeliveryAddress().then(saved => {
          if (saved === null) refreshOrderOptions()
        })
      } else {
        setState(prevState => (prevState.loading ? prevState : { ...prevState, loading: true }))
        refreshOrderOptions()
      }
    } else {
      guestDeliverySync.current = null
    }
  }, [session.auth, session.loading, languageState.loading, ordering?.project, session?.user?.id])

  useEffect(() => {
    if (session.loading || configState.loading) return
    if (!session.auth) {
      setOptionFromLocalStorage()
    }
  }, [session.auth, session.loading, configState])

  useEffect(() => {
    if (configTypes?.length > 0 && state.options.type && !configTypes.includes(state.options.type)) {
      // `default_order_type.type` is the config row's type (select), not an order type: read the value.
      const defaultTypeFromConfig = orderTypes[configState?.configs?.default_order_type?.value]
      const validDefaultValue = configTypes.includes(defaultTypeFromConfig)
      const fallbackType = validDefaultValue ? defaultTypeFromConfig : configTypes[0]
      updateOrderOptions({ type: fallbackType })
      if (!session.auth && !state?.loading) {
        changeType(fallbackType)
      }
      if (!session.auth) {
        changeType(fallbackType)
      }
    }
  }, [configTypes?.length, state.options.type])

  // `disableWorkerPickup`: a guest left without a type (nothing saved and a default that
  // maps to none) takes the first allowed one, once the saved options have loaded. It runs
  // once the type is set, so it cannot loop; `isDisabledDefaultOpts` keeps its null type.
  useEffect(() => {
    if (!disableWorkerPickup || isDisabledDefaultOpts) return
    if (session.loading || session.auth || state.loading || state.options.type) return
    if (!(configTypes?.length > 0)) return
    changeType(configTypes[0])
  }, [disableWorkerPickup, configTypes?.length, state.options.type, state.loading, session.loading, session.auth])

  /**
   * Update carts from sockets
   */
  useEffect(() => {
    const handleCartUpdate = (cart) => {
      if (!isDisableToast) {
        showToast(ToastType.Info, t('UPDATING_CART_INFO', 'Updating cart information...'))
      }

      setState(prevState => {
        if (!cart || typeof cart !== 'object' || !cart.business_id) {
          console.warn('Invalid cart data received from socket:', cart)
          return prevState
        }

        const newState = { ...prevState }
        const newCarts = { ...prevState.carts }

        if (cart.status === 1) {
          delete newCarts[`businessId:${cart.business_id}`]
          return {
            ...newState,
            carts: newCarts
          }
        } else {
          const cartFound = Object.values(prevState.carts).find(_cart => _cart?.uuid === cart?.uuid)

          if (cartFound?.updated_at && cart?.updated_at) {
            const cartFoundTime = dayjs(cartFound.updated_at)
            const cartTime = dayjs(cart.updated_at)

            if (cartFoundTime.isValid() && cartTime.isValid() && cartFoundTime.isAfter(cartTime)) {
              return prevState
            }
          }

          const oldBusinessId = cartFound?.business_id
          const newBusinessId = cart?.business_id

          if (!oldBusinessId || oldBusinessId === newBusinessId) {
            newCarts[`businessId:${cart.business_id}`] = {
              ...(newCarts[`businessId:${cart.business_id}`] || {}),
              ...cart
            }
          } else {
            delete newCarts[`businessId:${oldBusinessId}`]
            newCarts[`businessId:${newBusinessId}`] = { ...cart }
          }

          return {
            ...newState,
            carts: newCarts
          }
        }
      })
    }
    const handleOrderOptionUpdate = ({ carts, ...options }) => {
      if (!isDisableToast) {
        showToast(ToastType.Info, t('UPDATING_ORDER_OPTIONS', 'Updating order options...'))
      }

      setState((prevState) => ({
        ...prevState,
        options: {
          ...prevState.options,
          ...options
        },
        carts: resolveOrderOptionsCarts(prevState.carts, carts).carts
      }))
    }
    socket.on('carts_update', handleCartUpdate)
    socket.on('order_options_update', handleOrderOptionUpdate)
    return () => {
      socket.off('carts_update', handleCartUpdate)
      socket.off('order_options_update', handleOrderOptionUpdate)
    }
    // The handlers read the state through setState(prev => …): subscribing again on every
    // cart or option change was not needed.
  }, [socket, isDisableToast, t, showToast])

  /**
   * Join to carts room
   */
  useEffect(() => {
    if (!session.auth || session.loading) return
    socket.join(`carts_${customerState?.user?.id || session?.user?.id}`)
    socket.join(`orderoptions_${customerState?.user?.id || session?.user?.id}`)
    return () => {
      socket.leave(`carts_${customerState?.user?.id || session?.user?.id}`)
      socket.leave(`orderoptions_${customerState?.user?.id || session?.user?.id}`)
    }
  }, [socket, session.auth, session.loading, customerState?.user?.id, session?.user?.id])

  const functions = {
    refreshOrderOptions,
    ensureGuestDeliveryAddress,
    changeAddress,
    changeType,
    changeMoment,
    updateOrderOptions,
    addProduct,
    removeProduct,
    updateProduct,
    clearCart,
    applyCoupon,
    applyOffer,
    removeOffer,
    changeDriverTip,
    placeCart,
    confirmCart,
    reorder,
    setAlert,
    setConfirm,
    changePaymethod,
    setUserCustomerOptions,
    setStateValues,
    placeMultiCarts,
    captureReferral,
    registerReferral,
    getLastOrderHasNoReview,
    changeCityFilter,
    clearOrderAddress,
    confirmMultiCarts,
    addMultiProduct,
    setStateInitialValues,
    handleOrderStateLoading,
    createReservation,
    handleLogEvent,
    clearTimeout,
    setPickupWithoutAddress,
    setExtraUnaddressedOrderTypes
  }

  const copyState = { ...JSON.parse(JSON.stringify(state)), pickupWithoutAddress, extraUnaddressedOrderTypes }

  const latestFunctions = useRef(functions)
  latestFunctions.current = functions
  const stableActions = useMemo(() => {
    const actions = {}
    Object.keys(latestFunctions.current).forEach((name) => {
      actions[name] = (...args) => latestFunctions.current[name](...args)
    })
    return actions
  }, [])

  return (
    <OrderActionsContext.Provider value={stableActions}>
      <OrderStateContext.Provider value={state}>
        <OrderContext.Provider value={[copyState, functions]}>
          {
            Alert && (
              <Alert
                open={alert.show}
                title={alert.title || t('ERROR', 'Error')}
                onAccept={() => setAlert({ show: false })}
                onClose={() => setAlert({ show: false })}
                content={alert.content}
                status={alert.status}
              />
            )
          }
          {children}
        </OrderContext.Provider>
      </OrderStateContext.Provider>
    </OrderActionsContext.Provider>
  )
}

/** The order's state without the copy, rendering again only when it changes (read only). */
export const useOrderState = () => {
  const state = useContext(OrderStateContext)
  if (!state) {
    console.warn('Must use OrderProvider to wrappe the app.')
    return {}
  }
  return state
}

/** The order's actions, stable for the provider's life. */
export const useOrderActions = () => {
  const actions = useContext(OrderActionsContext)
  if (!actions) {
    console.warn('Must use OrderProvider to wrappe the app.')
    return {}
  }
  return actions
}

/**
 * Hook to get and update order state
 */
export const useOrder = () => {
  const orderManager = useContext(OrderContext)
  const warningMessage = () => {
    console.warn('Must use OrderProvider to wrappe the app.')
  }
  /**
   * Functions to avoid fails
   */
  const functionsPlaceholders = {
    refreshOrderOptions: warningMessage,
    changeAddress: warningMessage,
    changeType: warningMessage,
    changeMoment: warningMessage,
    addProduct: warningMessage,
    removeProduct: warningMessage,
    updateProduct: warningMessage,
    clearCart: warningMessage,
    applyCoupon: warningMessage,
    placeCart: warningMessage,
    confirmCart: warningMessage,
    setAlert: warningMessage,
    setConfirm: warningMessage,
    changeDriverTip: warningMessage,
    reorder: warningMessage,
    changePaymethod: warningMessage,
    setStateValues: warningMessage,
    getLastOrderHasNoReview: warningMessage,
    clearOrderAddress: warningMessage,
    captureReferral: () => {},
    registerReferral: () => {}
  }
  return orderManager || [{}, functionsPlaceholders]
}
