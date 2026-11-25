import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const sessionProps = vi.hoisted(() => ({ current: null }))

const passthrough = ({ children }) => <>{children}</>

vi.mock('../../SiteContext', () => ({ SiteProvider: passthrough }))
vi.mock('../../SessionContext', () => ({
  SessionProvider: (props) => {
    sessionProps.current = props
    return <>{props.children}</>
  }
}))
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
vi.mock('../../OrderContext', () => ({ OrderProvider: passthrough }))
vi.mock('../../ReferralContext', () => ({ ReferralProvider: passthrough }))
vi.mock('../../../webStrategy', () => ({ WebStrategy: class {} }))
vi.mock('../../../../native/src/NativeStrategy', () => ({ NativeStrategy: class {} }))

const { OrderingProvider: WebOrderingProvider } = await import('../index')
const { OrderingProvider: NativeOrderingProvider } = await import('../../../../native/src/contexts/OrderingContext')

const settings = () => ({ api: {}, socket: {} })

describe.each([
  ['web', WebOrderingProvider],
  ['native', NativeOrderingProvider]
])('%s OrderingProvider sessionCheckInterval', (name, OrderingProvider) => {
  beforeEach(() => { sessionProps.current = null })

  it('leaves the SessionProvider default (2000 ms) when not given', () => {
    render(<OrderingProvider settings={settings()}><div /></OrderingProvider>)
    expect(sessionProps.current.checkInterval).toBeUndefined()
  })

  it.each([30000, 0, false, null])('forwards %p to the SessionProvider', (value) => {
    render(<OrderingProvider settings={settings()} sessionCheckInterval={value}><div /></OrderingProvider>)
    expect(sessionProps.current.checkInterval).toBe(value)
  })
})
