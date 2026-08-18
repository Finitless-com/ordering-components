import { ApiResponse } from './ApiResponse';
import { Ordering } from './Ordering';
import { RequestOptionsProps } from '../interfaces/RequestOptionsProps';
import { ApiBase, ApiBaseInterface } from './ApiBase';
import { CartProps } from '../models/Cart';
/**
 * Class to cart api control
 */
export declare class ApiCart extends ApiBase implements ApiBaseInterface {
    private cartId;
    constructor(ordering: Ordering, cartId: number | string);
    /**
     * Replace current modelId
     * @param id ID to replace current api modelId
     */
    setModelId(id: number): void;
    /**
     * Get a cart if cartId is set else get all
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    get(options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Get a cart stores if cartId is set else get all
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    getBusinesses(options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Get offers available for a cart
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    getOffers(options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * set a cart if cartId is set else get all
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    set(data: any, options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Update a cart if cartId is set else create cart
     * @param {CartProps} cart Attributes to create or update cart
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    save(cart: CartProps, options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Delete a cart by cartId
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    delete(options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Add producto to cart if cartId
     * @param {any} product Product to add
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    addProduct(product: any, options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Remove producto to cart if cartId
     * @param {any} product Product to remove
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    removeProduct(product: any, options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Update producto to cart if cartId
     * @param {any} product Product to update
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    updateProduct(product: any, options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Update coupon to cart if cartId
     * @param {any} coupon Coupon
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    applyCoupon(coupon: any, options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Update coupon to cart if cartId
     * @param {any} coupon Coupon
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    changeDriverTip(driverTip: any, options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Update payment method to cart
     * @param {any} paymethod request data
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    changePaymethod(paymethod: any, options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Place cart to cart if cartId
     * @param {any} placeData Place data
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    place(placeData: any, options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Confirm cart to cart if cartId
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    confirm(options?: RequestOptionsProps): Promise<ApiResponse>;
    /**
     * Confirm cart to cart if cartId and has payload
     * @param {any} confirmData Confirm data
     * @param {RequestOptionsProps} options Params, headers and other options
     */
    confirmWithData(confirmData: any, options?: RequestOptionsProps): Promise<ApiResponse>;
}
