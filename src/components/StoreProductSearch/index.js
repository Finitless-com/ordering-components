import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useApi } from '../../contexts/ApiContext'
import { useSession } from '../../contexts/SessionContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  BULK_UPDATE_LIMIT,
  MAX_PAGE_SIZE,
  buildProductsWhere,
  isProductUnavailable
} from './utils'

const defaultAttributes = ['id', 'name', 'price', 'images', 'enabled', 'snooze_until', 'category_id', 'category']

const getErrorMessage = (result, fallback) => {
  if (Array.isArray(result)) return result[0] || fallback
  if (typeof result === 'string') return result
  return fallback
}

const emptyProducts = (pageSize) => ({
  products: [],
  loading: true,
  loadingMore: false,
  error: null,
  pagination: { currentPage: 0, pageSize, totalItems: null, totalPages: null }
})

/**
 * Lists the products of a business across all its categories, with a text search, an "unavailable"
 * filter (turned off or paused), paging and totals, and updates them: one product, or all the
 * unavailable ones at once.
 *
 * API: GET /business/{id}/products?version=v2&mode=dashboard (levels 0 and 2; a business owner sees
 * only the businesses he owns), POST /business/{id}/categories/{category}/products/{product} and
 * PUT /bulks/products.
 */
export const StoreProductSearch = (props) => {
  props = { ...defaultProps, ...props }
  const {
    UIComponent,
    businessId,
    isIos,
    pageSize: pageSizeProp,
    orderBy,
    attributes,
    isSearchByName,
    isSearchByDescription,
    searchDelay,
    useBulkUpdate,
    initialSearch,
    initialUnavailableOnly
  } = props

  const [ordering] = useApi()
  const [{ token }] = useSession()
  const [, t] = useLanguage()

  const pageSize = Math.min(Math.max(parseInt(pageSizeProp, 10) || 15, 1), MAX_PAGE_SIZE)
  const listAttributes = attributes?.length ? attributes : defaultAttributes

  const [search, setSearch] = useState(initialSearch ?? '')
  const [unavailableOnly, setUnavailableOnly] = useState(!!initialUnavailableOnly)
  const [productsState, setProductsState] = useState(() => emptyProducts(pageSize))
  const [unavailableState, setUnavailableState] = useState({ total: null, loading: false, error: null })
  const [updatingProductIds, setUpdatingProductIds] = useState([])
  const [actionError, setActionError] = useState(null)
  const [makeAvailableState, setMakeAvailableState] = useState({ loading: false, total: 0, done: 0, failed: 0, error: null })

  const listRequestRef = useRef(0)
  const countRequestRef = useRef(0)
  const updatingRef = useRef(new Set())
  const makingAvailableRef = useRef(false)
  const productsRef = useRef(productsState)
  productsRef.current = productsState

  const whereOptions = { isIos, searchByName: isSearchByName, searchByDescription: isSearchByDescription }

  const requestProducts = ({ page, size, where, attrs }) => ordering.get(
    `/business/${businessId}/products`,
    {
      json: true,
      mode: 'dashboard',
      accessToken: token,
      attributes: attrs || listAttributes,
      conditions: where || undefined,
      query: { version: 'v2', page, page_size: size, ...(orderBy ? { orderBy } : {}) }
    }
  )

  /**
   * Loads a page of the list with the current search and filter. `newFetch` restarts from the first page,
   * otherwise it adds the next page. A late answer of an older request is ignored.
   */
  const getProducts = async (newFetch = true) => {
    if (!businessId) return
    const current = productsRef.current
    const page = newFetch ? 1 : (current.pagination.currentPage || 0) + 1
    if (!newFetch && (current.loading || current.loadingMore || page > (current.pagination.totalPages ?? 0))) return
    const requestId = ++listRequestRef.current
    setProductsState(prev => newFetch
      ? { ...prev, products: [], loading: true, loadingMore: false, error: null }
      : { ...prev, loadingMore: true, error: null })
    try {
      const where = buildProductsWhere({ search, unavailableOnly, ...whereOptions })
      const { content: { error, result, pagination } } = await requestProducts({ page, size: pageSize, where })
      if (requestId !== listRequestRef.current) return
      if (error) {
        setProductsState(prev => ({ ...prev, loading: false, loadingMore: false, error: Array.isArray(result) ? result : [getErrorMessage(result, t('ERROR', 'Error'))] }))
        return
      }
      const received = Array.isArray(result) ? result : []
      setProductsState(prev => {
        const known = new Set(newFetch ? [] : prev.products.map(product => product.id))
        return {
          products: newFetch ? received : [...prev.products, ...received.filter(product => !known.has(product.id))],
          loading: false,
          loadingMore: false,
          error: null,
          pagination: {
            currentPage: pagination?.current_page ?? page,
            pageSize: pagination?.page_size ?? pageSize,
            totalItems: pagination?.total ?? received.length,
            totalPages: pagination?.total_pages ?? 1
          }
        }
      })
    } catch (err) {
      if (requestId !== listRequestRef.current) return
      setProductsState(prev => ({ ...prev, loading: false, loadingMore: false, error: [err?.message || t('NETWORK_ERROR', 'Network Error')] }))
    }
  }

  /**
   * Counts the unavailable products of the business (the banner and the filter chip): the `total` of a
   * page of one product, without the text search.
   */
  const getUnavailableCount = async () => {
    if (!businessId) return
    const requestId = ++countRequestRef.current
    setUnavailableState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const where = buildProductsWhere({ unavailableOnly: true, ...whereOptions })
      const { content: { error, result, pagination } } = await requestProducts({ page: 1, size: 1, where, attrs: ['id'] })
      if (requestId !== countRequestRef.current) return
      if (error) {
        setUnavailableState({ total: null, loading: false, error: Array.isArray(result) ? result : [getErrorMessage(result, t('ERROR', 'Error'))] })
        return
      }
      setUnavailableState({ total: pagination?.total ?? (Array.isArray(result) ? result.length : 0), loading: false, error: null })
    } catch (err) {
      if (requestId !== countRequestRef.current) return
      setUnavailableState({ total: null, loading: false, error: [err?.message || t('NETWORK_ERROR', 'Network Error')] })
    }
  }

  const reloadProducts = () => Promise.all([getProducts(true), getUnavailableCount()])

  const loadMoreProducts = () => getProducts(false)

  const productPath = (categoryId, productId) => `/business/${businessId}/categories/${categoryId}/products/${productId}`

  /**
   * Saves changes of one product (`{ enabled }`, `{ snooze_until: 'Y-m-d H:i:s' }` in UTC, or `{ enabled: true, snooze_until: '' }`
   * to turn it on). Resolves with the updated product, or null if it failed (the reason is in `actionError`).
   * @param {object} product a product of the list (needs `id` and `category_id`)
   * @param {object} changes fields to save
   */
  const handleUpdateProduct = async (product, changes = {}) => {
    const productId = product?.id
    const categoryId = product?.category_id
    if (!productId || !categoryId || updatingRef.current.has(productId)) return null
    updatingRef.current.add(productId)
    setUpdatingProductIds(prev => [...prev, productId])
    setActionError(null)
    try {
      const { content: { error, result } } = await ordering.post(productPath(categoryId, productId), changes, { json: true, accessToken: token })
      if (error) {
        setActionError(Array.isArray(result) ? result : [getErrorMessage(result, t('ERROR', 'Error'))])
        return null
      }
      const updated = { ...product, ...changes, ...(result && typeof result === 'object' && !Array.isArray(result) ? result : {}) }
      if (changes.snooze_until === '') updated.snooze_until = result?.snooze_until ?? null
      const stillListed = !unavailableOnly || isProductUnavailable(updated)
      setProductsState(prev => ({
        ...prev,
        products: stillListed
          ? prev.products.map(item => item.id === productId ? { ...item, ...updated } : item)
          : prev.products.filter(item => item.id !== productId),
        pagination: stillListed || prev.pagination.totalItems === null
          ? prev.pagination
          : { ...prev.pagination, totalItems: Math.max(prev.pagination.totalItems - 1, 0) }
      }))
      getUnavailableCount()
      return updated
    } catch (err) {
      setActionError([err?.message || t('NETWORK_ERROR', 'Network Error')])
      return null
    } finally {
      updatingRef.current.delete(productId)
      setUpdatingProductIds(prev => prev.filter(id => id !== productId))
    }
  }

  /** Every product the current search and the unavailable filter match (all pages), as `{ id, category_id }`. */
  const getAllUnavailableProducts = async () => {
    const where = buildProductsWhere({ search, unavailableOnly: true, ...whereOptions })
    const found = []
    let page = 1
    let totalPages = 1
    do {
      const { content: { error, result, pagination } } = await requestProducts({ page, size: MAX_PAGE_SIZE, where, attrs: ['id', 'category_id'] })
      if (error) throw new Error(getErrorMessage(result, t('ERROR', 'Error')))
      found.push(...(Array.isArray(result) ? result : []))
      totalPages = pagination?.total_pages ?? 1
      page++
    } while (page <= totalPages)
    return found
  }

  /**
   * Turns on every unavailable product that matches the current search (and clears its pause). One PUT /bulks/products
   * per 500 products (only `useBulkUpdate` false, or a refused chunk, does one request per product). Resolves with
   * `{ total, done, failed }`; the list and the count are reloaded at the end.
   */
  const handleMakeAllAvailable = async () => {
    if (!businessId || makingAvailableRef.current) return null
    makingAvailableRef.current = true
    setActionError(null)
    setMakeAvailableState({ loading: true, total: 0, done: 0, failed: 0, error: null })
    let total = 0
    let done = 0
    let failed = 0
    try {
      const targets = await getAllUnavailableProducts()
      total = targets.length
      setMakeAvailableState(prev => ({ ...prev, total }))
      const changes = { enabled: true, snooze_until: '' }
      const updateOne = async (product) => {
        try {
          const { content: { error } } = await ordering.post(productPath(product.category_id, product.id), changes, { json: true, accessToken: token })
          return !error
        } catch {
          return false
        }
      }
      for (let start = 0; start < total; start += BULK_UPDATE_LIMIT) {
        const chunk = targets.slice(start, start + BULK_UPDATE_LIMIT)
        let bulkDone = false
        if (useBulkUpdate) {
          try {
            const { content: { error } } = await ordering.put(
              '/bulks/products',
              { products: chunk.map(product => ({ id: product.id, category_id: product.category_id, business_id: Number(businessId), ...changes })) },
              { json: true, accessToken: token }
            )
            bulkDone = !error
          } catch {
            bulkDone = false
          }
        }
        if (bulkDone) {
          done += chunk.length
        } else {
          for (const product of chunk) {
            if (await updateOne(product)) done++
            else failed++
            setMakeAvailableState(prev => ({ ...prev, done, failed }))
          }
        }
        setMakeAvailableState(prev => ({ ...prev, done, failed }))
      }
      setMakeAvailableState({ loading: false, total, done, failed, error: null })
    } catch (err) {
      setMakeAvailableState({ loading: false, total, done, failed, error: [err?.message || t('NETWORK_ERROR', 'Network Error')] })
    } finally {
      makingAvailableRef.current = false
    }
    await reloadProducts()
    return { total, done, failed }
  }

  useEffect(() => {
    if (!businessId) return
    const delay = Number(searchDelay) || 0
    if (!delay) {
      getProducts(true)
      return
    }
    const timeout = setTimeout(() => getProducts(true), delay)
    return () => clearTimeout(timeout)
  }, [businessId, search, unavailableOnly])

  useEffect(() => {
    getUnavailableCount()
  }, [businessId])

  useEffect(() => () => {
    listRequestRef.current++
    countRequestRef.current++
  }, [])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          productsState={productsState}
          search={search}
          handleChangeSearch={setSearch}
          unavailableOnly={unavailableOnly}
          handleChangeUnavailableOnly={setUnavailableOnly}
          unavailableState={unavailableState}
          loadMoreProducts={loadMoreProducts}
          reloadProducts={reloadProducts}
          updatingProductIds={updatingProductIds}
          handleUpdateProduct={handleUpdateProduct}
          handleMakeAllAvailable={handleMakeAllAvailable}
          makeAvailableState={makeAvailableState}
          actionError={actionError}
          clearActionError={() => setActionError(null)}
          isProductUnavailable={isProductUnavailable}
        />
      )}
    </>
  )
}

