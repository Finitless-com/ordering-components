import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  configs: {}
}))

vi.mock('../../ConfigContext', () => ({
  useConfig: () => [{ configs: mocks.configs }]
}))

vi.mock('../../LanguageContext', () => ({
  useLanguage: () => [{ loading: true }, (_key, fallback) => fallback]
}))

vi.mock('../../ApiContext', () => ({
  useApi: () => [{}]
}))

vi.mock('../../EventContext', () => ({
  useEvent: () => [{ on: vi.fn(), off: vi.fn() }]
}))

import { UtilsProviders, useUtils } from '../index'

const baseConfigs = {
  format_number_decimal_length: { value: 2 },
  format_number_decimal_separator: { value: ',' },
  format_number_thousand_separator: { value: '.' },
  currency_position: { value: 'left' }
}

const strategy = {
  getItem: () => new Promise(() => {})
}

const PriceConsumer = ({ onReady }) => {
  const [{ parsePrice }] = useUtils()
  onReady(parsePrice)
  return null
}

const DateConsumer = ({ onReady }) => {
  const [utils] = useUtils()
  onReady(utils)
  return null
}

describe('UtilsContext price formatting', () => {
  beforeEach(() => {
    mocks.configs = { ...baseConfigs }
  })

  it('prioritizes the configured display currency over an order currency symbol', () => {
    mocks.configs.format_number_currency = { value: 'SRD' }
    let parsePrice

    render(
      <UtilsProviders strategy={strategy}>
        <PriceConsumer onReady={value => { parsePrice = value }} />
      </UtilsProviders>
    )

    expect(parsePrice(1617, { currency: '$', currencyPosition: 'right' })).toBe('SRD 1.617,00')
  })

  it('uses the requested currency as a fallback when no display currency is configured', () => {
    delete mocks.configs.currency_position
    let parsePrice

    render(
      <UtilsProviders strategy={strategy}>
        <PriceConsumer onReady={value => { parsePrice = value }} />
      </UtilsProviders>
    )

    expect(parsePrice(1617, { currency: '€', currencyPosition: 'right' })).toBe('1.617,00 €')
  })
})

describe('UtilsContext derived date and distance helpers', () => {
  beforeEach(() => {
    mocks.configs = { ...baseConfigs }
  })

  it('exposes formats derived from dates_general_format', () => {
    mocks.configs.dates_general_format = { value: 'MM/DD/YYYY hh:mm A' }
    let utils

    render(
      <UtilsProviders strategy={strategy}>
        <DateConsumer onReady={value => { utils = value }} />
      </UtilsProviders>
    )

    expect(utils.dateFormat).toBe('MM/DD/YYYY')
    expect(utils.timeFormat).toBe('hh:mm A')
    expect(utils.is12Hours).toBe(true)
    expect(utils.preorderDateFormat).toBe('MM/DD')
  })

  it('uses distance_unit only', () => {
    mocks.configs.distance_unit = { value: 'MI' }
    let utils

    render(
      <UtilsProviders strategy={strategy}>
        <DateConsumer onReady={value => { utils = value }} />
      </UtilsProviders>
    )

    expect(utils.parseDistance(1, { decimal: 2, separator: '.', thousand: ',' })).toBe('0.62 mi')
  })
})
