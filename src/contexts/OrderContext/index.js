import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useSession } from '../SessionContext'
import { useApi } from '../ApiContext'
import { useWebsocket } from '../WebsocketContext'
import { useLanguage } from '../LanguageContext'
import { useEvent } from '../EventContext'
import { useConfig } from '../ConfigContext'
import { useCustomer } from '../CustomerContext'
import { ToastType, useToast } from '../ToastContext'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { parseUnaddressedOrderTypes, shouldRequireOrderAddress } from '../../utils/orderTypeAddress'

dayjs.extend(utc)

/**
 * Create OrderContext
 * This context will manage the current order with options internally and provide an easy interface
 */
export const OrderContext = createContext()

/**
 * Custom provider to order manager
 * This provider has a reducer for manage order state
 * @param {props} props
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
  enableCouponsRetries = false
}) => {
  const [confirmAlert, setConfirm] = useState({ show: false })
  const [alert, setAlert] = useState({ show: false })
  const [ordering] = useApi()
  const socket = useWebsocket()
  const [languageState, t] = useLanguage()
  const [events] = useEvent()
  const [configState] = useConfig()
  const [session, { logout }] = useSession()
  const [customerState, { setUserCustomer }] = useCustomer()
  const [, { showToast }] = useToast()

  const configTypes = configState?.configs?.order_types_allowed?.value.split('|').map(value => Number(value)) || []

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
  const defaultOrderType = fromWorker
    ? orderTypes.pickup
    : orderTypes[configState?.configs?.default_order_type?.value]

  const shouldForceWorkerPickup = (orderOptions) => (
    fromWorker &&
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
  const timeIntervalProduct = 4000
  const retriesProduct = 4

  /**
   * Refresh order options and carts from API
   */
  const refreshOrderOptions = async () => {
    try {
      if (!state.loading) {
        setState(prevState => ({ ...prevState, loading: true }))
      }
      const countryCodeFromLocalStorage = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
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

      const res = await ordering.setAccessToken(session.token).orderOptions().get(options)
      const error = res?.content?.error
      const result = res?.content?.result
      const status = res?.status
      let hasApiAddressContext = false
      if (!error) {
        const { carts, ...options } = result
        hasApiAddressContext = Boolean(options.address_id || options.address?.location)

        if (!Array.isArray(carts)) {
          return
        }

        const newCarts = {}
        carts.forEach(cart => {
          if (!cart || typeof cart !== 'object' || !cart.business_id) {
            return
          }

          const cartFound = state.carts[`businessId:${cart.business_id}`]

          if (cartFound?.updated_at && cart?.updated_at) {
            const cartFoundTime = dayjs(cartFound.updated_at)
            const cartTime = dayjs(cart.updated_at)

            if (cartFoundTime.isValid() && cartTime.isValid() && cartFoundTime.isAfter(cartTime)) {
              newCarts[`businessId:${cart.business_id}`] = { ...cartFound }
            } else {
              newCarts[`businessId:${cart.business_id}`] = { ...cart }
            }
          } else {
            newCarts[`businessId:${cart.business_id}`] = { ...cart }
          }
        })

        setState(prevState => {
          const mergedOptions = { ...prevState.options, ...options }
          if (shouldForceWorkerPickup(mergedOptions)) {
            mergedOptions.type = orderTypes.pickup
          }
          return {
            ...prevState,
            options: mergedOptions,
            carts: newCarts
          }
        })

        const shouldSyncPickup = shouldForceWorkerPickup(options) && options.type !== orderTypes.pickup
        const shouldSyncCountryCode = !countryCodeFromLocalStorage && options?.address?.country_code

        if (shouldSyncPickup || shouldSyncCountryCode) {
          const syncParams = {}
          if (shouldSyncPickup) syncParams.type = orderTypes.pickup
          if (shouldSyncCountryCode) syncParams.country_code = options.address.country_code
          await updateOrderOptions(syncParams)
        } else {
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
            return
          }
          await logout()
          return
        }
        setAlert({ show: true, content: result, status })
      }
      const localOptions = await strategy.getItem('options', true)
      if (localOptions) {
        const options = {}
        if (Object.keys(localOptions?.address || {})?.length > 0) {
          const conditions = [
            { attribute: 'address', value: localOptions?.address?.address }
          ]
          const userId = userCustomerId || session.user.id
          const addressesResponse = await ordering.setAccessToken(session.token).users(userId).addresses().where(conditions).get()
          let address = addressesResponse.content.result.find(address => {
            localOptions.address.internal_number = localOptions.address?.internal_number || null
            localOptions.address.zipcode = localOptions.address?.zipcode || null
            localOptions.address.address_notes = localOptions.address?.address_notes || null

            return address?.location?.lat === localOptions?.address?.location.lat &&
              address?.location?.lng === localOptions?.address?.location?.lng &&
              address?.internal_number === localOptions?.address?.internal_number &&
              address?.zipcode === localOptions?.address?.zipcode &&
              address?.address_notes === localOptions?.address?.address_notes
          })
          if (!address) {
            Object.keys(localOptions.address).forEach(key => localOptions?.address?.[key] === null && delete localOptions?.address?.[key])
            const { content: { error, result } } = await ordering.setAccessToken(session.token).users(userId).addresses().save(localOptions.address)
            if (!error) {
              address = result
            }
          } else {
            await ordering.setAccessToken(session.token).users(userId).addresses(address.id).save({ default: true })
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
        }
        if (localOptions?.address_id) {
          options.address_id = localOptions?.address_id
        }
        if (localOptions?.city_id && !hasApiAddressContext) {
          options.city_id = localOptions?.city_id
        }
        if (options && Object.keys(options).length > 0) {
          await updateOrderOptions(options)
        } else {
          setState(prevState => ({ ...prevState, loading: false }))
        }
        await strategy.removeItem('options')
      } else {
        setState(prevState => ({ ...prevState, loading: false }))
      }
    } catch (err) {
      const message = err?.message?.includes('Internal error')
        ? 'INTERNAL_ERROR'
        : !err.message
            ? t('NETWORK_ERROR', 'Network error')
            : err.message
      setAlert({ show: true, content: message })
      setState(prevState => ({ ...prevState, loading: false }))
    }
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
   */
  const changeMoment = async (moment) => {
    const momentUnix = moment ? moment.getTime() / 1000 : null
    const momentFormatted = momentUnix ? dayjs.unix(momentUnix).utc().format('YYYY-MM-DD HH:mm:ss') : null

    const options = {
      ...state.options,
      moment: momentFormatted
    }
    if (state.options.moment === momentFormatted) {
      return
    }

    if (!session.auth) {
      await strategy.setItem('options', options, true)
      setState({
        ...state,
        options
      })
    }

    updateOrderOptions({ moment: momentUnix })
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
  const updateOrderOptions = async (changes) => {
    if (session.auth) {
      const countryCodeFromLocalStorage = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
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
          await strategy.setItem('country-code', countryCode)
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
        const { content: { error, result }, status } = await ordering
          .setAccessToken(session.token)
          .orderOptions()
          .save(body, options)
        if (!error) {
          const { carts, ...options } = result
          const newCarts = {}
          carts.forEach(cart => {
            newCarts[`businessId:${cart.business_id}`] = cart
          })
          setState(prevState => ({ ...prevState, options: { ...prevState.options, ...options }, carts: newCarts }))
        } else {
          setAlert({ show: true, content: result, status })
        }
        setState(prevState => ({ ...prevState, loading: false }))
        state.loading = false
        return !error
      } catch (err) {
        const message = err?.message?.includes('Internal error')
          ? 'INTERNAL_ERROR'
          : err.message
        setAlert({ show: true, content: message })
        setState(prevState => ({ ...prevState, loading: false }))
        state.loading = false
        return false
      }
    }
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
      const unaddressedTypes = parseUnaddressedOrderTypes(
        configState?.configs?.unaddressed_order_types_allowed?.value
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

      setState({ ...state, loading: true })
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
        const newCarts = {
          ...state.carts,
          [`businessId:${result.business_id}`]: result
        }
        setState(prevState => ({
          ...prevState,
          carts: newCarts
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
        const newCarts = {
          ...state.carts,
          [`businessId:${result.business_id}`]: result
        }
        setState(prevState => ({ ...prevState, carts: newCarts }))
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
        const newCarts = {
          ...state.carts,
          [`businessId:${result.business_id}`]: result
        }
        setState(prevState => ({ ...prevState, carts: newCarts }))
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
        state.carts[`businessId:${result.business_id}`] = result
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
        const newCarts = {
          ...state.carts,
          [`businessId:${result.business_id}`]: result
        }
        setState(prevState => ({ ...prevState, carts: newCarts }))
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
        state.carts[`businessId:${result.business_id}`] = result
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
        state.carts[`businessId:${result.result.business_id}`] = result.result
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
    if (!state.carts[`businessId:${businessId}`] || state.carts[`businessId:${businessId}`]?.driver_tip_rate === driverTipRate) {
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
        state.carts[`businessId:${result.business_id}`] = result
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
   * Place cart
   */
  const placeCart = async (cardId, data) => {
    try {
      setState({ ...state, loading: true })
      const countryCode = await strategy.getItem('country-code')
      const customerFromLocalStorage = await strategy.getItem('user-customer', true)
      const userCustomerId = customerFromLocalStorage?.id
      const body = {
        ...data,
        user_id: userCustomerId || session.user.id
      }
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
          state.carts[`businessId:${result.business_id}`] = result
          events.emit('cart_updated', result)
        } else {
          delete state.carts[`businessId:${result.business_id}`]
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
        },
        body: JSON.stringify(body)
      }

      const response = await fetch(`${ordering.root}/cart_groups/${cartUuid}/place`, requestOptions)
      const { error, result } = await response.json()
      if (!error) {
        result.carts.forEach(cart => {
          delete state.carts[`businessId:${cart.business_id}`]
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
      setState({ ...state, loading: true })
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
      if (!error) {
        if (result.status !== 1) {
          state.carts[`businessId:${result.business_id}`] = result
          events.emit('cart_updated', result)
        } else {
          delete state.carts[`businessId:${result.business_id}`]
        }
      } else if (cart) {
        state.carts[`businessId:${cart.business_id}`] = cart
        events.emit('cart_updated', cart)
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
            state.carts[`businessId:${cart.business_id}`] = result.carts.find(_cart => _cart?.business_id === cart?.business_id)
            events.emit('cart_updated', result)
          } else {
            delete state.carts[`businessId:${cart.business_id}`]
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
        state.carts[`businessId:${result.business_id}`] = result
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
    if (fromWorker && !isDisabledDefaultOpts && optionsLocalStorage && optionsLocalStorage.type !== resolvedType) {
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
    setState({ ...state, ...values })
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
    if (session.loading || languageState.loading || !ordering?.project) return
    if (session.auth) {
      setState(prevState => (prevState.loading ? prevState : { ...prevState, loading: true }))
      refreshOrderOptions()
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
      const validDefaultValue = configTypes.includes(configState?.configs?.default_order_type?.type)
      updateOrderOptions(validDefaultValue ? { type: configState?.configs?.default_order_type?.type } : { type: configTypes[0] })
      if (!session.auth && !state?.loading) {
        changeType(validDefaultValue ? configState?.configs?.default_order_type?.type : configTypes[0])
      }
      if (!session.auth) {
        changeType(validDefaultValue ? configState?.configs?.default_order_type?.type : configTypes[0])
      }
    }
  }, [configTypes?.length, state.options.type])

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

      const newCarts = {}
      carts.forEach(cart => {
        const cartFound = state.carts[`businessId:${cart.business_id}`]
        newCarts[`businessId:${cart.business_id}`] = cartFound && dayjs(cartFound?.updated_at).isAfter(dayjs(cart?.updated_at))
          ? cartFound
          : cart
      })
      setState((prevState) => {
        const newState = {
          ...prevState,
          options: {
            ...prevState.options,
            ...options
          },
          carts: {
            ...prevState.carts,
            ...newCarts
          }
        }
        return newState
      })
    }
    socket.on('carts_update', handleCartUpdate)
    socket.on('order_options_update', handleOrderOptionUpdate)
    return () => {
      socket.off('carts_update', handleCartUpdate)
      socket.off('order_options_update', handleOrderOptionUpdate)
    }
  }, [state.carts, state.options, state.loading, socket])

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
    changeAddress,
    changeType,
    changeMoment,
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
    getLastOrderHasNoReview,
    changeCityFilter,
    clearOrderAddress,
    confirmMultiCarts,
    addMultiProduct,
    setStateInitialValues,
    handleOrderStateLoading,
    createReservation,
    handleLogEvent,
    clearTimeout
  }

  const copyState = JSON.parse(JSON.stringify(state))

  return (
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
  )
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
    clearOrderAddress: warningMessage
  }
  return orderManager || [{}, functionsPlaceholders]
}
