import React, { createContext } from 'react'
import { ConfigProvider } from '../ConfigContext'
import { SiteProvider } from '../SiteContext'
import { SessionProvider } from '../SessionContext'
import { WebsocketProvider } from '../WebsocketContext'
import { OrderProvider } from '../OrderContext'
import { BusinessProvider } from '../BusinessContext'
import { LanguageProvider } from '../LanguageContext'
import { ApiProvider } from '../ApiContext'
import { EventProvider } from '../EventContext'
import { UtilsProviders } from '../UtilsContext'
import { ValidationFieldsProvider } from '../ValidationsFieldsContext'
import { CustomerProvider } from '../CustomerContext'
import { ToastProvider } from '../ToastContext'
import { WebStrategy } from '../../webStrategy'
import { OrderingThemeProvider } from '../OrderingThemeContext'
import { OptimizationLoadProvider } from '../OptimizationLoadContext'
import { ReferralProvider } from '../ReferralContext'
import { subscribeToBrowserReferralUrls } from '../../utils/referral'

const getInitialReferralUrl = () => typeof window === 'undefined' ? null : window.location?.href

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
export const OrderingProvider = ({ Alert, settings, children, enableCouponsRetries = false, initialOptimizationLoad, referralEnabled = true }) => {
  const webStrategy = new WebStrategy()
  const restOfSettings = {
    project: settings.project,
    appId: settings.app_id,
    appInternalName: settings.app_internal_name,
    countryCode: settings.countryCode,
    useOptimizeLoad: settings.useOptimizeLoad,
    use_root_point: settings.use_root_point
  }
  return (
    <OrderingContext.Provider value={{}}>
      <EventProvider>
        <ApiProvider settings={Object.assign(settings.api, restOfSettings)}>
          <OptimizationLoadProvider settings={Object.assign(settings.api, restOfSettings)} strategy={webStrategy} initialData={initialOptimizationLoad}>
            <LanguageProvider settings={Object.assign(settings.api, restOfSettings)} restOfProps={settings} strategy={webStrategy}>
              <ConfigProvider strategy={webStrategy}>
                <OrderingThemeProvider settings={Object.assign(settings.api, restOfSettings)}>
                  <SiteProvider appId={settings.app_id}>
                    <UtilsProviders strategy={webStrategy}>
                      <ToastProvider>
                        <ValidationFieldsProvider appId={settings.app_id}>
                          <SessionProvider strategy={webStrategy}>
                            <ReferralProvider
                              strategy={webStrategy}
                              getInitialUrl={getInitialReferralUrl}
                              subscribeToUrls={subscribeToBrowserReferralUrls}
                            >
                              <WebsocketProvider
                                strategy={webStrategy}
                                settings={Object.assign(settings.socket, restOfSettings)}
                              >
                                <CustomerProvider strategy={webStrategy}>
                                  <OrderProvider
                                    Alert={Alert}
                                    strategy={webStrategy}
                                    businessSlug={settings?.businessSlug}
                                    franchiseId={settings?.franchiseSlug ?? settings?.franchiseId}
                                    enableCouponsRetries={enableCouponsRetries}
                                    referralEnabled={referralEnabled}
                                  >
                                    <BusinessProvider>
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
