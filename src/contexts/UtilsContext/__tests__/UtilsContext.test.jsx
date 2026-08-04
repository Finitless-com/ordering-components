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
