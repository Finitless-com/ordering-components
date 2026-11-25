import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DATES_GENERAL_FORMAT,
  getDateTimeFormats,
  getMaxPreorderDays,
  isWalletEnabled
} from '../configHelpers'

describe('getDateTimeFormats', () => {
  it('uses the default 24h general format when the value is empty', () => {
    expect(getDateTimeFormats()).toEqual({
      dateFormat: 'YYYY-MM-DD',
      timeFormat: 'HH:mm:ss',
      is12Hours: false,
      preorderDateFormat: 'MM-DD'
    })
    expect(getDateTimeFormats('   ')).toEqual(getDateTimeFormats(DEFAULT_DATES_GENERAL_FORMAT))
  })

  it('splits a 12h general format into date, time and yearless preorder tokens', () => {
    expect(getDateTimeFormats('MM/DD/YYYY hh:mm A')).toEqual({
      dateFormat: 'MM/DD/YYYY',
      timeFormat: 'hh:mm A',
      is12Hours: true,
      preorderDateFormat: 'MM/DD'
    })
  })

  it('treats lowercase h as 12 hours even when seconds are present', () => {
    expect(getDateTimeFormats('YYYY-MM-DD hh:mm:ssa').is12Hours).toBe(true)
  })
})

describe('isWalletEnabled', () => {
  it('is off when cash and points wallets are off', () => {
    expect(isWalletEnabled({
      wallet_cash_enabled: { value: '0' },
      wallet_credit_point_enabled: { value: '0' }
    })).toBe(false)
  })

  it('is on when either cash or points is on', () => {
    expect(isWalletEnabled({ wallet_cash_enabled: { value: '1' } })).toBe(true)
    expect(isWalletEnabled({ wallet_credit_point_enabled: { value: 'true' } })).toBe(true)
  })

  it('reads array-shaped configs', () => {
    expect(isWalletEnabled([
      { key: 'wallet_cash_enabled', value: '0' },
      { key: 'wallet_credit_point_enabled', value: '1' }
    ])).toBe(true)
  })
})

describe('getMaxPreorderDays', () => {
  const configs = {
    max_days_preorder: { value: '6' },
    preorder_maximum_days: { value: '1,10|2,3' }
  }

  it('uses the per-type override when it is set', () => {
    expect(getMaxPreorderDays(configs, 1)).toBe(10)
    expect(getMaxPreorderDays(configs, '2')).toBe(3)
  })

  it('falls back to max_days_preorder when the type has no override', () => {
    expect(getMaxPreorderDays(configs, 5)).toBe(6)
    expect(getMaxPreorderDays(configs)).toBe(6)
  })

  it('defaults to 6 when the global key is missing', () => {
    expect(getMaxPreorderDays({}, 1)).toBe(6)
  })

  // SERGIO-1732: api-core stores the setting by the name of the order type
  describe('in the format api-core stores', () => {
    const named = {
      max_days_preorder: { value: '6' },
      preorder_maximum_days: { value: 'delivery,10|pickup,3|eatin,15|curbside,15|driver_thru,4|seat_delivery,15|catering_delivery,20|catering_pickup,25' }
    }

    it('finds the value of an order type given by id', () => {
      expect(getMaxPreorderDays(named, 1)).toBe(10)
      expect(getMaxPreorderDays(named, '2')).toBe(3)
      expect(getMaxPreorderDays(named, 5)).toBe(4)
      expect(getMaxPreorderDays(named, 7)).toBe(20)
      expect(getMaxPreorderDays(named, 8)).toBe(25)
    })

    it('finds the value of an order type given by name', () => {
      expect(getMaxPreorderDays(named, 'pickup')).toBe(3)
      expect(getMaxPreorderDays(named, 'drivethru')).toBe(4)
    })

    it('does not mix pickup with catering pickup, and falls back for a type it does not list', () => {
      expect(getMaxPreorderDays({ preorder_maximum_days: { value: 'catering_pickup,25' } }, 2)).toBe(6)
      expect(getMaxPreorderDays(named, 9)).toBe(6)
    })
  })
})
