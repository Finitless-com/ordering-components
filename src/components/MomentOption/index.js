import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import dayjs from 'dayjs'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { useOrder } from '../../contexts/OrderContext'
import {
  createDayjsWithTimezone,
  formatUtcInBusinessTimezone,
  getValidTimezone,
  parseBusinessDateTime
} from '../../constants/timezones'

dayjs.extend(isSameOrAfter)
dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Component to manage moment option behavior without UI component
 */
export const MomentOption = (props) => {
  props = { ...defaultProps, ...props }
  const {
    minDate,
    maxDate,
    currentDate,
    useOrderContext,
    onChangeMoment,
    preorderSlotInterval,
    cateringPreorder,
    preorderLeadTime,
    business,
    UIComponent,
    preorderTimeRange,
    preorderMinimumDays
  } = props

  const businessTimezone = getValidTimezone(business?.timezone)
  const getNow = () => business?.timezone ? createDayjsWithTimezone(business.timezone) : dayjs()

  const [orderStatus, { changeMoment }] = useOrder()

  /**
   * Method to valid if a date is same of after current date
   * @param {String} date
   */
  const validDate = (date) => {
    if (!date) return
    const now = getNow()
    let parsed
    if (date instanceof Date) {
      parsed = business?.timezone ? dayjs(date).tz(businessTimezone) : dayjs(date)
    } else if (business?.timezone) {
      parsed = dayjs.utc(date).tz(businessTimezone)
    } else {
      parsed = dayjs(date, 'YYYY-MM-DD HH:mm')
    }
    return parsed.isSameOrAfter(now, 'day')
      ? parsed.format('YYYY-MM-DD HH:mm')
      : now.format('YYYY-MM-DD HH:mm')
  }

  /**
   * Method to calculate diferrence between 2 dates
   * @param {moment} start
   * @param {moment} end
   */
  const calculateDiffDay = (start, end) => {
    const endVal = end ?? getNow()
    return dayjs(start).diff(dayjs(endVal), 'day')
  }

  const formatStoredMoment = (storedMoment) => {
    if (!storedMoment) return null
    if (business?.timezone) {
      return formatUtcInBusinessTimezone(storedMoment, business.timezone, 'YYYY-MM-DD HH:mm')
    }
    return dayjs.utc(validDate(storedMoment)).local().format('YYYY-MM-DD HH:mm')
  }

  /**
   * This must be containt schedule selected by user
   */
  const _currentDate = useOrderContext ? orderStatus.options?.moment : currentDate
  const [scheduleSelected, setScheduleSelected] = useState(
    _currentDate ? formatStoredMoment(_currentDate) : null
  )

  /**
   * Flag to know if user select asap time
   */
  const [isAsap, setIsAsap] = useState(!scheduleSelected)

  /**
   * Arrays for save hours and dates lists
   */
  const [hoursList, setHourList] = useState([])
  const [datesList, setDatesList] = useState([])
  const [dateSelected, setDateSelected] = useState(
    getNow().add(preorderMinimumDays || 0, 'day').format('YYYY-MM-DD')
  )
  const [timeSelected, setTimeSelected] = useState(null)

  const handleChangeDate = (date) => {
    if (!date || date === dateSelected) return
    setDateSelected(date)
    setTimeSelected(null)
    setIsAsap(false)
    onChangeMoment && onChangeMoment(null)
  }

  const handleChangeTime = (time) => {
    if (!time || time === timeSelected) return
    const _moment = business?.timezone
      ? parseBusinessDateTime(dateSelected, time, business.timezone).toDate()
      : dayjs(`${dateSelected} ${time}`, 'YYYY-MM-DD HH:mm').toDate()
    setTimeSelected(time)
    setIsAsap(false)
    if (useOrderContext) {
      changeMoment(_moment)
    }
    onChangeMoment && onChangeMoment(_moment)
  }

  const handleAsap = () => {
    if (isAsap) return
    setIsAsap(true)
    if (useOrderContext) {
      changeMoment(null)
    }
    onChangeMoment && onChangeMoment(null)
  }

  useEffect(() => {
    if (useOrderContext) {
      if (orderStatus.options?.moment) {
        const formatted = formatStoredMoment(orderStatus.options?.moment)
        setScheduleSelected(formatted)
        setDateSelected(formatted?.split(' ')[0])
        setTimeSelected(formatted?.split(' ')[1])
        isAsap && setIsAsap(false)
      } else {
        const today = getNow().format('YYYY-MM-DD')
        dateSelected !== today && setDateSelected(today)
        timeSelected !== null && setTimeSelected(null)
        scheduleSelected !== null && setScheduleSelected(null)
        !isAsap && setIsAsap(true)
      }
    } else {
      scheduleSelected !== null && setScheduleSelected(null)
      !isAsap && setIsAsap(true)
    }
  }, [orderStatus.options?.moment, business?.timezone])

  useEffect(() => {
    if (!scheduleSelected) {
      return
    }
    const selected = business?.timezone
      ? parseBusinessDateTime(
        scheduleSelected.split(' ')[0],
        scheduleSelected.split(' ')[1],
        business.timezone
      )
      : dayjs(scheduleSelected, 'YYYY-MM-DD HH:mm')
    const now = getNow()
    const secondsDiff = selected.diff(now, 'seconds')
    if (secondsDiff <= 0) {
      handleAsap()
      return
    }

    const checkTime = setTimeout(() => {
      handleAsap()
    }, secondsDiff * 1000)

    return () => {
      clearTimeout(checkTime)
    }
  }, [scheduleSelected, business?.timezone])

  const getActualSchedule = () => {
    const dayNumber = business?.timezone
      ? dayjs.tz(dateSelected, 'YYYY-MM-DD', businessTimezone).day()
      : dayjs(dateSelected).day()
    const schedule = business?.schedule?.find?.((s, i) => dayNumber === i)
    return schedule?.enabled && schedule
  }

  useEffect(() => {
    if (isAsap && datesList[0]) {
      setDateSelected(datesList[preorderMinimumDays || 0])
      setTimeSelected(null)
    }
  }, [isAsap, datesList])

  /**
   * generate a list of available hours
   */
  const generateHourList = (preorderLeadTime, preorderTimeRange, preorderSlotInterval) => {
    // a value that is not a number (a setting that did not parse) would make the
    // catering list empty or endless: it falls back to the defaults
    preorderLeadTime = Number.isFinite(preorderLeadTime) && preorderLeadTime >= 0 ? preorderLeadTime : defaultProps.preorderLeadTime
    preorderTimeRange = Number.isFinite(preorderTimeRange) && preorderTimeRange > 0 ? preorderTimeRange : defaultProps.preorderTimeRange
    preorderSlotInterval = Number.isFinite(preorderSlotInterval) && preorderSlotInterval > 0 ? preorderSlotInterval : defaultProps.preorderSlotInterval
    const hoursAvailable = []
    const now = getNow()
    const isToday = dateSelected === now.format('YYYY-MM-DD')
    const maxDateInTz = business?.timezone
      ? dayjs(maxDate).tz(businessTimezone)
      : dayjs(maxDate)
    const isLastDate = dateSelected === maxDateInTz.format('YYYY-MM-DD')

    if (!cateringPreorder) {
      for (let hour = 0; hour < 24; hour++) {
        if (isToday && hour < now.hour()) continue
        if (isLastDate && hour > maxDateInTz.hour()) continue
        for (let minute = 0; minute < 59; minute += 15) {
          if (isToday && hour === now.hour() && minute <= now.minute()) continue
          if (isLastDate && hour === maxDateInTz.hour() && minute > maxDateInTz.minute()) continue
          const _hour = hour < 10 ? `0${hour}` : hour
          const startMinute = minute < 10 ? `0${minute}` : minute
          const endMinute = (minute + 14) < 10 ? `0${minute + 14}` : minute + 14
          hoursAvailable.push({
            startTime: `${_hour}:${startMinute}`,
            endTime: `${_hour}:${endMinute}`
          })
        }
      }
    } else {
      let startTimeAcc = preorderLeadTime
      let endTimeAcc = preorderTimeRange + preorderLeadTime
      const dayStart = now.startOf('day')
      while (startTimeAcc >= 0 && dayStart.add(startTimeAcc || 0, 'minute').isBefore(dayStart.add(1, 'day'))) {
        hoursAvailable.push({
          startTime: dayStart.add(startTimeAcc || 0, 'minute').format('HH:mm'),
          endTime: dayStart.add(endTimeAcc, 'minute').format('HH:mm')
        })
        startTimeAcc = startTimeAcc + preorderSlotInterval
        endTimeAcc = endTimeAcc + preorderSlotInterval
      }
    }
    setHourList(hoursAvailable)
  }

  /**
   * Generate a list of available dates
   */
  const generateDatesList = () => {
    const dates = []
    const rangeStart = validDate(minDate) || getNow().format('YYYY-MM-DD HH:mm')
    const rangeEnd = validDate(maxDate)
    const diff = parseInt(calculateDiffDay(rangeEnd, rangeStart))

    for (let i = 0; i < diff + 1; i++) {
      const base = business?.timezone
        ? dayjs.tz(rangeStart.split(' ')[0], 'YYYY-MM-DD', businessTimezone)
        : dayjs(rangeStart.split(' ')[0])
      dates.push(base.add(i, 'd').format('YYYY-MM-DD'))
    }
    setDatesList(dates)
  }

  useEffect(() => {
    if (!dateSelected) return
    generateHourList(preorderLeadTime, preorderTimeRange, preorderSlotInterval)
  }, [dateSelected, preorderLeadTime, preorderTimeRange, preorderSlotInterval, business?.timezone])

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = dayjs(dateSelected).diff(
        business?.timezone ? createDayjsWithTimezone(business.timezone) : dayjs(currentDate),
        'day'
      )
      if (diff === 0) {
        generateHourList(preorderLeadTime, preorderTimeRange, preorderSlotInterval)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [dateSelected, preorderLeadTime, preorderTimeRange, preorderSlotInterval, business?.timezone])

  useEffect(() => {
    generateDatesList()
  }, [maxDate, minDate, business?.timezone])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          isAsap={isAsap}
          minDate={validDate(minDate)}
          maxDate={validDate(maxDate)}
          dateSelected={dateSelected}
          timeSelected={timeSelected}
          handleChangeDate={handleChangeDate}
          handleChangeTime={handleChangeTime}
          datesList={datesList}
          hoursList={hoursList}
          handleAsap={handleAsap}
          getActualSchedule={getActualSchedule}
          scheduleSelected={scheduleSelected}
        />
      )}
    </>
  )
}

MomentOption.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
   * minDate, this must be contains a custom date selected
   */
  minDate: PropTypes.instanceOf(Date),
  /**
   * maxDate, this must be contains a custom date selected
   */
  maxDate: PropTypes.instanceOf(Date).isRequired,
  /**
   * currentDate, this must be contains a custom date selected
   */
  currentDate: PropTypes.instanceOf(Date),
  /**
   * currentDate, this must be contains a custom date selected
   */
  useOrderContext: PropTypes.bool,
  /**
   * Method to return moment selection
   */
  onChangeMoment: PropTypes.func
}

const defaultProps = {
  useOrderContext: true,
  preorderSlotInterval: 15,
  preorderLeadTime: 0,
  preorderTimeRange: 30
}
