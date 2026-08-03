import { describe, it, expect } from 'vitest'
import {
  getMergedColors,
  getMergedGeneralImages,
  getMergedCategoryImages,
  getMergedDummyImages,
  getMergedLogoImages,
  getMergedDeliveryTypeImages,
  getMergedImages,
  createMergedTheme
} from '../themeUtils'

const baseTheme = {
  colors: {
    primary: '#111',
    lightPrimary: '#444',
    active: '#333',
    activeContrast: '#555',
    links: '#222',
    backgroundPage: '#fff'
  },
  images: {
    general: { homeHero: 'home.png', businessHero: 'biz.png' },
    categories: { categoryFood: 'food.png', categoryAll: 'all.png' },
    dummies: { product: 'dummy-product.png', businessLogo: 'dummy-logo.png' },
    logos: { logotype: 'logo.png' },
    deliveryTypes: { delivery: 'delivery.png', pickUp: 'pickup.png' }
  }
}

const orderingTheme = {
  theme: {
    my_products: {
      components: {
        theme_settings: {
          components: {
            style: {
              primary_btn_color: '#abc',
              primary_link_color: '#def',
              background_page: '#000'
            }
          }
        },
        images: {
          components: {
            logo: { components: { image: 'api-logo.png' } }
          }
        }
      }
    },
    homepage_view: {
      components: {
        homepage_header: { components: { image: 'api-home.png' } }
      }
    },
    business_listing_view: {
      components: {
        business_hero: { components: { image: 'api-biz-hero.png' } },
        not_found_source: { components: { image: 'api-not-found.png' } },
        categories: {
          components: {
            food: { image: 'api-food.png' },
            all: { image: 'api-all.png' }
          }
        }
      }
    },
    orders: {
      components: {
        active_orders: { components: { not_found_source: { components: { image: 'api-active.png' } } } },
        past_orders: { components: { not_found_source: { components: { image: 'api-past.png' } } } }
      }
    },
    no_internet: { components: { image: 'api-offline.png' } },
    business_view: {
      components: {
        header: {
          components: {
            dummy_image: 'api-dummy-header.png',
            logo: { dummy_image: 'api-dummy-logo.png' }
          }
        },
        products: {
          components: {
            photo: { components: { dummy_image: 'api-dummy-product.png' } }
          }
        }
      }
    },
    header: {
      components: {
        logo: { components: { image: 'api-header-logo.png' } }
      }
    },
    order_types: {
      components: {
        delivery: { components: { image: 'api-delivery.png' } },
        pickup: { components: { image: 'api-pickup.png' } }
      }
    }
  }
}

describe('themeUtils', () => {
  describe('getMergedColors', () => {
    it('returns base colors when ordering theme is missing', () => {
      expect(getMergedColors(baseTheme, null)).toEqual(baseTheme.colors)
      expect(getMergedColors(null, orderingTheme)).toEqual({})
    })

    it('merges API theme settings over base colors', () => {
      expect(getMergedColors(baseTheme, orderingTheme)).toEqual({
        primary: '#abc',
        lightPrimary: '#444',
        active: '#333',
        activeContrast: '#555',
        links: '#def',
        backgroundPage: '#000'
      })
    })
  })

  describe('getMergedGeneralImages', () => {
    it('falls back to base images when ordering theme is missing', () => {
      expect(getMergedGeneralImages(baseTheme, null)).toEqual(baseTheme.images.general)
    })

    it('merges API images over base general images', () => {
      const merged = getMergedGeneralImages(baseTheme, orderingTheme)
      expect(merged.homeHero).toBe('api-home.png')
      expect(merged.businessHero).toBe('api-biz-hero.png')
      expect(merged.notFound).toBe('api-not-found.png')
    })
  })

  describe('getMergedCategoryImages', () => {
    it('merges category images from API theme', () => {
      const merged = getMergedCategoryImages(baseTheme, orderingTheme)
      expect(merged.food).toBe('api-food.png')
      expect(merged.all).toBe('api-all.png')
    })
  })

  describe('getMergedDummyImages', () => {
    it('merges dummy images from API theme', () => {
      const merged = getMergedDummyImages(baseTheme, orderingTheme)
      expect(merged.businessHeader).toBe('api-dummy-header.png')
      expect(merged.businessLogo).toBe('api-dummy-logo.png')
      expect(merged.product).toBe('api-dummy-product.png')
    })
  })

  describe('getMergedLogoImages', () => {
    it('uses header logo for app and api logo for web', () => {
      const web = getMergedLogoImages(baseTheme, orderingTheme, { isApp: false })
      const app = getMergedLogoImages(baseTheme, orderingTheme, { isApp: true })
      expect(web.logotype).toBe('api-logo.png')
      expect(app.logotype).toBe('api-header-logo.png')
    })
  })

  describe('getMergedDeliveryTypeImages', () => {
    it('merges delivery type images from API theme', () => {
      const merged = getMergedDeliveryTypeImages(baseTheme, orderingTheme)
      expect(merged.delivery).toBe('api-delivery.png')
      expect(merged.pickup).toBe('api-pickup.png')
    })
  })

  describe('getMergedImages', () => {
    it('returns merged image groups', () => {
      const merged = getMergedImages(baseTheme, orderingTheme, { isApp: false })
      expect(merged.general.homeHero).toBe('api-home.png')
      expect(merged.logos.logotype).toBe('api-logo.png')
    })
  })

  describe('createMergedTheme', () => {
    it('returns empty object when base theme is missing', () => {
      expect(createMergedTheme(null, orderingTheme)).toEqual({})
    })

    it('returns base theme when ordering theme is missing', () => {
      expect(createMergedTheme(baseTheme, null)).toBe(baseTheme)
    })

    it('merges colors and images for web', () => {
      const merged = createMergedTheme(baseTheme, orderingTheme, { isApp: false })
      expect(merged.colors.primary).toBe('#abc')
      expect(merged.images.general.homeHero).toBe('api-home.png')
    })

    it('reuses the app primary colors for active states', () => {
      const merged = createMergedTheme(baseTheme, orderingTheme, { isApp: true })
      expect(merged.colors.primary).toBe('#111')
      expect(merged.colors.active).toBe('#111')
      expect(merged.colors.activeContrast).toBe('#444')
    })

    it('falls back to base theme images when API paths are missing', () => {
      const sparseTheme = {
        theme: {
          my_products: { components: {} },
          business_listing_view: { components: {} },
          orders: { components: {} },
          business_view: { components: {} },
          header: { components: {} },
          order_types: { components: {} }
        }
      }
      const merged = createMergedTheme(baseTheme, sparseTheme, { isApp: false })
      expect(merged.images.general.homeHero).toBe('home.png')
      expect(merged.images.deliveryTypes.delivery).toBe('delivery.png')
    })
  })
})
