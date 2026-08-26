import React, { useState, useEffect } from 'react'
import { useOrder } from '../../contexts/OrderContext'
import { useConfig } from '../../contexts/ConfigContext'
import { useApi } from '../../contexts/ApiContext'
import { useSession } from '../../contexts/SessionContext'
import { useToast, ToastType } from '../../contexts/ToastContext'
import dayjs from 'dayjs'
import moment from 'moment'
import { parseReservationSetting } from './parseReservationSetting'

/**
 * Component to manage Checkout page behavior without UI component
 */
export const BusinessReservation = (props) => {
  const {
    UIComponent,
    business,
    cart
  } = props

  const [ordering] = useApi()
  const [{ configs }] = useConfig()

  const [orderState, { createReservation }] = useOrder()
  const [{ user, token }] = useSession()
  const [, { showToast }] = useToast()
  const is12hours = configs?.general_hour_format?.value?.includes('hh:mm')
  const [checkoutFieldsState, setCheckoutFieldsState] = useState({ fields: [], loading: false, error: null })
  const [orderingMethod, setOrderingMethod] = useState(!cart?.products?.length ? 1 : 2)
  const [reservationState, setReservationState] = useState({
    loading: false,
    changes: {
      guests_reservation: cart?.reservation?.guests_reservation || null,
      reserve_date: cart?.reservation?.reserve_date || null
    }
  })
  const [reserveDate, setReserveDate] = useState({
    time: cart?.reservation?.reserve_date ? moment(cart?.reservation?.reserve_date).format('HH:mm') : null,
    date: cart?.reservation?.reserve_date ? moment(cart?.reservation?.reserve_date).format('YYYY-MM-DD') : null
  })
  const [hoursList, setHourList] = useState([])
  const [datesList, setDatesList] = useState([])
  const [isEnabled, setIsEnabled] = useState(true)

  const businessConfig = business?.configs?.find(config => config?.key === 'reservation_setting')
  const reservationSetting = parseReservationSetting(
    businessConfig ? businessConfig?.value : configs?.reservation_setting?.value
  )
  const currentDate = new Date()
  const timeRange = 15
  const getValidationFieldOrderTypes = async () => {
    try {
      setCheckoutFieldsState({ ...checkoutFieldsState, loading: true })

      const requestOptions = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      }
      const response = await fetch(`${ordering.root}/validation_field_order_types`, requestOptions)
      const content = await response.json()
      if (!content?.error) {
        setCheckoutFieldsState({ fields: content?.result, loading: false })
      } else {
        setCheckoutFieldsState({ ...checkoutFieldsState, loading: false, error: content?.result })
      }
    } catch (err) {
      setCheckoutFieldsState({ ...checkoutFieldsState, loading: false, error: [err.message] })
    }
  }

  const handleAddReservation = async (products) => {
    try {
      setReservationState({
        ...reservationState,
        loading: true
      })
      const allowPreorderReservation = orderingMethod === 2 && reservationSetting?.allow_preorder_reservation
      const body = {
        reservation: JSON.stringify(reservationState?.changes),
        business_id: business?.id,
        user_id: user?.id
      }

      if (allowPreorderReservation) {
        body.product = JSON.stringify({
          ...products
        })
      }
      const { error, result } = await createReservation(body)
      if (error) {
        showToast(ToastType.Error, result)
        return
      }
      setReservationState({
        ...reservationState,
        loading: false,
        result
      })
      return result
    } catch (err) {
      showToast(ToastType.Error, err.message)
      setReservationState({
        ...reservationState,
        loading: false
      })
    }
  }

  /**
   * Method to valid if a date is same of after current date
   * @param {String} date
   */
  const validDate = (date) => {
    if (!date) return
    const _date = dayjs(date, 'YYYY-MM-DD HH:mm').isSameOrAfter(dayjs(), 'day')
      ? dayjs(date).format('YYYY-MM-DD HH:mm')
      : dayjs().format('YYYY-MM-DD HH:mm')
    return _date
  }

  /**
   * Method to calculate diferrence between 2 dates
   * @param {moment} start
   * @param {moment} end
   */
  const calculateDiffDay = (start, end) => {
    const endVal = end ?? dayjs()
    const days = dayjs(start).diff(dayjs(endVal), 'day')
    return days
  }

  /**
   * Generate a list of available dates
   */
  const generateDatesList = () => {
    const datesList = []
    const minDate = dayjs().add(reservationSetting?.min_time_reserve_minutes, 'minute')
    const maxDate = dayjs().add(reservationSetting?.max_time_reserve_days, 'day')
    const diff = parseInt(calculateDiffDay(validDate(maxDate)), validDate(minDate))

    for (let i = 0; i < diff + 1; i++) {
      datesList.push(dayjs(validDate(minDate)).add(i, 'd').format('YYYY-MM-DD'))
    }

    if (!reserveDate.date) {
      setReserveDate({
        time: null,
        date: dayjs(validDate(minDate)).format('YYYY-MM-DD')
      })
    }
    setDatesList(datesList)
  }

  /**
   * generate a list of available hours
   */
  const generateHourList = (selectedDate, schedule, is12Hours, options) => {
    const date = options?.preorderLeadTime ? new Date(new Date().getTime() + options?.preorderLeadTime * 60000) : new Date()
    const times = []
    for (let k = 0; k < schedule[selectedDate.getDay()].lapses.length; k++) {
      const open = {
        hour: schedule[selectedDate.getDay()].lapses[k].open.hour,
        minute: schedule[selectedDate.getDay()].lapses[k].open.minute
      }
      const close = {
        hour: schedule[selectedDate.getDay()].lapses[k].close.hour,
        minute: schedule[selectedDate.getDay()].lapses[k].close.minute
      }
      for (let i = open.hour; i <= close.hour; i++) {
        if (date.getDate() !== selectedDate.getDate() || i >= date.getHours()) {
          let hour = ''
          let meridian = ''
          if (is12Hours) {
            if (i === 0) {
              hour = '12'
              meridian = ' ' + 'AM'
            } else if (i > 0 && i < 12) {
              hour = (i < 10 ? '0' + i : i)
              meridian = ' ' + 'AM'
            } else if (i === 12) {
              hour = '12'
              meridian = ' ' + 'PM'
            } else {
              hour = ((i - 12 < 10) ? '0' + (i - 12) : `${(i - 12)}`)
              meridian = ' ' + 'PM'
            }
          } else {
            hour = i < 10 ? '0' + i : i
          }
          for (let j = (i === open.hour ? open.minute : 0); j <= (i === close.hour ? close.minute : 59); j += timeRange) {
            if (i !== date.getHours() || j >= date.getMinutes() || date.getDate() !== selectedDate.getDate()) {
              times.push({
                text: hour + ':' + (j < 10 ? '0' + j : j) + meridian,
                value: (i < 10 ? '0' + i : i) + ':' + (j < 10 ? '0' + j : j)
              })
            }
          }
        }
      }
    }
    setHourList(times)
  }

  useEffect(() => {
    getValidationFieldOrderTypes()
  }, [])

  useEffect(() => {
    generateDatesList()
  }, [reservationSetting?.min_time_reserve_minutes, reservationSetting?.max_time_reserve_days])

  const validateSelectedDate = (curdate, schedule) => {
    const day = moment(curdate).format('d')
    setIsEnabled(schedule[day].enabled)
  }

  const getTimes = (curdate, schedule) => {
    validateSelectedDate(curdate, schedule)
    const dateParts = curdate?.split?.('-')
    const dateSeleted = new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
    const options = {
      preorderLeadTime: reservationSetting?.min_time_reserve_minutes
    }
    generateHourList(dateSeleted, schedule, is12hours, options)
  }

  useEffect(() => {
    if (!reserveDate?.date || !business?.schedule) return
    getTimes(reserveDate?.date, business?.schedule)
  }, [reserveDate?.date, business?.schedule])

  useEffect(() => {
    if (!reserveDate?.date || !business?.schedule) return
    const interval = setInterval(() => {
      const _currentDate = new Date(currentDate.getTime() + reservationSetting?.min_time_reserve_minutes * 60000)
      const diff = dayjs(reserveDate.date).diff(dayjs(_currentDate), 'day')
      if (diff === 0) {
        getTimes(reserveDate?.date, business?.schedule)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [reserveDate.date])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          orderOptions={orderState.options}
          checkoutFieldsState={checkoutFieldsState}
          handleAddReservation={handleAddReservation}
          setOrderingMethod={setOrderingMethod}
          orderingMethod={orderingMethod}
          reservationSetting={reservationSetting}
          reservationState={reservationState}
          setReservationState={setReservationState}
          hoursList={hoursList}
          reserveDate={reserveDate}
          setReserveDate={setReserveDate}
          datesList={datesList}
          generateHourList={generateHourList}
          isEnabled={isEnabled}
        />
      )}
    </>
  )
}
