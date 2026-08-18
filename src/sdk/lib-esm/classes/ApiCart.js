import { ApiBase } from './ApiBase'
import { Cart } from '../models/Cart'
const __extends = (this && this.__extends) || (function () {
  let extendStatics = function (d, b) {
    extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b }) ||
            function (d, b) { for (const p in b) if (b.hasOwnProperty(p)) d[p] = b[p] }
    return extendStatics(d, b)
  }
  return function (d, b) {
    extendStatics(d, b)
    function __ () { this.constructor = d }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __())
  }
})()
const __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
  function adopt (value) { return value instanceof P ? value : new P(function (resolve) { resolve(value) }) }
  return new (P || (P = Promise))(function (resolve, reject) {
    function fulfilled (value) { try { step(generator.next(value)) } catch (e) { reject(e) } }
    function rejected (value) { try { step(generator.throw(value)) } catch (e) { reject(e) } }
    function step (result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected) }
    step((generator = generator.apply(thisArg, _arguments || [])).next())
  })
}
const __generator = (this && this.__generator) || function (thisArg, body) {
  let _ = { label: 0, sent: function () { if (t[0] & 1) throw t[1]; return t[1] }, trys: [], ops: [] }; let f; let y; let t; let g
  return g = { next: verb(0), throw: verb(1), return: verb(2) }, typeof Symbol === 'function' && (g[Symbol.iterator] = function () { return this }), g
  function verb (n) { return function (v) { return step([n, v]) } }
  function step (op) {
    if (f) throw new TypeError('Generator is already executing.')
    while (_) {
      try {
        if (f = 1, y && (t = op[0] & 2 ? y.return : op[0] ? y.throw || ((t = y.return) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t
        if (y = 0, t) op = [op[0] & 2, t.value]
        switch (op[0]) {
          case 0: case 1: t = op; break
          case 4: _.label++; return { value: op[1], done: false }
          case 5: _.label++; y = op[1]; op = [0]; continue
          case 7: op = _.ops.pop(); _.trys.pop(); continue
          default:
            if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue }
            if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break }
            if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break }
            if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break }
            if (t[2]) _.ops.pop()
            _.trys.pop(); continue
        }
        op = body.call(thisArg, _)
      } catch (e) { op = [6, e]; y = 0 } finally { f = t = 0 }
    }
    if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true }
  }
}
/**
 * Class to cart api control
 */