StoreProductSearch.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
   * Business whose products are listed
   */
  businessId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  /**
   * iOS sends the search text as it is, the other platforms `encodeURI` it
   */
  isIos: PropTypes.bool,
  /**
   * Products per page (1 to 50, the API's maximum)
   */
  pageSize: PropTypes.number,
  /**
   * Optional `orderBy` of the API (e.g. `name`, `-rank`); the API default (id) if omitted
   */
  orderBy: PropTypes.string,
  /**
   * Fields asked to the API (`params`); a short list by default, the API sends everything (extras included) if it is left empty
   */
  attributes: PropTypes.arrayOf(PropTypes.string),
  /**
   * Search in the name / in the description
   */
  isSearchByName: PropTypes.bool,
  isSearchByDescription: PropTypes.bool,
  /**
   * Milliseconds to wait after the last change of the search text before asking the API (0: no wait)
   */
  searchDelay: PropTypes.number,
  /**
   * Make all available with PUT /bulks/products (true) or one request per product (false)
   */
  useBulkUpdate: PropTypes.bool,
  initialSearch: PropTypes.string,
  initialUnavailableOnly: PropTypes.bool
}

const defaultProps = {
  isSearchByName: true,
  isSearchByDescription: true,
  searchDelay: 300,
  useBulkUpdate: true
}
