import React, { useEffect, useState, useRef } from 'react'
import PropTypes from 'prop-types'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { useApi } from '../../contexts/ApiContext'
import { useOrder } from '../../contexts/OrderContext'
import { useSession } from '../../contexts/SessionContext'
import { useOrderingTheme } from '../../contexts/OrderingThemeContext'
import { useWebsocket } from '../../contexts/WebsocketContext'

dayjs.extend(utc)

export const BusinessSearchList = (props) => {
  props = { ...defaultProps, ...props }
  const {
    UIComponent,
    paginationSettings,
    lazySearch,
    defaultTerm,
    defaultLocation,
    brandId,
    isIos
  } = props

  const [businessesSearchList, setBusinessesSearchList] = useState({ businesses: [], loading: true, error: null, lengthError: true })
  /**
   * brandList, this must be contain a brands, loading and error to send UIComponent
   */
  const [brandList, setBrandList] = useState({ loading: true, brands: [], error: null })
  const [paginationProps, setPaginationProps] = useState({
    currentPage: 1,
    pageSize: paginationSettings.pageSize ?? 10,
    totalItems: null,
    totalPages: null
  })
  const [orderState] = useOrder()
  const [ordering] = useApi()
  const socket = useWebsocket()
  const [{ token }] = useSession()
  const [orderingTheme] = useOrderingTheme()

  const [filters, setFilters] = useState({
    business_types: [],
    orderBy: 'distance',
    franchise_ids: [],
    price_level: null
  })
  const [termValue, setTermValue] = useState(defaultTerm || '')
  const [citiesState, setCitiesState] = useState({ loading: false, cities: [], error: null })
  const showCities = !orderingTheme?.theme?.business_listing_view?.components?.cities?.hidden
  const prevLocationKeyRef = useRef(null)
  const abortControllerRef = useRef(null)
  const searchDebounceRef = useRef(null)

  const isValidMoment = (date, format) => dayjs.utc(date, format).format(format) === date

  useEffect(() => {
    const location = orderState?.options?.address?.location
    const locationKey = location?.lat != null && location?.lng != null
      ? `${location.lat},${location.lng}`
      : null

    if (prevLocationKeyRef.current != null && prevLocationKeyRef.current !== locationKey && filters.business_types?.length) {
      setFilters((prev) => ({ ...prev, business_types: [] }))
    }
    prevLocationKeyRef.current = locationKey
  }, [orderState?.options?.address?.location?.lat, orderState?.options?.address?.location?.lng])

  useEffect(() => {
    if (lazySearch) return
    if (!(Object.keys(orderState?.options?.address?.location || {})?.length > 0 || defaultLocation)) return

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      handleSearchbusinessAndProducts(true)
    }, 250)

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [filters, JSON.stringify(orderState?.options)])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const handleChangeTermValue = (val) => {
    const returnAllProductsValidation = (val?.length < 3 && termValue?.length >= 3) || val === ''
    setTermValue(val)
    if (returnAllProductsValidation || val?.length >= 3) {
      const valueLoweredCase = val.toLowerCase()
      handleSearchbusinessAndProducts(true, {}, valueLoweredCase)
    }
  }

  const cityId = orderState?.options?.city_id

  const handleChangeFilters = (filterName, filterValue) => {
    if (filterName === 'orderBy') {
      const ascdesc = filterValue === filters?.orderBy ? filterValue.includes('-') ? filterValue : `-${filterValue}` : filterValue
      setFilters({
        ...filters,
        orderBy: ascdesc
      })
    } else {
      setFilters({
        ...filters,
        [filterName]: filterValue
      })
    }
  }

  /**
   * Method to update business list
   * @param {number} businessId business id
   * @param {object} changes business info
   */
  const handleUpdateBusinessList = (businessId, changes) => {
    const updatedBusinesses = businessesSearchList?.businesses.map(business => {
      if (business?.id === businessId) {
        return {
          ...business,
          ...changes
        }
      }
      return business
    })
    setBusinessesSearchList({
      ...businessesSearchList,
      businesses: updatedBusinesses?.filter(_business => cityId ? _business?.city_id === cityId : _business)
    })
  }

  /**
   * Method to update business list
   * @param {number} productId product id
   * @param {number} categoryId category id
   * @param {number} businessId business id
   * @param {object} changes product info
   */
  const handleUpdateProducts = (productId, categoryId, businessId, changes) => {
    const updatedBusinesses = businessesSearchList?.businesses.map(business => {
      if (business?.id === businessId) {
        const updatedCategories = business?.categories.map(category => {
          if (category?.id === categoryId) {
            const updateProducts = category?.products.map(product => {
              if (product?.id === productId) {
                return {
                  ...product,
                  ...changes
                }
              }
              return product
            })
            return {
              ...category,
              products: updateProducts
            }
          }
          return category
        })
        return {
          ...business,
          categories: updatedCategories
        }
      }
      return business
    })
    setBusinessesSearchList({
      ...businessesSearchList,
      businesses: updatedBusinesses?.filter(_business => cityId ? _business?.city_id === cityId : _business)
    })
  }

  const handleSearchbusinessAndProducts = async (newFetch, options, val) => {
    try {
      const effectiveTerm = val ?? termValue
      const hasSearchTerm = effectiveTerm?.length >= 3
      let filtParams = hasSearchTerm
        ? `&term=${isIos ? effectiveTerm : encodeURI(effectiveTerm)}`
        : '&excludes=categories'
      Object.keys(filters).map(key => {
        if ((!filters[key] && filters[key] !== 0) || filters[key] === 'default' || filters[key]?.length === 0) return
        Array.isArray(filters[key]) ? filtParams = filtParams + `&${key}=[${filters[key]}]` : filtParams = filtParams + `&${key}=${filters[key]}`
      })
      filtParams = filtParams + (orderOptionsRef.current?.type === 1 && defaultLocation ? '&max_distance=20000' : '')
      if (currentOrderOptions?.moment && isValidMoment(currentOrderOptions?.moment, 'YYYY-MM-DD HH:mm:ss')) {
        filtParams = filtParams + `&timestamp=${dayjs.utc(currentOrderOptions?.moment, 'YYYY-MM-DD HH:mm:ss').local().unix()}`
      }
      filtParams = filtParams + `&page=${newFetch ? 1 : paginationProps.currentPage + 1}&page_size=${paginationProps.pageSize}`
      brandId && (filtParams = filtParams + `&franchise_ids=[${brandId}]`)
      let where = ''
      if (cityId) {
        where = {
          conditions: [{
            attribute: 'city_id',
            value: cityId
          }],
          conector: 'AND'
        }
        where = `&where=${JSON.stringify(where)}`
      }
      setBusinessesSearchList((prevProps) => ({
        ...prevProps,
        businesses: newFetch ? [] : prevProps.businesses,
        loading: true,
        lengthError: false
      }))
      const requestOptions = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        }
      }
      const location = { lat: orderState.options?.address?.location?.lat || defaultLocation?.lat, lng: orderState.options?.address?.location?.lng || defaultLocation?.lng }

      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      const response = await fetch(`${ordering.root}/search?order_type_id=${orderState?.options?.type}${filtParams}&location=${JSON.stringify(options?.location || location)}${where}`, {
        ...requestOptions,
        signal: controller.signal
      })
      const { result, error, pagination } = await response.json()
      if (error) {
        setBusinessesSearchList(() => ({
          businesses: [],
          loading: false,
          error: result,
          lengthError: false
        }))
        return
      }
      let nextPageItems = 0
      if (pagination.current_page !== pagination.total_pages) {
        const remainingItems = pagination.total - result.length
        nextPageItems = remainingItems < pagination.page_size ? remainingItems : pagination.page_size
      }
      setPaginationProps((prevProps) => ({
        ...prevProps,
        currentPage: pagination.current_page,
        totalPages: pagination.total_pages,
        totalItems: pagination.total,
        nextPageItems
      }))
      setBusinessesSearchList((prevProps) => ({
        ...prevProps,
        businesses: cityId ? (newFetch ? result : [...prevProps?.businesses, ...result])?.filter(_business => _business?.city_id === cityId) : newFetch ? result : [...prevProps?.businesses, ...result],
        loading: false,
        lengthError: false
      }))
    } catch (err) {
      if (err?.name === 'AbortError') return
      setBusinessesSearchList(() => ({
        businesses: [],
        loading: false,
        error: err.message,
        lengthError: false
      }))
    }
  }

  /**
  * Function to get brand list from API
  */
  const getBrandList = async () => {
    try {
      setBrandList({ ...brandList, loading: true })

      const requestOptions = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        }
      }

      const response = await fetch(`${ordering.root}/franchises`, requestOptions)
      const content = await response.json()

      if (!content.error) {
        setBrandList({
          ...brandList,
          loading: false,
          brands: content?.result,
          error: null
        })
      } else {
        setBrandList({
          ...brandList,
          loading: false,
          error: content?.result
        })
      }
    } catch (error) {
      setBrandList({
        ...brandList,
        loading: false,
        error: error.message
      })
    }
  }

  const getCities = async () => {
    const requestOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-App-X': ordering.appId,
        'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
        'X-Socket-Id-X': socket?.getId()
      }
    }
    setCitiesState({ ...citiesState, loading: true })
    const response = await fetch(`${ordering.root}/countries`, requestOptions)
    const { result, error, pagination } = await response.json()

    if (!error) {
      setCitiesState({
        ...citiesState,
        loading: false,
        cities: result?.map(country => country?.cities).flat(),
        pagination
      })
    }
  }

  useEffect(() => {
    getBrandList()
  }, [])

  useEffect(() => {
    if (showCities) {
      getCities()
    }
  }, [showCities])

  return (
    <>
      {
        UIComponent && (
          <UIComponent
            {...props}
            paginationProps={paginationProps}
            businessesSearchList={businessesSearchList}
            handleChangeFilters={handleChangeFilters}
            filters={filters}
            termValue={termValue}
            handleSearchbusinessAndProducts={handleSearchbusinessAndProducts}
            handleChangeTermValue={handleChangeTermValue}
            setFilters={setFilters}
            brandList={brandList}
            handleUpdateBusinessList={handleUpdateBusinessList}
            handleUpdateProducts={handleUpdateProducts}
            citiesState={citiesState}
          />
        )
      }
    </>
  )
}

BusinessSearchList.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType
}

const defaultProps = {
  paginationSettings: { initialPage: 1, pageSize: 25, controlType: 'infinity' },
  propsToFetch: ['id', 'name', 'header', 'logo', 'location', 'schedule', 'open', 'ribbon', 'delivery_price', 'distance', 'delivery_time', 'pickup_time', 'reviews', 'featured', 'offers', 'food', 'laundry', 'alcohol', 'groceries', 'slug', 'city', 'city_id']
}
