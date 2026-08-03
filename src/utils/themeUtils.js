/**
 * Theme utility functions to handle theme merging and processing
 */

/**
 * Get merged colors between base theme and ordering theme
 * @param {Object} theme - Base theme object
 * @param {Object} orderingTheme - Ordering theme object from API
 * @returns {Object} - Merged colors object
 */
export const getMergedColors = (theme, orderingTheme) => {
  if (!theme || !orderingTheme?.theme) return theme?.colors || {}

  const themeSettings = orderingTheme?.theme?.my_products?.components?.theme_settings?.components?.style

  return {
    ...theme.colors,
    ...(themeSettings?.primary_btn_color && { primary: themeSettings.primary_btn_color }),
    ...(themeSettings?.primary_link_color && { links: themeSettings.primary_link_color }),
    ...(themeSettings?.background_page && { backgroundPage: themeSettings.background_page })
  }
}

/**
 * Get merged general images between base theme and ordering theme
 * @param {Object} theme - Base theme object
 * @param {Object} orderingTheme - Ordering theme object from API
 * @returns {Object} - Merged general images object
 */
export const getMergedGeneralImages = (theme, orderingTheme) => {
  if (!theme || !orderingTheme?.theme) return theme?.images?.general || {}

  const orderTheme = orderingTheme?.theme

  return {
    ...theme.images.general,
    homeHero: orderTheme?.homepage_view?.components?.homepage_header?.components?.image || theme.images?.general?.homeHero,
    businessHero: orderTheme?.business_listing_view?.components?.business_hero?.components?.image || theme.images?.general?.businessHero,
    notFound: orderTheme?.business_listing_view?.components?.not_found_source?.components?.image || theme.images?.general?.notFound,
    emptyActiveOrders: orderTheme?.orders?.components?.active_orders?.components?.not_found_source?.components?.image || theme.images?.general?.emptyActiveOrders,
    emptyPastOrders: orderTheme?.orders?.components?.past_orders?.components?.not_found_source?.components?.image || theme.images?.general?.emptyPastOrders,
    notNetwork: orderTheme?.no_internet?.components?.image || theme.images?.general?.notNetwork,
    businessSignUpHero: orderTheme?.business_signup?.components?.icon?.components?.image || theme.images?.general?.businessSignUpHero,
    driverSignUpHero: orderTheme?.driver_signup?.components?.icon?.components?.image || theme.images?.general?.driverSignUpHero
  }
}

/**
 * Get merged category images between base theme and ordering theme
 * @param {Object} theme - Base theme object
 * @param {Object} orderingTheme - Ordering theme object from API
 * @returns {Object} - Merged category images object
 */
export const getMergedCategoryImages = (theme, orderingTheme) => {
  if (!theme || !orderingTheme?.theme) return theme?.images?.categories || {}

  const businessCategories = orderingTheme?.theme?.business_listing_view?.components?.categories?.components

  return {
    ...theme.images.categories,
    allfood: businessCategories?.food?.image || theme.images.categories.categoryFood,
    food: businessCategories?.food?.image || theme.images.categories.categoryFood,
    groceries: businessCategories?.groceries?.image || theme.images.categories.categoryGroceries,
    alcohol: businessCategories?.alcohol?.image || theme.images.categories.categoryAlcohol,
    laundry: businessCategories?.laundry?.image || theme.images.categories.categoryLaundry,
    all: businessCategories?.all?.image || theme.images.categories.categoryAll
  }
}

/**
 * Get merged dummy images between base theme and ordering theme
 * @param {Object} theme - Base theme object
 * @param {Object} orderingTheme - Ordering theme object from API
 * @returns {Object} - Merged dummy images object
 */
export const getMergedDummyImages = (theme, orderingTheme) => {
  if (!theme || !orderingTheme?.theme) return theme?.images?.dummies || {}

  const businessView = orderingTheme?.theme?.business_view?.components

  return {
    ...theme.images.dummies,
    businessHeader: businessView?.header?.components?.dummy_image || theme.images.dummies.businessHeader,
    businessLogo: businessView?.header?.components?.logo?.dummy_image || theme.images.dummies.businessLogo,
    product: businessView?.products?.components?.photo?.components?.dummy_image || theme.images.dummies.product
  }
}

/**
 * Get merged logo images between base theme and ordering theme
 * @param {Object} theme - Base theme object
 * @param {Object} orderingTheme - Ordering theme object from API
 * @returns {Object} - Merged logo images object
 */
export const getMergedLogoImages = (theme, orderingTheme, settings) => {
  if (!theme || !orderingTheme?.theme) return theme?.images?.logos || {}

  const logo = orderingTheme?.theme?.my_products?.components?.images?.components?.logo?.components?.image
  const headerLogo = orderingTheme?.theme?.header?.components?.logo?.components

  return {
    ...theme.images.logos,
    logotype: (settings?.isApp ? headerLogo?.image : logo) || theme.images.logos.logotype
  }
}

/**
 * Get merged delivery type images between base theme and ordering theme
 * @param {Object} theme - Base theme object
 * @param {Object} orderingTheme - Ordering theme object from API
 * @returns {Object} - Merged delivery type images object
 */
export const getMergedDeliveryTypeImages = (theme, orderingTheme) => {
  if (!theme || !orderingTheme?.theme) return theme?.images?.deliveryTypes || {}

  const orderTypes = orderingTheme?.theme?.order_types?.components

  return {
    ...theme.images.deliveryTypes,
    delivery: orderTypes?.delivery?.components?.image || theme.images.deliveryTypes?.delivery,
    pickup: orderTypes?.pickup?.components?.image || theme.images.deliveryTypes?.pickUp,
    eat_in: orderTypes?.eat_in?.components?.image || theme.images.deliveryTypes?.eatIn,
    curbside: orderTypes?.curbside?.components?.image || theme.images.deliveryTypes?.curbside,
    drive_thru: orderTypes?.drive_thru?.components?.image || theme.images.deliveryTypes?.driveThru,
    catering_delivery: orderTypes?.catering_delivery?.components?.image || theme.images.deliveryTypes?.cateringDelivery,
    catering_pickup: orderTypes?.catering_pickup?.components?.image || theme.images.deliveryTypes?.cateringPickup
  }
}

/**
 * Get merged images object between base theme and ordering theme
 * @param {Object} theme - Base theme object
 * @param {Object} orderingTheme - Ordering theme object from API
 * @returns {Object} - Merged images object
 */
export const getMergedImages = (theme, orderingTheme, settings) => {
  return {
    ...theme.images,
    general: getMergedGeneralImages(theme, orderingTheme),
    categories: getMergedCategoryImages(theme, orderingTheme),
    dummies: getMergedDummyImages(theme, orderingTheme),
    logos: getMergedLogoImages(theme, orderingTheme, settings),
    deliveryTypes: getMergedDeliveryTypeImages(theme, orderingTheme)
  }
}

/**
 * Create a merged theme object from base theme and ordering theme
 * @param {Object} theme - Base theme object
 * @param {Object} orderingTheme - Ordering theme object from API
 * @returns {Object} - Complete merged theme object
 */
export const createMergedTheme = (theme, orderingTheme, settings) => {
  if (!theme) return {}
  if (!orderingTheme?.theme) return theme

  return {
    ...theme,
    ...orderingTheme?.theme,
    colors: settings?.isApp
      ? {
          ...theme.colors,
          active: theme.colors.primary,
          activeContrast: theme.colors.lightPrimary
        }
      : getMergedColors(theme, orderingTheme),
    images: getMergedImages(theme, orderingTheme, settings)
  }
}
