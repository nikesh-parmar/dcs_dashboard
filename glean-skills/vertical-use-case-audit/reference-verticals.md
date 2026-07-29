# Vertical use-case reference

Companion to `SKILL.md`. Keep this pack aligned with `src/glean/verticalUseCases.js`.

## Shared commerce core (Fashion, Sports, Jewellery, Beauty, Home, Retail)

| Use case ID | Title | Key scenario signals | Supporting events |
|---|---|---|---|
| welcome | Welcome / onboarding | welcome, onboarding, signup | consent, register |
| abandon_cart | Abandon cart | abandon cart/basket | cart_update, checkout |
| abandon_browse | Abandon browse | abandon browse/view | view_item, view_category |
| post_purchase | Post-purchase | post purchase, thank you, cross-sell | purchase |
| reactivation | Win-back / reactivation | winback, reactivation, lapse | — |
| recommendations | Product recommendations | — | recs feature used |
| contextual_ai | Contextual personalization | — | contextual feature used |
| price_drop | Price drop / back in stock | price drop, back in stock, wishlist | view_item, wishlist, add_to_wishlist |

## Grocery & CPG extras

| Use case ID | Title | Notes |
|---|---|---|
| replenishment | Replenishment / repeat purchase | Prefer always-on over FY blasts |
| sms_offers | SMS time-sensitive offers | Only if SMS utilised |

## Restaurants extras

| Use case ID | Title | Notes |
|---|---|---|
| occasion | Birthday / occasion | Lifecycle |
| visit_reminder | Visit / reservation reminder | If booking events exist |

## Hospitality & leisure (booking-led venues, not commerce core)

| Use case ID | Title | Key scenario signals | Supporting events |
|---|---|---|---|
| welcome | Welcome / signup | welcome, signup, membership, loyalty | consent, register |
| booking_confirmation | Booking confirmation & pre-visit reminder | booking, reservation, pre-visit, arrival | booking, reservation, purchase |
| post_visit | Post-visit follow-up / review request | post visit, feedback, review, NPS | booking, purchase |
| reactivation | Win-back for lapsed guests | winback, reactivation, lapsed | — |
| occasion | Birthday / occasion | birthday, anniversary, celebration | — |
| group_events | Group / corporate enquiry nurture | group, corporate, christmas, private hire | — |
| weblayer_promo | On-site / weblayer promo | — | Weblayer utilised |
| sms_updates | SMS/push booking updates | — | SMS or Push utilised |

## Travel extras

| Use case ID | Title | Notes |
|---|---|---|
| abandon_book | Abandon book / booking | Booking funnel |
| trip_nurture | Pre/post-trip nurture | Journey around travel dates |

## Transport extras

| Use case ID | Title | Notes |
|---|---|---|
| service_updates | Service / journey updates | Operational messaging |
| loyalty_frequency | Loyalty / frequency nurture | Always-on preferred |

## Upload to Glean

1. Zip `glean-skills/vertical-use-case-audit/` (include `SKILL.md` + this file).
2. In Glean: **Settings → Skills → Upload** (or create via chat and paste `SKILL.md`).
3. Enable for your user / team once Skills beta is available.
4. Invoke with: “Run vertical-use-case-audit for {client}”.
