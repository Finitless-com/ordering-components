import React, { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { useApi } from '../../contexts/ApiContext'
import { useWebsocket } from '../../contexts/WebsocketContext'
import { useOrder } from '../../contexts/OrderContext'
import { useConfig } from '../../contexts/ConfigContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  filterBusinessTypesByLocation,
  normalizeAvailableTypeIds
} from '../../utils/businessTypes'

export const BusinessTypeFilter = (props) => {
  const {
    businessTypes,
    onChangeBusinessType,
    defaultBusinessType,
    hideAllCategory,
    filterByLocation = true,
    availableTypeIds,
    availableLocation,
    UIComponent
  } = props

  const [ordering] = useApi()
  const socket = useWebsocket()
  const [orderState] = useOrder()
  const [{ configs }] = useConfig()
  const [, t] = useLanguage()

  const [typeSelected, setTypeSelected] = useState(defaultBusinessType)
  const [typesState, setTypesState] = useState({ loading: true, error: null, types: [], pagination: null })
  const requestIdRef = useRef(0)

  const handleChangeBusinessType = (businessType) => {
    setTypeSelected(businessType)
    onChangeBusinessType(businessType)
  }

  const getLocationForFilter = () => {
    const location = availableLocation ?? orderState?.options?.address?.location
    if (location?.lat != null && location?.lng != null) {
      return { lat: Number(location.lat), lng: Number(location.lng) }
    }
    const lat = Number(configs?.location_default_latitude?.value)
    const lng = Number(configs?.location_default_longitude?.value)
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng }
    return null
  }

  const getBusinessTypes = async () => {
    const requestId = ++requestIdRef.current
    setTypesState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const qs = new URLSearchParams()
      qs.set('where', JSON.stringify([{ attribute: 'enabled', value: true }]))

      const normalizedIds = normalizeAvailableTypeIds(availableTypeIds)
      const location = filterByLocation && !normalizedIds ? getLocationForFilter() : null
      if (location) {
        qs.set('location', JSON.stringify(location))
        qs.set('order_type_id', orderState?.options?.type ?? 1)
      }

      const response = await fetch(`${ordering.root}/business_types?${qs.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        }
      })
      const { error, result, pagination } = await response.json()
      if (requestId !== requestIdRef.current) return

      if (error) {
        setTypesState((prev) => ({ ...prev, loading: false, error: result }))
        return
      }

      let types = Array.isArray(result) ? [...result] : []
      if (normalizedIds) {
        types = filterBusinessTypesByLocation(types, normalizedIds)
      }
      // Drop dashboard "All" / "All :)" rows — the synthetic chip below is the real All filter.
      const isAllTypeName = (name) => {
        const raw = String(name ?? '').trim()
        if (/^all\b/i.test(raw)) return true
        const key = raw
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '')
          .toUpperCase()
        return key === 'ALL'
      }
      types = types.filter((type) => !isAllTypeName(type?.name))
      if (types.length > 0 && !hideAllCategory) {
        types.unshift({ id: null, enabled: true, image: null, name: t('ALL', 'All') })
      }

      setTypesState({
        loading: false,
        error: null,
        types,
        pagination
      })
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setTypesState((prev) => ({
        ...prev,
        loading: false,
        error: [error?.message || error?.toString()]
      }))
    }
  }

  useEffect(() => {
    if (businessTypes) {
      setTypesState((prev) => ({
        ...prev,
        loading: false,
        types: businessTypes
      }))
      return
    }
    getBusinessTypes()
  }, [
    businessTypes,
    filterByLocation,
    availableTypeIds,
    availableLocation,
    orderState?.options?.address?.location?.lat,
    orderState?.options?.address?.location?.lng,
    orderState?.options?.type
  ])

  useEffect(() => {
    if (typeSelected == null || !typesState.types.length) return
    const isValid = typesState.types.some((type) => type.id === typeSelected)
    if (!isValid) {
      setTypeSelected(null)
      onChangeBusinessType?.(null)
    }
  }, [typesState.types, typeSelected])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          typesState={typesState}
          businessTypes={businessTypes}
          currentTypeSelected={typeSelected}
          handleChangeBusinessType={handleChangeBusinessType}
        />
      )}
    </>
  )
}

BusinessTypeFilter.propTypes = {
  UIComponent: PropTypes.elementType,
  businessTypes: PropTypes.arrayOf(PropTypes.object),
  defaultBusinessType: PropTypes.string,
  filterByLocation: PropTypes.bool,
  availableTypeIds: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.number),
    PropTypes.instanceOf(Set)
  ]),
  availableLocation: PropTypes.shape({
    lat: PropTypes.number,
    lng: PropTypes.number
  })
}
