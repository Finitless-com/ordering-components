import { ApiResponse } from './ApiResponse'
import { Ordering } from './Ordering'
import { RequestOptionsProps } from '../interfaces/RequestOptionsProps'
import { ApiBase, ApiBaseInterface } from './ApiBase'
import { Cart, CartProps } from '../models/Cart'

/**
 * Class to cart api control
 */
export class ApiCart extends ApiBase implements ApiBaseInterface {
  private cartId: number | string

  constructor (ordering: Ordering, cartId: number | string) {
    super(ordering)
    this.cartId = cartId
  }

  /**
   * Replace current modelId
   * @param id ID to replace current api modelId
   */
  setModelId (id: number) {
    this.cartId = id
  }

  /**
   * Get a cart if cartId is set else get all
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async get (options: RequestOptionsProps = {}) {
    if (this.cartId && this.conditions) {
      throw new Error('The `where` function is not compatible with carts(cartId). Example ordering.carts().where(contitions).get()')
    }
    const url = '/carts' + (this.cartId ? `/${this.cartId}` : '')
    const response: ApiResponse = await this.makeRequest('GET', url, undefined, Cart, options)
    return response
  }

  /**
   * Get a cart stores if cartId is set else get all
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async getBusinesses (options: RequestOptionsProps = {}) {
    if (!this.cartId) {
      throw new Error('The `cartId` is required to use ordering.carts(cartId).getBusinesses(options).')
    }
    const url = `/carts/${this.cartId}/businesses`
    const response: ApiResponse = await this.makeRequest('GET', url, undefined, Cart, options)
    return response
  }

  /**
   * Get offers available for a cart
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async getOffers (options: RequestOptionsProps = {}) {
    if (!this.cartId) {
      throw new Error('The `cartId` is required to use ordering.carts(cartId).getOffers(options).')
    }
    const url = `/carts/${this.cartId}/offers`
    const response: ApiResponse = await this.makeRequest('GET', url, undefined, null, options)
    return response
  }

  /**
   * set a cart if cartId is set else get all
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async set (data: any, options: RequestOptionsProps = {}) {
    if (!this.cartId) {
      throw new Error('The `cartId` is required to use ordering.carts(cartId).confirm(options).')
    }
    const url = `/carts/${this.cartId}`
    const response: ApiResponse = await this.makeRequest('PUT', url, data, Cart, options)
    return response
  }

  /**
   * Update a cart if cartId is set else create cart
   * @param {CartProps} cart Attributes to create or update cart
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async save (cart: CartProps, options: RequestOptionsProps = {}) {
    if (true) {
      throw new Error('ordering.carts(cartId?).save() is not implemented.')
    }
    const url = '/carts' + (this.cartId ? `/${this.cartId}` : '')
    const response: ApiResponse = await this.makeRequest(this.cartId ? 'PUT' : 'POST', url, cart, Cart, options)
    const { content: { error, result } } = response
    if (!error && !this.cartId) {
      this.cartId = result.id
    }
    return response
  }

  /**
   * Delete a cart by cartId
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async delete (options: RequestOptionsProps = {}) {
    if (true) {
      throw new Error('ordering.carts(cartId).delete() is not implemented.')
    }
    if (!this.cartId) {
      throw new Error('`cartId` is require to delete. Example: ordering.carts(cartId).delete()')
    }
    const url = `/carts/${this.cartId}`
    const response: ApiResponse = await this.makeRequest('DELETE', url, undefined, null, options)
    return response
  }

  /**
   * Add producto to cart if cartId
   * @param {any} product Product to add
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async addProduct (product: any, options: RequestOptionsProps = {}) {
    const url = '/carts/add_product'
    const response: ApiResponse = await this.makeRequest('POST', url, product, Cart, options)
    return response
  }

  /**
   * Remove producto to cart if cartId
   * @param {any} product Product to remove
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async removeProduct (product: any, options: RequestOptionsProps = {}) {
    const url = '/carts/remove_product'
    const response: ApiResponse = await this.makeRequest('POST', url, product, Cart, options)
    return response
  }

  /**
   * Update producto to cart if cartId
   * @param {any} product Product to update
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async updateProduct (product: any, options: RequestOptionsProps = {}) {
    const url = '/carts/update_product'
    const response: ApiResponse = await this.makeRequest('POST', url, product, Cart, options)
    return response
  }

  /**
   * Update coupon to cart if cartId
   * @param {any} coupon Coupon
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async applyCoupon (coupon: any, options: RequestOptionsProps = {}) {
    const url = '/carts/apply_coupon'
    const response: ApiResponse = await this.makeRequest('POST', url, coupon, Cart, options)
    return response
  }

  /**
   * Update coupon to cart if cartId
   * @param {any} coupon Coupon
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async changeDriverTip (driverTip: any, options: RequestOptionsProps = {}) {
    const url = '/carts/change_driver_tip'
    const response: ApiResponse = await this.makeRequest('POST', url, driverTip, Cart, options)
    return response
  }

  /**
   * Update payment method to cart
   * @param {any} paymethod request data
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async changePaymethod (paymethod: any, options: RequestOptionsProps = {}) {
    const url = '/carts/change_paymethod'
    const response: ApiResponse = await this.makeRequest('POST', url, paymethod, Cart, options)
    return response
  }

  /**
   * Place cart to cart if cartId
   * @param {any} placeData Place data
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async place (placeData: any, options: RequestOptionsProps = {}) {
    if (!this.cartId) {
      throw new Error('The `cartId` is required to use ordering.carts(cartId).place(data, options).')
    }
    const url = `/carts/${this.cartId}/place`
    const response: ApiResponse = await this.makeRequest('POST', url, placeData, Cart, options)
    return response
  }

  /**
   * Confirm cart to cart if cartId
   * @param {RequestOptionsProps} options Params, headers and other options
   */
  async confirm (options: RequestOptionsProps = {}) {
    if (!this.cartId) {
      throw new Error('The `cartId` is required to use ordering.carts(cartId).confirm(options).')
    }
    const url = `/carts/${this.cartId}/confirm`
    const response: ApiResponse = await this.makeRequest('POST', url, {}, Cart, options)
    return response
  }

  /**
   * Confirm cart to cart if cartId and has payload
   * @param {any} confirmData Confirm data
   * @param {RequestOptionsProps} options Params, headers and other options
   */
   async confirmWithData (confirmData: any, options: RequestOptionsProps = {}) {
    if (!this.cartId) {
      throw new Error('The `cartId` is required to use ordering.carts(cartId).confirmWithData(data, options).')
    }
    const url = `/carts/${this.cartId}/confirm`
    const response: ApiResponse = await this.makeRequest('POST', url, confirmData, Cart, options)
    return response
  }
}
