import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  optimizationLoad: { loading: false, error: null, result: null }
}))

vi.mock('../../ApiContext', () => ({
  useApi: () => [{ project: 'demo', root: 'https://api.example.com/v400/en/demo' }]
}))

vi.mock('../../OptimizationLoadContext', () => ({
  useOptimizationLoad: () => [mocks.optimizationLoad]
}))

import { OrderingThemeProvider, useOrderingTheme } from '../index'

const Consumer = ({ onState }) => {
  const [state] = useOrderingTheme()
  onState(state)
  return null
}

const renderWithTheme = (theme, props = {}) => {
  mocks.optimizationLoad = { loading: false, error: null, result: { theme } }
  const states = []
  render(
    <OrderingThemeProvider settings={{ appId: 'demo' }} {...props}>
      <Consumer onState={(state) => states.push(state)} />
    </OrderingThemeProvider>
  )
  return () => states[states.length - 1]
}

describe('OrderingThemeProvider color validation', () => {
  beforeEach(() => {
    mocks.optimizationLoad = { loading: false, error: null, result: null }
  })

  it('keeps the slot roles of a version 2 theme', async () => {
    const theme = {
      version: 2,
      values: {
        tokens: { focus_ring: { color: 'primary' } },
        components: {
          header: { slots: { login: { component: 'button', appearance: 'outline', color: 'secondary' } } },
          card: { base: { background: '#F4F4F8' } }
        }
      }
    }
    const latest = renderWithTheme(theme)
    await waitFor(() => expect(latest().loading).toBe(false))
    expect(latest().theme).toEqual(theme)
  })

  it('still clears the invalid colors of a theme that is not version 2', async () => {
    const theme = {
      general: {
        components: {
          buttons: { color: 'secondary', borderColor: '#303994' }
        }
      }
    }
    const latest = renderWithTheme(theme)
    await waitFor(() => expect(latest().loading).toBe(false))
    expect(latest().theme.general.components.buttons).toEqual({ color: '', borderColor: '#303994' })
  })

  it('keeps every value with noValidateColors', async () => {
    const theme = { general: { components: { buttons: { color: 'secondary' } } } }
    const latest = renderWithTheme(theme, { noValidateColors: true })
    await waitFor(() => expect(latest().loading).toBe(false))
    expect(latest().theme.general.components.buttons.color).toBe('secondary')
  })
})
