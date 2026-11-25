import React, { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { useApi } from '../../contexts/ApiContext'
import { useOrder } from '../../contexts/OrderContext'
import { useConfig } from '../../contexts/ConfigContext'
import { resolveUnaddressedOrderTypes } from '../../utils/orderTypeAddress'
dayjs.extend(utc)

export const BusinessSimpleList = (props) => {
  props = { ...defaultProps, ...props }
  const {
    UIComponent,
    paginationSettings,
    propsToFetch,
    franchiseId,
    actualSlug
  } = props

  const [orderState] = useOrder()
  const [ordering] = useApi()
  const [{ configs }] = useConfig()

  const [orderType, setOrderType] = useState(props.orderType)
  const [businessesList, setBusinessesList] = useState({ businesses: [], loading: false, error: null })
  const [requestsState, setRequestsState] = useState({})
  const [searchValue, setSearchValue] = useState('')
  const [paginationProps, setPaginationProps] = useState({
    currentPage: (paginationSettings.controlType === 'pages' && paginationSettings.initialPage && paginationSettings.initialPage >= 1) ? paginationSettings.initialPage - 1 : 0,
    pageSize: paginationSettings.pageSize ?? 10,
    totalItems: null,
    totalPages: null
  })

  const unaddressedTypes = resolveUnaddressedOrderTypes(configs?.unaddressed_order_types_allowed?.value, orderState)
  const isAllowUnaddressOrderType = unaddressedTypes.includes(orderType)

  const isValidMoment = (date, format) => dayjs.utc(date, format).format(format) === date

  /**
   * Get businesses by params, order options and filters
   * @param {boolean} newFetch Make a new request or next page
   */
  const getBusinesses = async () => {
    if (businessesList.loading) return

    try {
      setBusinessesList({ ...businessesList, loading: true })
      const defaultLatitude = Number(configs?.location_default_latitude?.value)
      const defaultLongitude = Number(configs?.location_default_longitude?.value)
      const isInvalidDefaultLocation = isNaN(defaultLatitude) || isNaN(defaultLongitude)
      const defaultLocation = isInvalidDefaultLocation ? null : { lat: defaultLatitude, lng: defaultLongitude }
      const location = orderState?.options?.address?.location || defaultLocation

      let where = null
      const conditions = []
      const locationParam = (isAllowUnaddressOrderType && !orderState.options?.address?.location)
        ? location
        : (orderState.options?.address?.location
            ? { lat: orderState.options.address.location.lat, lng: orderState.options.address.location.lng }
            : null)
      const parameters = {
        page: 1,
        page_size: paginationProps.pageSize,
        order_type_id: orderType ?? orderState?.options?.type
      }

      if (orderState.options?.moment && isValidMoment(orderState.options?.moment, 'YYYY-MM-DD HH:mm:ss')) {
        const moment = dayjs.utc(orderState.options?.moment, 'YYYY-MM-DD HH:mm:ss').local().unix()
        parameters.timestamp = moment
      }

      if (franchiseId) {
        conditions.push({ attribute: 'franchise_id', value: franchiseId })
      }

      if (conditions.length) {
        where = {
          conditions,
          conector: 'AND'
        }
      }

      const controller = new AbortController()
      requestsState.businesses = controller
      setRequestsState({ ...requestsState })

      const qs = new URLSearchParams()
      Object.entries(parameters).forEach(([k, v]) => { if (v !== undefined && v !== null) qs.set(k, v) })
      if (locationParam) qs.set('location', JSON.stringify(locationParam))
      if (Array.isArray(propsToFetch) && propsToFetch.length) qs.set('params', propsToFetch.join(','))
      else if (typeof propsToFetch === 'string' && propsToFetch) qs.set('params', propsToFetch)
      if (where) qs.set('where', JSON.stringify(where))

      const response = await fetch(`${ordering.root}/businesses?${qs.toString()}`, { signal: controller.signal })
      const { error, result, pagination } = await response.json()

      if (!error) {
        let nextPageItems = 0
        if (pagination?.current_page !== pagination?.total_pages) {
          const remainingItems = pagination.total - businessesList.businesses.length
          nextPageItems = remainingItems < pagination.page_size ? remainingItems : pagination.page_size
        }
        setPaginationProps({
          ...paginationProps,
          currentPage: pagination?.current_page,
          totalPages: pagination?.total_pages,
          totalItems: pagination?.total,
          nextPageItems
        })

        if (actualSlug && result?.length) {
          const fromIndex = result.findIndex(business => business.slug === actualSlug)
          const toIndex = 0
          if (fromIndex !== toIndex) {
            const element = result.splice(fromIndex, 1)[0]
            result.splice(toIndex, 0, element)
          }
        }
      }

      setBusinessesList({
        ...businessesList,
        loading: false,
        error: error ? typeof result === 'string' ? result : result[0] : null,
        businesses: error ? [] : result
      })
    } catch (err) {
      if (err?.name !== 'AbortError' && err?.constructor?.name !== 'Cancel') {
        setBusinessesList({
          ...businessesList,
          loading: false,
          error: err?.message
        })
      }
    }
  }

  /**
 * Change text to search
 * @param {string} search Search value
 */
  const handleChangeSearch = (search) => {
    if (search !== undefined) {
      setSearchValue(search)
    }
  }

  useEffect(() => {
    setOrderType(props.orderType)
  }, [props.orderType])

  useEffect(() => {
    getBusinesses()
  }, [
    orderType,
    orderState.options?.moment,
    orderState.options?.address_id
  ])

  return (
    UIComponent && (
      <UIComponent
        {...props}
        setOrderType={setOrderType}
        businessesList={businessesList}
        handleChangeSearch={handleChangeSearch}
        searchValue={searchValue}
      />
    )
  )
}

const defaultProps = {
  paginationSettings: {
    initialPage: 1,
    pageSize: 20,
    controlType: 'infinity'
  },
  propsToFetch: [
    'id',
    'name',
    'description',
    'header',
    'logo',
    'location',
    'schedule',
    'open',
    'delivery_price',
    'distance',
    'ribbon',
    'delivery_time',
    'pickup_time',
    'reviews',
    'featured',
    'offers',
    'food',
    'laundry',
    'alcohol',
    'groceries',
    'slug',
    'address',
    'configs',
    'timezone',
    'today',
    'enabled',
    'disabled_reason',
    'available_drivers_count',
    'activated_orders'
  ]
}
