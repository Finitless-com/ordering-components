import { ApiResponse } from "./ApiResponse";
import { Ordering } from "./Ordering";
import { RequestOptionsProps } from "../interfaces/RequestOptionsProps";
import { ApiBase, ApiBaseInterface } from "./ApiBase";
import { PaymentCardsProps } from "../models/PaymentCards";
export declare class ApiPaymentCards extends ApiBase implements ApiBaseInterface {
    businessId: number | string;
    userId: number | string;
    card_id: number | string;
    gateway: string;
    constructor(ordering: Ordering, bussinessId: number | string, userId: number | string, card_id?: number | string, gateway?: string);
    /**
     * Replace current modelId
     * @param id ID to replace current api modelId
     */
    setModelId(id: number): void;
    get(options?: RequestOptionsProps): Promise<ApiResponse>;
    save(cards: PaymentCardsProps, options?: RequestOptionsProps): Promise<ApiResponse>;
    delete(options?: RequestOptionsProps): Promise<ApiResponse>;
    getCredentials(options?: RequestOptionsProps): Promise<ApiResponse>;
}
