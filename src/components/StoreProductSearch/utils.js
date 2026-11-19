/**
 * Helpers of StoreProductSearch (lists the products of a business across its categories).
 */

/** Largest page the API serves (api-core config ordering.pagination.max_page_size). */
export const MAX_PAGE_SIZE = 50

/** Most products one PUT /bulks/products accepts (ProductBulkController::update). */
export const BULK_UPDATE_LIMIT = 500

const pad = (value) => String(value).padStart(2, '0')

/**
 * Date as the API reads and writes dates (`Y-m-d H:i:s`, UTC: api-core runs on UTC).
 * @param {Date|number|string} date
 */
export const formatApiDateTime = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

/**
 * Milliseconds of a `snooze_until` of the API (`Y-m-d H:i:s` in UTC, or an ISO string), NaN if not a date.
 */
export const parseApiDateTime = (value) => {
  if (!value || typeof value !== 'string') return NaN
  const text = value.trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return Date.parse(`${text.replace(' ', 'T')}Z`)
  }
  return Date.parse(text)
}

/**
 * A product is unavailable when it is turned off, or paused until a date that has not come yet.
 * Same rule as the `unavailable` filter of the list (`enabled = false` OR `snooze_until > now`).
 * @param {object} product
 * @param {Date|number} now
 */
export const isProductUnavailable = (product, now = new Date()) => {
  if (!product) return false
  if (product.enabled === false || product.enabled === 0 || product.enabled === '0') return true
  const snoozeUntil = parseApiDateTime(product.snooze_until)
  return !Number.isNaN(snoozeUntil) && snoozeUntil > new Date(now).getTime()
}

/**
 * `where` of GET /business/{id}/products (the grammar of the API: a root node with `conditions` and `conector`).
 * Returns null when there is nothing to filter by.
 * @param {object} options
 * @param {string} options.search text to find in the name and/or the description
 * @param {boolean} options.unavailableOnly `enabled = false` OR `snooze_until > now`
 * @param {Date|number|string} options.now
 * @param {boolean} options.isIos iOS sends the text as it is; the others `encodeURI` it (as the other lists do)
 * @param {boolean} options.searchByName
 * @param {boolean} options.searchByDescription
 */
export const buildProductsWhere = ({
  search,
  unavailableOnly,
  now = new Date(),
  isIos,
  searchByName = true,
  searchByDescription = true
} = {}) => {
  const conditions = []
  const text = typeof search === 'string' ? search.trim() : ''
  if (text) {
    const pattern = `%${text}%`
    const value = isIos ? pattern : encodeURI(pattern)
    const searchConditions = []
    if (searchByName) searchConditions.push({ attribute: 'name', value: { condition: 'ilike', value } })
    if (searchByDescription) searchConditions.push({ attribute: 'description', value: { condition: 'ilike', value } })
    if (searchConditions.length) conditions.push({ conector: 'OR', conditions: searchConditions })
  }
  if (unavailableOnly) {
    conditions.push({
      conector: 'OR',
      conditions: [
        { attribute: 'enabled', value: false },
        { attribute: 'snooze_until', value: { condition: '>', value: formatApiDateTime(now) } }
      ]
    })
  }
  return conditions.length ? { conditions, conector: 'AND' } : null
}
