# CI / coverage plan — ordering-components (ORD-1084)

Shared logic submodule consumed by website-marketplace-v26, ordering-app-marketplace-v26, ordering-app-business-v26, and ordering-app-driver-26.

Coverage gate: `(statements + branches + functions + lines) / 4 >= 70%` on the **scoped include** in `vitest.config.js` (expanded batch-by-batch until **full repo surface** is included).

> **Ship rule (locked):** ORD-1084 is complete only when **all** testable units from [TEST_BATCH_REGISTRY.md](./TEST_BATCH_REGISTRY.md) are in `coverage.include` **and** the average is still ≥70%. Interim 70% on ~41 files is a batch checkpoint, **not** done.

> **Today:** ~183 gated path patterns ≈ **87%** of ~210 units. Marketplace **118/118**; dashboard **27/27** ✅. See [TEST_BATCH_REGISTRY.md](./TEST_BATCH_REGISTRY.md).

## Live progress (updated 2026-07-13)

**Overall issue progress: ~82%**

| Phase | Work | Status |
|-------|------|--------|
| 3.1 | Vitest + jsdom harness + scripts | done |
| 3.2 | `.github/workflows/ci.yml` | done |
| 3.3 foundation | Batches 1–6: utils, SDK core, 2 contexts, 7 controllers | done |
| 3.3 batch 7 | Pass-through controllers (10) | done |
| 3.3 batch 8 | Auth forms (8 controllers) | done |
| 3.3 batch 9 | Social / OAuth login (6 controllers) | done |
| 3.3 batch 10 | Address & phone (5 controllers) | done |
| 3.3 batch 11 | Business discovery (10 controllers) | done |
| 3.3 batch 12 | Menu & product listing (8 controllers) | done |
| 3.3 batch 13 | Product detail & options (9 controllers) | done |
| 3.3 batch 14 | Cart & checkout (8 controllers) | done |
| 3.3 batch 15 | Payment methods (12 controllers) | done |
| 3.3 batch 16 | Orders customer (12 controllers) | done |
| 3.3 batch 17 | Driver, messages, map (9 controllers) | done |
| 3.3 batch 18 | Analytics, CMS, promos (10 controllers) | done |
| 3.3 batch D1 | Dashboard orders — 7 `OrdersDashboardComponents` | done |
| 3.3 batch D2 | Dashboard users/drivers/messages — 7 `OrdersDashboardComponents` | done |
| 3.3 batch D4 | Dashboard logistics/appointments/reviews — 6 `OrdersDashboardComponents` | done |
| 3.3 remaining | S7–S10 SDK, C7–C12 contexts, H1 hooks | **next** |
| 3.4 | Branch protection docs + consumer submodule pin docs | done |
| 3.5 | Review → PR → merge `main` → promote `production` | pending |

**Next session:** [Batch S7](./TEST_BATCH_REGISTRY.md) — SDK API classes (first SDK batch)

## Surface coverage (honest)

| Metric | Value |
|--------|-------|
| Gated path patterns (`coverage.include`) | **162** |
| Gate surface % (of ~210 units) | **~77%** |
| Scoped average (gated files only) | **70.30%** |
| Tests passing | **670** (42 files) |
| Branches (weakest metric) | **60.33%** |

## Session roadmap (remaining work)

| Priority | Batch | Scope | Controllers / units | Est. sessions |
|----------|-------|-------|---------------------|---------------|
| 1 | **S7–S10** | SDK API classes | 18 classes | 4 |
| 2 | **S7–S10** | SDK API classes | 18 classes | 4 |
| 3 | **C7–C12** | Web contexts | 15 contexts | 6 |
| 4 | **H1** | Hooks | 5 hooks | 1 |

**D1–D4 done:** all 27 dashboard controllers in gate.

## Foundation batches (done) — summary