const ApiCart = /** @class */ (function (_super) {
  __extends(ApiCart, _super)
  function ApiCart (ordering, cartId) {
    const _this = _super.call(this, ordering) || this
    _this.cartId = cartId
    return _this
  }
  /**
     * Replace current modelId
     * @param id ID to replace current api modelId
     */
  ApiCart.prototype.setModelId = function (id) {
    this.cartId = id
  }
  /**
     * Get a cart if cartId is set else get all
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.get = function (options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            if (this.cartId && this.conditions) {
              throw new Error('The `where` function is not compatible with carts(cartId). Example ordering.carts().where(contitions).get()')
            }
            url = '/carts' + (this.cartId ? '/' + this.cartId : '')
            return [4 /* yield */, this.makeRequest('GET', url, undefined, Cart, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Get a cart stores if cartId is set else get all
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.getBusinesses = function (options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            if (!this.cartId) {
              throw new Error('The `cartId` is required to use ordering.carts(cartId).getBusinesses(options).')
            }
            url = '/carts/' + this.cartId + '/businesses'
            return [4 /* yield */, this.makeRequest('GET', url, undefined, Cart, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Get offers available for a cart
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.getOffers = function (options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            if (!this.cartId) {
              throw new Error('The `cartId` is required to use ordering.carts(cartId).getOffers(options).')
            }
            url = '/carts/' + this.cartId + '/offers'
            return [4 /* yield */, this.makeRequest('GET', url, undefined, null, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * set a cart if cartId is set else get all
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.set = function (data, options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            if (!this.cartId) {
              throw new Error('The `cartId` is required to use ordering.carts(cartId).confirm(options).')
            }
            url = '/carts/' + this.cartId
            return [4 /* yield */, this.makeRequest('PUT', url, data, Cart, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Update a cart if cartId is set else create cart
     * @param {CartProps} cart Attributes to create or update cart
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.save = function (cart, options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response, _a, error, result
      return __generator(this, function (_b) {
        switch (_b.label) {
          case 0:
            // eslint-disable-next-line no-constant-condition
            if (true) {
              throw new Error('ordering.carts(cartId?).save() is not implemented.')
            }
            url = '/carts' + (this.cartId ? '/' + this.cartId : '')
            return [4 /* yield */, this.makeRequest(this.cartId ? 'PUT' : 'POST', url, cart, Cart, options)]
          case 1:
            response = _b.sent()
            _a = response.content, error = _a.error, result = _a.result
            if (!error && !this.cartId) {
              this.cartId = result.id
            }
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Delete a cart by cartId
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.delete = function (options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            // eslint-disable-next-line no-constant-condition
            if (true) {
              throw new Error('ordering.carts(cartId).delete() is not implemented.')
            }
            if (!this.cartId) {
              throw new Error('`cartId` is require to delete. Example: ordering.carts(cartId).delete()')
            }
            url = '/carts/' + this.cartId
            return [4 /* yield */, this.makeRequest('DELETE', url, undefined, null, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Add producto to cart if cartId
     * @param {any} product Product to add
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.addProduct = function (product, options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            url = '/carts/add_product'
            return [4 /* yield */, this.makeRequest('POST', url, product, Cart, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Remove producto to cart if cartId
     * @param {any} product Product to remove
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.removeProduct = function (product, options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            url = '/carts/remove_product'
            return [4 /* yield */, this.makeRequest('POST', url, product, Cart, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Update producto to cart if cartId
     * @param {any} product Product to update
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.updateProduct = function (product, options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            url = '/carts/update_product'
            return [4 /* yield */, this.makeRequest('POST', url, product, Cart, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Update coupon to cart if cartId
     * @param {any} coupon Coupon
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.applyCoupon = function (coupon, options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            url = '/carts/apply_coupon'
            return [4 /* yield */, this.makeRequest('POST', url, coupon, Cart, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Update coupon to cart if cartId
     * @param {any} coupon Coupon
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.changeDriverTip = function (driverTip, options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            url = '/carts/change_driver_tip'
            return [4 /* yield */, this.makeRequest('POST', url, driverTip, Cart, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Update payment method to cart
     * @param {any} paymethod request data
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.changePaymethod = function (paymethod, options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            url = '/carts/change_paymethod'
            return [4 /* yield */, this.makeRequest('POST', url, paymethod, Cart, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Place cart to cart if cartId
     * @param {any} placeData Place data
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.place = function (placeData, options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            if (!this.cartId) {
              throw new Error('The `cartId` is required to use ordering.carts(cartId).place(data, options).')
            }
            url = '/carts/' + this.cartId + '/place'
            return [4 /* yield */, this.makeRequest('POST', url, placeData, Cart, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Confirm cart to cart if cartId
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.confirm = function (options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            if (!this.cartId) {
              throw new Error('The `cartId` is required to use ordering.carts(cartId).confirm(options).')
            }
            url = '/carts/' + this.cartId + '/confirm'
            return [4 /* yield */, this.makeRequest('POST', url, {}, Cart, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  /**
     * Confirm cart to cart if cartId and has payload
     * @param {any} confirmData Confirm data
     * @param {RequestOptionsProps} options Params, headers and other options
     */
  ApiCart.prototype.confirmWithData = function (confirmData, options) {
    if (options === void 0) { options = {} }
    return __awaiter(this, void 0, void 0, function () {
      let url, response
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            if (!this.cartId) {
              throw new Error('The `cartId` is required to use ordering.carts(cartId).confirmWithData(data, options).')
            }
            url = '/carts/' + this.cartId + '/confirm'
            return [4 /* yield */, this.makeRequest('POST', url, confirmData, Cart, options)]
          case 1:
            response = _a.sent()
            return [2 /* return */, response]
        }
      })
    })
  }
  return ApiCart
}(ApiBase))
export { ApiCart }
// # sourceMappingURL=ApiCart.js.map
