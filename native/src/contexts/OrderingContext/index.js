import React, { createContext, useMemo } from 'react'
import { Linking } from 'react-native'
import { ConfigProvider } from '../../../../src/contexts/ConfigContext'
import { SessionProvider } from '../../../../src/contexts/SessionContext'
import { WebsocketProvider } from '../../../../src/contexts/WebsocketContext'
import { OrderProvider } from '../../../../src/contexts/OrderContext'
import { BusinessProvider } from '../../../../src/contexts/BusinessContext'
import { LanguageProvider } from '../../../../src/contexts/LanguageContext'
import { ApiProvider } from '../../../../src/contexts/ApiContext'
import { EventProvider } from '../../../../src/contexts/EventContext'
import { UtilsProviders } from '../../../../src/contexts/UtilsContext'
import { ValidationFieldsProvider } from '../../../../src/contexts/ValidationsFieldsContext'
import { ToastProvider } from '../../../../src/contexts/ToastContext'
import { CustomerProvider } from '../../../../src/contexts/CustomerContext'
import { OptimizationLoadProvider } from '../../../../src/contexts/OptimizationLoadContext'
import { OrderingThemeProvider } from '../../../../src/contexts/OrderingThemeContext'
import { NativeStrategy } from '../../NativeStrategy'
import { SiteProvider } from '../../../../src/contexts/SiteContext'
import { ReferralProvider } from '../../../../src/contexts/ReferralContext'

const getInitialReferralUrl = () => Linking.getInitialURL()

const subscribeToReferralUrls = (handler) => {
  const subscription = Linking.addEventListener('url', ({ url }) => handler(url))
  return () => subscription.remove()
}

/**
 * Create OrderingContext
 * Wrapper to use all context to ordering apps
 */
export const OrderingContext = createContext()

/**
 * Custom provider to languages manager
 * This provider has a reducer for manage languages state
 * @param {props} props
 * Use restOfProps on contexts that requiere extra settings that aren't in the sdk
 * This prop doesn't need permission from sdk.
 */
export const OrderingProvider = ({ Alert, isValidColor, noValidateColors, settings, children, isDisableToast, isDisabledDefaultOpts, enableCouponsRetries = false, sessionCheckInterval }) => {
  // Stateless, one for the provider's life: a new one each render reached every provider that receives it.
  const nativeStrategy = useMemo(() => new NativeStrategy(), [])
  const restOfSettings = {
    project: settings.project,
    appId: settings.app_id,
    appInternalName: settings.app_internal_name,
    use_root_point: settings.use_root_point,
    countryCode: settings.countryCode,
    useOptimizeLoad: settings?.useOptimizeLoad,
    force_update_lang: settings?.force_update_lang
  }
  return (
    <OrderingContext.Provider value={{}}>
      <EventProvider>
        <ApiProvider settings={Object.assign(settings.api, restOfSettings)}>
          <OptimizationLoadProvider strategy={nativeStrategy} settings={Object.assign(settings.api, restOfSettings)}>
            <LanguageProvider strategy={nativeStrategy} settings={Object.assign(settings.api, restOfSettings)} restOfProps={settings}>
              <ConfigProvider strategy={nativeStrategy}>
                <OrderingThemeProvider settings={Object.assign(settings.api, restOfSettings)} isValidColor={isValidColor} noValidateColors={noValidateColors}>
                  <SiteProvider appId={settings.app_id}>
                    <UtilsProviders strategy={nativeStrategy}>
                      <ToastProvider>
                        <ValidationFieldsProvider appId={settings.app_id}>
                          <SessionProvider strategy={nativeStrategy} checkInterval={sessionCheckInterval}>
                            <ReferralProvider
                              strategy={nativeStrategy}
                              getInitialUrl={getInitialReferralUrl}
                              subscribeToUrls={subscribeToReferralUrls}
                            >
                              <WebsocketProvider strategy={nativeStrategy} settings={Object.assign(settings.socket, restOfSettings)}>
                                <CustomerProvider strategy={nativeStrategy}>
                                  <OrderProvider
                                    isDisabledDefaultOpts={isDisabledDefaultOpts}
                                    strategy={nativeStrategy}
                                    Alert={Alert}
                                    isDisableToast={isDisableToast}
                                    franchiseId={settings?.franchiseSlug ?? settings?.franchiseId}
                                    businessSlug={settings?.businessSlug}
                                    userAgent={settings?.userAgent}
                                    enableCouponsRetries={enableCouponsRetries}
                                  >
                                    <BusinessProvider
                                      businessId={settings?.businessSlug ?? settings?.businessId}
                                    >
                                      {children}
                                    </BusinessProvider>
                                  </OrderProvider>
                                </CustomerProvider>
                              </WebsocketProvider>
                            </ReferralProvider>
                          </SessionProvider>
                        </ValidationFieldsProvider>
                      </ToastProvider>
                    </UtilsProviders>
                  </SiteProvider>
                </OrderingThemeProvider>
              </ConfigProvider>
            </LanguageProvider>
          </OptimizationLoadProvider>
        </ApiProvider>
      </EventProvider>
    </OrderingContext.Provider>
  )
}