- Batch 1: `utils`, `constants`, `webStrategy`
- Batch 2–5: SDK models/classes (partial), `xhrMock`, `mockOrdering`
- Batch 3: `ToastContext`, `EventContext`
- Batch 4–7: controllers smoke + pass-through batch (17 total in gate)
- Batch 8: auth forms — `LoginForm`, `SignupForm`, `ForgotPasswordForm`, `ResetPassword`, `LoginGuest`, `Sessions`, `UserVerification`, `QueryLoginSpoonity`
- Batch 9: social/OAuth — `GoogleLoginButton`, `FacebookLoginButton`, `AppleLogin`, `FirebaseGoogleLoginButton`, `GoogleIdentity`, `ReCaptcha`
- Batch 10: address & phone — `AddressForm`, `AddressList`, `AddressDetails`, `PhoneAutocomplete`, `GoogleAutocompleteInput`
- Batch 11: business discovery — `BusinessList`, `BusinessSearchList`, `BusinessController`, `BusinessInformation`, `BusinessBasicInformation`, `BusinessTypeFilter`, `BusinessSortControl`, `SingleBusinessCard`, `BusinessesMap`, `LocationsMap`
- Batch 12: menu & product listing — `BusinessMenuListing`, `BusinessProductsCategories`, `BusinessProductsSearch`, `ProductsList`, `ProductsListing`, `StoreProductList`, `BusinessAndProductList`, `MenuControl`
- Batch 13: product detail & options — `ProductComponent`, `ProductForm`, `ProductOption`, `ProductOptionSuboption`, `ProductIngredient`, `ProductItemAccordion`, `SingleProductCard`, `ReviewProduct`, `ProductImages`
- Batch 14: cart & checkout — `Cart`, `Checkout`, `MultiCheckout`, `MultiCartCreate`, `MultiCartsPaymethodsAndWallets`, `CartStoresListing`, `CouponControl`, `UpsellingPage`
- Batch 15: payment methods — `PaymentOptions`, `PaymentOptionCash`, `PaymentOptionStripe`, `PaymentOptionStripeDirect`, `PaymentOptionStripeLink`, `PaymentOptionStripeRedirect`, `PaymentOptionPaypal`, `PaymentOptionSquare`, `PaymentOptionWallet`, `PaymethodList`, `StripeElementsForm`, `WalletList`
- Batch 16: orders (customer) — `OrderList`, `OrderListGroups`, `OrderDetails`, `OrderVerticalList`, `OrderChange`, `OrderReview`, `MyOrders`, `MyOrdersList`, `SingleOrderCard`, `NewOrderNotification`, `MultiOrdersDetails`, `OrdersControlFilters`
- Batch 17: driver, messages, map — `DriverList`, `DriverTips`, `ReviewDriver`, `ReviewCustomer`, `Messages`, `MapView`, `GoogleMaps`, `MainSearch`, `SearchOptions`
- Batch 18: analytics, CMS, promos — `AnalyticsSegment`, `FacebookPixel`, `GoogleConversion`, `CmsContent`, `PromotionsController`, `BusinessReviews`, `BusinessReservation`, `FavoriteList`, `ProfessionalInfo`, `SingleProfessionalCard`
- Batch 19: user, project, misc — `ProjectForm`, `UserFormDetails`, `MomentOption`, `GiftCard` (Purchase, Send, Redeem, OrdersList)
- Batch D1: dashboard orders — `DashboardBusinessList`, `DashboardOrdersList`, `OrdersManage`, `OrdersFilter`, `OrderDetails`, `CustomOrderDetails`, `OrderNotification`
- Batch D2: dashboard users/drivers/messages — `UsersList`, `UserFormDetails`, `DriversList`, `Messages`, `WebsocketStatus`, `SettingsList`, `CheckPassword`
- Batch D3: dashboard business/geo/export — `BusinessProductsListing`, `CityList`, `CountryList`, `ExportCSV`, `GiftCardsList`, `MetaFields`, `PointsWalletLevels`
- Batch D4: dashboard logistics/appointments/reviews — `Appointments`, `GoogleMapsApiKeySetting`, `LogisticInformation`, `Logistics`, `ReviewCustomer`, `Schedule`

## Verify locally

```bash
COREPACK_ENABLE_STRICT=0 yarn install
yarn test
yarn lint:check
yarn test:coverage:summary
```

## Test helpers

- `src/__tests__/helpers/xhrMock.js`
- `src/__tests__/helpers/mockOrdering.js`
- `src/__tests__/helpers/renderController.jsx`

## Related docs

| Doc | Purpose |
|-----|---------|
| [TEST_BATCH_REGISTRY.md](./TEST_BATCH_REGISTRY.md) | **Master batch list** — what to test each session |
| [BRANCH_PROTECTION.md](./BRANCH_PROTECTION.md) | GitHub rules (after first green CI) |
| [CONSUMER_SUBMODULE.md](./CONSUMER_SUBMODULE.md) | Consumer SHA pin workflow |

## Branch protection

Enable after first green CI on GitHub — [BRANCH_PROTECTION.md](./BRANCH_PROTECTION.md). Required check: **CI Quality Gate** (one job: lint + `test:coverage` + 70% gate). PRs only; no push rerun. Coverage reporters in CI: `text` + `json` only (no `html` / `lcov`).

## Consumer apps

After merge, consumers pin submodule SHA per [CONSUMER_SUBMODULE.md](./CONSUMER_SUBMODULE.md). No consumer CI changes in this issue.
