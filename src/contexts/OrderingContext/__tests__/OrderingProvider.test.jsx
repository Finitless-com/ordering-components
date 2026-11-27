import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const orderProps = vi.hoisted(() => ({ current: null }))

const passthrough = ({ children }) => <>{children}</>

vi.mock('../../ReferralContext', () => ({ ReferralProvider: passthrough }))
vi.mock('../../SiteContext', () => ({ SiteProvider: passthrough }))
vi.mock('../../SessionContext', () => ({ SessionProvider: passthrough }))
vi.mock('../../WebsocketContext', () => ({ WebsocketProvider: passthrough }))
vi.mock('../../LanguageContext', () => ({ LanguageProvider: passthrough }))
vi.mock('../../ApiContext', () => ({ ApiProvider: passthrough }))
vi.mock('../../EventContext', () => ({ EventProvider: passthrough }))
vi.mock('../../CustomerContext', () => ({ CustomerProvider: passthrough }))
vi.mock('../../ToastContext', () => ({ ToastProvider: passthrough }))
vi.mock('../../BusinessContext', () => ({ BusinessProvider: passthrough }))
vi.mock('../../ConfigContext', () => ({ ConfigProvider: passthrough }))
vi.mock('../../ValidationsFieldsContext', () => ({ ValidationFieldsProvider: passthrough }))
vi.mock('../../OrderingThemeContext', () => ({ OrderingThemeProvider: passthrough }))
vi.mock('../../OptimizationLoadContext', () => ({ OptimizationLoadProvider: passthrough }))
vi.mock('../../UtilsContext', () => ({ UtilsProviders: passthrough }))
vi.mock('../../../webStrategy', () => ({ WebStrategy: class {} }))
vi.mock('../../../../native/src/NativeStrategy', () => ({ NativeStrategy: class {} }))
vi.mock('react-native', () => ({ Linking: { getInitialURL: vi.fn(), addEventListener: vi.fn() } }))
vi.mock('../../OrderContext', () => ({
  OrderProvider: (props) => {
    orderProps.current = props
    return <>{props.children}</>
  }
}))

const { OrderingProvider } = await import('../index')
const { OrderingProvider: NativeOrderingProvider } = await import('../../../../native/src/contexts/OrderingContext')

const settings = { api: {}, socket: {} }

describe('OrderingProvider referralEnabled', () => {
  it('turns attribution on by default', () => {
    render(<OrderingProvider settings={settings}><div /></OrderingProvider>)
    expect(orderProps.current.referralEnabled).toBe(true)
  })

  it('forwards the switch to OrderProvider', () => {
    const { rerender } = render(<OrderingProvider settings={settings} referralEnabled={false}><div /></OrderingProvider>)
    expect(orderProps.current.referralEnabled).toBe(false)
    rerender(<OrderingProvider settings={settings} referralEnabled><div /></OrderingProvider>)
    expect(orderProps.current.referralEnabled).toBe(true)
  })
})

describe('OrderingProvider disableWorkerPickup', () => {
  it('keeps the worker pickup by default', () => {
    render(<OrderingProvider settings={settings}><div /></OrderingProvider>)
    expect(orderProps.current.disableWorkerPickup).toBe(false)
  })

  it('forwards the switch to OrderProvider', () => {
    render(<OrderingProvider settings={settings} disableWorkerPickup><div /></OrderingProvider>)
    expect(orderProps.current.disableWorkerPickup).toBe(true)
  })
})

describe('OrderingProvider localizedCheckoutErrors', () => {
  it.each([
    ['web', OrderingProvider],
    ['native', NativeOrderingProvider]
  ])('opts in only when requested on %s', (_name, Provider) => {
    const { rerender } = render(<Provider settings={settings}><div /></Provider>)
    expect(orderProps.current.localizedCheckoutErrors).toBe(false)
    rerender(<Provider settings={settings} localizedCheckoutErrors><div /></Provider>)
    expect(orderProps.current.localizedCheckoutErrors).toBe(true)
  })
})
