import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useApi } from '../../contexts/ApiContext'
import { useSession } from '../../contexts/SessionContext'
import { useToast, ToastType } from '../../contexts/ToastContext'
import { useLanguage } from '../../contexts/LanguageContext'

const sortByRank = (list) => [...(list || [])].sort((a, b) => (a?.rank || 0) - (b?.rank || 0))

const toGroups = (extras) => sortByRank(extras).map(({ options, ...extra }) => extra)

const normalizeOptions = (options) => sortByRank(options).map(option => ({
  ...option,
  suboptions: sortByRank(option?.suboptions)
}))

const getErrorMessage = (result, fallback) => {
  if (Array.isArray(result)) return result[0] || fallback
  if (typeof result === 'string') return result
  return fallback
}

const emptyExtraOptions = { options: [], loading: false, error: null, loaded: false }

export const StoreProductOptions = (props) => {
  const { UIComponent, businessId, categoryId, productId } = props

  const [ordering] = useApi()
  const [{ token }] = useSession()
  const [, { showToast }] = useToast()
  const [, t] = useLanguage()

  const [productState, setProductState] = useState({ product: null, extras: [], loading: true, error: null })
  const [extraOptionsState, setExtraOptionsState] = useState({})
  const [updatingState, setUpdatingState] = useState({ options: [], suboptions: [] })
  const requestRef = useRef(null)
  const productKeyRef = useRef(null)
  const extraRequestsRef = useRef({})
  const updatingRef = useRef(new Set())

  const setExtraOptions = (extraId, changes) => {
    setExtraOptionsState(prev => ({
      ...prev,
      [extraId]: { ...emptyExtraOptions, ...prev[extraId], ...changes }
    }))
  }

  const getProduct = async () => {
    requestRef.current?.cancel?.()
    if (!businessId || !categoryId || !productId) {
      requestRef.current = null
      setProductState({ product: null, extras: [], loading: false, error: [t('ERROR', 'Error')] })
      return
    }
    const source = {}
    requestRef.current = source
    extraRequestsRef.current = {}
    setExtraOptionsState({})
    setProductState({ product: null, extras: [], loading: true, error: null })
    try {
      const { content: { error, result } } = await ordering
        .businesses(businessId)
        .categories(categoryId)
        .products(productId)
        .parameters({ version: 'v2' })
        .get({ cancelToken: source, accessToken: token })
      if (requestRef.current !== source) return
      if (error) {
        setProductState({ product: null, extras: [], loading: false, error: [getErrorMessage(result, t('ERROR', 'Error'))] })
        return
      }
      const { extras, ...product } = result || {}
      setProductState({ product, extras: toGroups(extras), loading: false, error: null })
    } catch (err) {
      if (requestRef.current !== source) return
      setProductState({ product: null, extras: [], loading: false, error: [err?.message || t('ERROR', 'Error')] })
    }
  }

  const handleLoadExtraOptions = async (extraId, force = false) => {
    if (!force && extraRequestsRef.current[extraId]) return
    const productKey = productKeyRef.current
    const source = {}
    extraRequestsRef.current[extraId] = source
    setExtraOptions(extraId, { loading: true, error: null })
    try {
      const { content: { error, result } } = await ordering.get(
        `/business/${businessId}/extras/${extraId}/options`,
        { json: true, mode: 'dashboard', accessToken: token }
      )
      if (productKeyRef.current !== productKey || extraRequestsRef.current[extraId] !== source) return
      if (error) {
        delete extraRequestsRef.current[extraId]
        setExtraOptions(extraId, { loading: false, error: [getErrorMessage(result, t('ERROR', 'Error'))] })
        return
      }
      setExtraOptions(extraId, { options: normalizeOptions(result), loading: false, error: null, loaded: true })
    } catch (err) {
      if (productKeyRef.current !== productKey || extraRequestsRef.current[extraId] !== source) return
      delete extraRequestsRef.current[extraId]
      setExtraOptions(extraId, { loading: false, error: [err?.message || t('ERROR', 'Error')] })
    }
  }

  const setUpdating = (type, id, isUpdating) => {
    setUpdatingState(prev => ({
      ...prev,
      [type]: isUpdating ? [...prev[type], id] : prev[type].filter(_id => _id !== id)
    }))
  }

  const updateEntity = async ({ type, id, extraId, path, enabled, applyResult, successMessage }) => {
    const key = `${type}:${id}`
    if (updatingRef.current.has(key)) return
    updatingRef.current.add(key)
    setUpdating(type, id, true)
    const productKey = productKeyRef.current
    try {
      const { content: { error, result } } = await ordering.post(path, { enabled }, { json: true, accessToken: token })
      if (productKeyRef.current !== productKey) return
      if (error) {
        showToast(ToastType.Error, getErrorMessage(result, t('ERROR', 'Error')))
        return
      }
      setExtraOptionsState(prev => prev[extraId]
        ? { ...prev, [extraId]: { ...prev[extraId], options: applyResult(prev[extraId].options, result) } }
        : prev)
      showToast(ToastType.Success, successMessage(result?.enabled ?? enabled))
    } catch (err) {
      if (productKeyRef.current !== productKey) return
      showToast(ToastType.Error, err?.message || t('ERROR', 'Error'))
    } finally {
      updatingRef.current.delete(key)
      setUpdating(type, id, false)
    }
  }

  const handleUpdateOption = (extraId, optionId, enabled) => updateEntity({
    type: 'options',
    id: optionId,
    extraId,
    path: `/business/${businessId}/extras/${extraId}/options/${optionId}`,
    enabled,
    applyResult: (options, result) => options.map(option => option.id !== optionId
      ? option
      : { ...option, enabled: result?.enabled ?? enabled }),
    successMessage: (isEnabled) => isEnabled
      ? t('ENABLED_OPTION', 'Enabled option')
      : t('DISABLED_OPTION', 'Disabled option')
  })

  const handleUpdateSuboption = (extraId, optionId, suboptionId, enabled) => updateEntity({
    type: 'suboptions',
    id: suboptionId,
    extraId,
    path: `/business/${businessId}/extras/${extraId}/options/${optionId}/suboptions/${suboptionId}`,
    enabled,
    applyResult: (options, result) => options.map(option => option.id !== optionId
      ? option
      : {
          ...option,
          suboptions: option.suboptions.map(suboption => suboption.id !== suboptionId
            ? suboption
            : { ...suboption, enabled: result?.enabled ?? enabled })
        }),
    successMessage: (isEnabled) => isEnabled
      ? t('ENABLED_SUBOPTION', 'Enabled suboption')
      : t('DISABLED_SUBOPTION', 'Disabled suboption')
  })

  useEffect(() => {
    productKeyRef.current = `${businessId}:${categoryId}:${productId}`
    getProduct()
    return () => {
      requestRef.current?.cancel?.()
      requestRef.current = null
      productKeyRef.current = null
      extraRequestsRef.current = {}
    }
  }, [businessId, categoryId, productId])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          productState={productState}
          extraOptionsState={extraOptionsState}
          updatingState={updatingState}
          handleLoadExtraOptions={handleLoadExtraOptions}
          handleUpdateOption={handleUpdateOption}
          handleUpdateSuboption={handleUpdateSuboption}
          handleReload={getProduct}
        />
      )}
    </>
  )
}

StoreProductOptions.propTypes = {
  UIComponent: PropTypes.elementType,
  businessId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  categoryId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  productId: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
}
