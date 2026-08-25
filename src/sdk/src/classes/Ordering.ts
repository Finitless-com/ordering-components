import { ApiResponse } from './ApiResponse'
import { ApiLanguage } from './ApiLanguage'
import { RequestOptionsProps } from '../interfaces/RequestOptionsProps'
import { ApiSystem } from './ApiSystem'
import { ApiUser } from './ApiUser'
import { ApiValidationField } from './ApiValidationField'
import { ApiOrder } from './ApiOrder'
import { ApiControls } from './ApiControls'
import { ApiBusiness } from './ApiBusiness'
import { ApiDriversGroups } from './ApiDriversGroups'
import { ApiConfig } from './ApiConfig'
import { ApiTranslation } from './ApiTranslation'
import { ApiPage } from './ApiPage'
import { ApiCountry } from './ApiCountry'
import { ApiOrderOption } from './ApiOrderOption'
import { ApiCart } from './ApiCart'
import { ApiPaymentCards } from './ApiPaymentCards'

const stripTrailingSlashes = (url: string) => typeof url === 'string' ? url.replace(/\/+$/, '') : url

const joinUrl = (root: string, path: string) => `${stripTrailingSlashes(root)}/${String(path ?? '').replace(/^\/+/, '')}`

interface SettingProps {
  url?: string
  version?: string
  project?: string
  language?: string
  accessToken?: string | null
  apiKey?: string | null
  appId?: string | null
  appInternalName?: string | null
  billing?: string | null
  countryCode?: string | null
}

export class Ordering {
  private url: string
  private version: string
  private project: string
  private language: string
  private accessToken: string | null
  private apiKey: string | null
  private appId: string | null
  private billing: string | null
  private countryCode: string | null
  private appInternalName: string | null
  constructor ({
    url = 'https://apiv4.ordering.co',
    version = 'v400',
    project = 'demo',
    language = 'en',
    accessToken = null,
    apiKey = null,
    appId = null,
    billing = null,
    countryCode = null,
    appInternalName = null
  }: SettingProps = {}) {
    this.url = stripTrailingSlashes(url)
    this.version = version
    this.project = project
    this.language = language
    this.accessToken = accessToken
    this.apiKey = apiKey
    this.appId = appId
    this.billing = billing
    this.countryCode = countryCode
    this.appInternalName = appInternalName
  }

  get root () {
    return `${this.url}/${this.version}/${this.language}/${this.project}`
  }

  get systemRoot () {
    return `${this.url}/${this.version}`
  }

  get billingUrl () {
    return this.billing
  }

  get countryCodeValue () {
    return this.countryCode
  }

  setAccessToken (accessToken: string) {
    this.accessToken = accessToken
    return this
  }

  setApiKey (apiKey: string) {
    this.apiKey = apiKey
    return this
  }

  setAppId (appId: string) {
    this.appId = appId
    return this
  }

  setAppInternalName (appInternalName: string) {
    this.appInternalName = appInternalName
    return this
  }

  setUrl (url: string) {
    this.url = stripTrailingSlashes(url)
    return this
  }

  setProject (project: string) {
    this.project = project
    return this
  }

  setVersion (version: string) {
    this.version = version
    return this
  }

  setLanguage (language: string) {
    this.language = language
    return this
  }

  setBilling (billing: string) {
    this.billing = billing
    return this
  }

  setCountryCode (countryCode: string) {
    this.countryCode = countryCode
    return this
  }

  users (userId: number | null = null) {
    return new ApiUser(this, userId)
  }

  orders (orderId: number | null = null) {
    return new ApiOrder(this, orderId)
  }

  controls (orderId: number | null = null) {
    return new ApiControls(this, orderId)
  }

  driversgroups () {
    return new ApiDriversGroups(this)
  }

  configs (configId: number | null = null) {
    return new ApiConfig(this, configId)
  }

  businesses (businessId: number | string) {
    return new ApiBusiness(this, businessId)
  }

  validationFields (fieldId: number) {
    return new ApiValidationField(this, fieldId)
  }

  languages (languageId: number) {
    return new ApiLanguage(this, languageId)
  }

  translations (translationId: number) {
    return new ApiTranslation(this, translationId)
  }

  pages (pageId: number) {
    return new ApiPage(this, pageId)
  }

  countries (countryId: number) {
    return new ApiCountry(this, countryId)
  }

  orderOptions (orderOptionId: number) {
    return new ApiOrderOption(this, orderOptionId)
  }

  carts (cartId: number | string) {
    return new ApiCart(this, cartId)
  }

  paymentCards (bussinessId: number | string, userId: number | string, cardId: number | string) {
    return new ApiPaymentCards(this, bussinessId, userId, cardId)
  }

  system () {
    return new ApiSystem(this)
  }

