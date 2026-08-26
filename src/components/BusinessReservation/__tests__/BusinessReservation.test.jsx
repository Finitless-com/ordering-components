import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const acms = vi.hoisted(() => {
  const { createAnalyticsCmsTestContext } = require('../../../__tests__/helpers/analyticsCmsTestHelpers')
  return createAnalyticsCmsTestContext(vi)
})

vi.mock('../../../contexts/OrderContext', () => ({
  useOrder: () => [acms.mockOrderState, {
    createReservation: acms.mockCreateReservation,
    reorder: acms.mockReorder
  }]
}))

vi.mock('../../../contexts/ConfigContext', () => ({
  useConfig: () => [{ configs: acms.mockConfigState }]
}))

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [acms.mockOrdering]
}))

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => [{
    auth: true,
    loading: false,
    user: { id: 8, name: 'Test', last_name: 'User' },
    token: 'session-tok'
  }]
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => [[], { showToast: acms.mockShowToast }],
  ToastType: { error: 'error', success: 'success', info: 'info' }
}))

import dayjs from 'dayjs'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'

dayjs.extend(isSameOrAfter)

import { BusinessReservation } from '../index'

describe('BusinessReservation', () => {
  beforeEach(() => acms.reset())

  it('loads validation fields and generates reservation dates', async () => {
    renderController(BusinessReservation, {
      business: acms.sampleBusiness,
      cart: { products: [], reservation: {} }
    })
    await waitFor(() => {
      expect(lastControllerProps.checkoutFieldsState.loading).toBe(false)
    })
    expect(lastControllerProps.datesList.length).toBeGreaterThan(0)
    expect(lastControllerProps.reservationSetting).toBeTruthy()
  })

  it('creates a reservation through order context', async () => {
    renderController(BusinessReservation, {
      business: acms.sampleBusiness,
      cart: {
        products: [{ id: 1 }],
        reservation: { guests_reservation: 2 }
      }
    })
    act(() => {
      lastControllerProps.setReservationState({
        ...lastControllerProps.reservationState,
        changes: {
          guests_reservation: 2,
          reserve_date: '2026-07-20 18:00:00'
        }
      })
    })
    await act(async () => {
      await lastControllerProps.handleAddReservation({ id: 1, quantity: 1 })
    })
    expect(acms.mockCreateReservation).toHaveBeenCalled()
  })

  it('does not crash when reservation_setting is invalid JSON', () => {
    const business = {
      ...acms.sampleBusiness,
      configs: [{ key: 'reservation_setting', value: '{not-json' }]
    }
    expect(() => renderController(BusinessReservation, {
      business,
      cart: { products: [], reservation: {} }
    })).not.toThrow()
    expect(lastControllerProps.reservationSetting).toEqual({})
  })

  it('uses valid business reservation_setting JSON', () => {
    const setting = { min_time_reserve_minutes: 15, max_time_reserve_days: 3 }
    const business = {
      ...acms.sampleBusiness,
      configs: [{ key: 'reservation_setting', value: JSON.stringify(setting) }]
    }
    renderController(BusinessReservation, {
      business,
      cart: { products: [], reservation: {} }
    })
    expect(lastControllerProps.reservationSetting).toEqual(setting)
  })

  it('generates hour list when reserve date changes', async () => {
    renderController(BusinessReservation, {
      business: acms.sampleBusiness,
      cart: { products: [] }
    })
    await waitFor(() => expect(lastControllerProps.datesList.length).toBeGreaterThan(0))
    const futureDate = lastControllerProps.datesList[lastControllerProps.datesList.length - 1]
    act(() => {
      lastControllerProps.setReserveDate({
        date: futureDate,
        time: null
      })
    })
    await waitFor(() => {
      expect(lastControllerProps.hoursList.length).toBeGreaterThan(0)
    })
  })
})
