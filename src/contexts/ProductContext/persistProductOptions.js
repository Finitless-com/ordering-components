export const PRODUCT_OPTIONS_STORAGE_KEY = 'product_options'

export const persistProductOptions = (options, storage = window.localStorage) => {
  storage.setItem(PRODUCT_OPTIONS_STORAGE_KEY, JSON.stringify(options))
}
