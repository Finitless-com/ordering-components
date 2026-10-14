import { ApiResponse } from "./ApiResponse";
import { Ordering } from "./Ordering";
import { RequestOptionsProps } from "../interfaces/RequestOptionsProps";
import { ApiBase, ApiBaseInterface } from "./ApiBase";
import { PaymentCards, PaymentCardsProps } from "../models/PaymentCards";
export class ApiPaymentCards extends ApiBase implements ApiBaseInterface {
  public businessId: number | string;
  public userId: number | string;
  public card_id: number | string | null;
  public gateway: string;

  constructor(
    ordering: Ordering,
    bussinessId: number | string,
    userId: number | string,
    card_id: number | string | null = null,
    gateway: string = "stripe"
  ) {
    super(ordering);
    this.ordering = ordering;
    this.businessId = bussinessId;
    this.userId = userId;
    this.card_id = card_id;
    // Gateway segment of the url. Only a single path segment is accepted; anything else stays on `stripe`.
    this.gateway = typeof gateway === "string" && /^[a-z0-9_]+$/.test(gateway) ? gateway : "stripe";
  }

  /**
   * Replace current modelId
   * @param id ID to replace current api modelId
   */
  setModelId(id: number) {
    this.businessId = id;
  }

  async get(options: RequestOptionsProps = {}) {
    if (!this.businessId || !this.userId) {
      throw new Error(
        "You must provide the `businessId` and `userId` param. Example ordering.paymentCards(businessId,userId).get()"
      );
    }
    const url = `/payments/${this.gateway}/cards?business_id=${this.businessId}&user_id=${this.userId}`;
    const response: ApiResponse = await this.makeRequest(
      "GET",
      url,
      undefined,
      PaymentCards,
      options
    );
    return response;
  }

  async save(cards: PaymentCardsProps, options: RequestOptionsProps = {}) {
    if (true) {
      throw new Error(
        "ordering.paymentCards(businessId,userId).save(card) is not implemented."
      );
    }
    if (!this.businessId || !this.userId) {
      throw new Error(
        "You must provide the `businessId` and `userId` param. Example ordering.paymentCards(businessId,userId).get()"
      );
    }
    const url = `/payments/${this.gateway}/cards/${this.businessId}/${this.userId}`;
    const response: ApiResponse = await this.makeRequest(
      "POST",
      url,
      cards,
      PaymentCards,
      options
    );
    return response;
  }

  async delete(options: RequestOptionsProps = {}) {
    if (!this.card_id || !this.businessId || !this.userId) {
      throw new Error(
        "You must provide the `businessId`, `userId`, `cardId` param. Example ordering.paymentCards(businessId,userId,cardId).delete()"
      );
    }
    const url = `/payments/${this.gateway}/cards?business_id=${this.businessId}&user_id=${this.userId}&card_id=${this.card_id}`;

    const response: ApiResponse = await this.makeRequest(
      "DELETE",
      url,
      undefined,
      PaymentCards,
      options
    );
    return response;
  }

  async getCredentials(options: RequestOptionsProps = {}) {
    const url = `/payments/${this.gateway}/credentials`;
    const response: ApiResponse = await this.makeRequest(
      "GET",
      url,
      undefined,
      PaymentCards,
      options
    );

    return response;
  }
}