  getRequestProps (options: RequestOptionsProps): [string, any] {
    const root: string = options.system ? this.systemRoot : this.root
    const { query, mode, conditions, headers, accessToken: requestAccessToken, ...otherOptions } = options
    /**
     * Parse query
     */
    const _query = query || {}
    if (_query && Object.keys(_query).length > 0) {
      for (const key in _query) {
        _query[key] = typeof _query[key] === 'object' ? JSON.stringify(_query[key]) : _query[key]
      }
    }

    /**
     * Parse params from options and select attributes
     */
    let params: string [] = _query?.params?.split(',') || []
    params = params.concat(options.attributes || [])
    if (params.length > 0) {
      _query.params = params.join(',')
    }
    /**
     * Parse conditions to filter api data
     */
    if (conditions) {
      _query.where = typeof conditions === 'object' ? JSON.stringify(conditions) : conditions
    }
    /**
     * Parse conditions to filter api data
     */
    if (mode) {
      _query.mode = options.mode
    }
    /**
     * Parse headers from options and default
     */
    const authHeaders: any = {}
    const token = requestAccessToken || this.accessToken
    if (token && !this.apiKey) {
      authHeaders.Authorization = `Bearer ${token}`
    }
    if (this.apiKey) {
      authHeaders['X-Api-Key'] = this.apiKey
    }
    if (this.appId) {
      authHeaders['X-APP-X'] = this.appId
    }
    if (this.appInternalName) {
      authHeaders['X-INTERNAL-PRODUCT-X'] = this.appInternalName
    }
    if (this.countryCode) {
      authHeaders['X-Country-Code-X'] = this.countryCode
    }
    /**
     * Create Option Request
     */
    const _options: any = {
      ...otherOptions,
      // validateStatus: status => status < 500,
      params: _query || {},
      headers: Object.assign(authHeaders, headers || {})
    }

    return [root, _options]
  }

  makeRequest (method: string, url: string, data: any, options: any) {
    const promise = new Promise(function (resolve, reject) {
      const xhr = new window.XMLHttpRequest()

      /**
       * Parse query to request
       */
      const query = Object.entries(options.params || {}).map((entry: any) => {
        return `${entry[0]}=${entry[1]}`
      }).join('&')
      xhr.open(method, url + (query ? `?${query}` : ''))
      /**
       * Add headers to request
       */
      Object.entries(options.headers || {}).forEach((entry: any) => {
        xhr.setRequestHeader(entry[0], entry[1])
      })
      /**
       * Create cancel request
       */
      if (options.cancelToken && typeof options.cancelToken === 'object') {
        options.cancelToken.cancel = () => {
          xhr.abort()
        }
      }
      xhr.onload = function () {
        if (this.status < 500) {
          const data = options.json ? JSON.parse(this.response) : this.response
          resolve({
            request: this,
            data,
            status: this.status,
            statusText: this.statusText
          })
        } else {
          reject(new Error('Internal error'))
        }
      }
      xhr.onerror = function (err) {
        reject(err)
      }
      if (options.json) {
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.send(data ? JSON.stringify(data) : null)
      } else {
        xhr.send()
      }
    })

    return promise
  }

  async get (path: string, options: RequestOptionsProps = { CastClass: null, json: true, system: false }) {
    const [root, reqOptions] = this.getRequestProps(options)

    const response = await this.makeRequest('GET', joinUrl(root, path), null, reqOptions)

    return new ApiResponse(response, options, options.api)
  }

  async post (path: string, data: any = {}, options: RequestOptionsProps = { CastClass: null, json: true, system: false }) {
    const [root, reqOptions] = this.getRequestProps(options)

    if (options.json) {
      for (const key in data) {
        if (data[key] !== null && typeof data[key] === 'object') {
          data[key] = JSON.stringify(data[key])
        }
      }
    }

    const response = await this.makeRequest('POST', joinUrl(root, path), data, reqOptions)
    return new ApiResponse(response, options, options.api)
  }

  async put (path: string, data: any = {}, options: RequestOptionsProps = { CastClass: null, json: true, system: false }) {
    const [root, reqOptions] = this.getRequestProps(options)

    if (options.json) {
      for (const key in data) {
        if (data[key] !== null && typeof data[key] === 'object') {
          data[key] = JSON.stringify(data[key])
        }
      }
    }

    const response = await this.makeRequest('PUT', joinUrl(root, path), data, reqOptions)
    return new ApiResponse(response, options, options.api)
  }

  async delete (path: string, options: RequestOptionsProps = { CastClass: null, json: true, system: false }) {
    const [root, reqOptions] = this.getRequestProps(options)

    const response = await this.makeRequest('DELETE', joinUrl(root, path), null, reqOptions)
    return new ApiResponse(response, options, options.api)
  }
}
