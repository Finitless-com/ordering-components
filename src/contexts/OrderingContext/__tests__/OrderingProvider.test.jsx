import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const orderProps = vi.hoisted(() => ({ current: null }))

const passthrough = ({ children }) => <>{children}</>

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
vi.mock('../../OrderContext', () => ({
  OrderProvider: (props) => {
    orderProps.current = props
    return <>{props.children}</>
  }
}))

const { OrderingProvider } = await import('../index')

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
