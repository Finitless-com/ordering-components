import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useApi } from '../../contexts/ApiContext'
import { useSession } from '../../contexts/SessionContext'
import { useWebsocket } from '../../contexts/WebsocketContext'

export const PayoutList = (props) => {
  const {
    UIComponent,
    defaultStatus = null,
    statusAttribute = 'driver_status',
    paginationSettings
  } = props

  const [ordering] = useApi()
  const socket = useWebsocket()
  const [{ token }] = useSession()

  const pageSize = paginationSettings?.pageSize ?? 10

  const [payoutList, setPayoutList] = useState({ payouts: [], loading: true, error: null })
  const [pagination, setPagination] = useState({ currentPage: 0, pageSize, totalPages: null, total: null })
  const [statusSelected, setStatusSelected] = useState(defaultStatus)
  // Only the last request may update the list: a slow page of a previous status must not land on the current one
  const lastRequest = useRef(0)

  /**
   * Method to get a page of payouts from API. The API scopes the list to whoever asks
   * @param {number} page page to get, the first one replaces the list and the next ones are appended
   * @param {string|null} status status to filter by, null to get all
   */
  const getPayouts = async (page, status) => {
    const request = ++lastRequest.current
    try {
      setPayoutList(prevState => ({ ...prevState, loading: true }))
      const where = status
        ? `&where=${encodeURIComponent(JSON.stringify([{ attribute: statusAttribute, value: status }]))}`
        : ''
      const response = await fetch(`${ordering.root}/payouts?page=${page}&page_size=${pageSize}${where}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-App-X': ordering.appId,
          'X-INTERNAL-PRODUCT-X': ordering.appInternalName,
          'X-Socket-Id-X': socket?.getId()
        }
      })
      const { result, error, pagination: pageConfig } = await response.json()
      if (request !== lastRequest.current) return
      if (!error) {
        setPayoutList(prevState => ({
          payouts: page === 1 ? result : [...prevState.payouts, ...result],
          loading: false,
          error: null
        }))
        setPagination({
          currentPage: pageConfig?.current_page ?? page,
          pageSize,
          totalPages: pageConfig?.total_pages ?? null,
          total: pageConfig?.total ?? null
        })
      } else {
        setPayoutList(prevState => ({ ...prevState, loading: false, error: result }))
      }
    } catch (err) {
      if (request !== lastRequest.current) return
      setPayoutList(prevState => ({ ...prevState, loading: false, error: [err.message] }))
    }
  }

  /**
   * Method to get the next page of payouts
   */
  const loadMorePayouts = () => {
    if (payoutList.loading || !pagination.totalPages || pagination.currentPage >= pagination.totalPages) return
    getPayouts(pagination.currentPage + 1, statusSelected)
  }

  /**
   * Method to filter the payouts by status
   * @param {string|null} status status to filter by, null to get all
   */
  const handleChangeStatus = (status) => {
    if (status === statusSelected) return
    setStatusSelected(status)
    setPayoutList({ payouts: [], loading: true, error: null })
    getPayouts(1, status)
  }

  /**
   * Method to reload the payouts from the first page
   */
  const handleRefreshPayouts = () => {
    getPayouts(1, statusSelected)
  }

  useEffect(() => {
    getPayouts(1, statusSelected)
  }, [])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          payoutList={payoutList}
          pagination={pagination}
          statusSelected={statusSelected}
          loadMorePayouts={loadMorePayouts}
          handleChangeStatus={handleChangeStatus}
          handleRefreshPayouts={handleRefreshPayouts}
        />
      )}
    </>
  )
}

PayoutList.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
   * Status the list is filtered by when it loads, all by default
   */
  defaultStatus: PropTypes.string,
  /**
   * Attribute the status filter applies to: who asks reads a different part of the payout
   */
  statusAttribute: PropTypes.string,
  /**
   * Pagination settings
   * You can set the pageSize
   */
  paginationSettings: PropTypes.shape({
    pageSize: PropTypes.number
  })
}
