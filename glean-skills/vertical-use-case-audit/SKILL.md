---
name: vertical-use-case-audit
description: >-
  Verifies a Bloomreach Engagement client's industry vertical and compares their
  live scenarios, channels, and AI features against vertical-specific use cases.
  Use when classifying a client vertical, reviewing adoption for a vertical,
  preparing account feedback, or auditing marketing setup for fashion, grocery,
  restaurants, travel, jewellery, sports, retail, beauty, or similar verticals.
---

# Vertical use-case audit

## Goal

Produce consistent, vertical-aware feedback for Bloomreach Engagement clients:

1. **Verify vertical** from client documents, project name/workspace, and live signals.
2. **Compare** live scenarios / channels / AI features against that vertical’s expected use cases.
3. **Recommend** the highest-priority missing or partial use cases for account feedback.

Do **not** invent schema issues or claim campaigns exist without evidence. Prefer Engagement live signals + Glean docs.

## Inputs

Expect some or all of:

- Client name / workspace / project name
- Glean docs (tracking docs, kickoffs, SOWs — use SOWs only for vertical hints, not as tracking proof)
- Live scenario names + channels
- Event types present (e.g. `purchase`, `cart_update`, `view_item`)
- Channel usage (Email, SMS, Push, WhatsApp, Weblayer)
- AI features (recommendations, contextual personalization, predictions, autosegments)

## Vertical taxonomy (canonical labels)

If the Salesforce GTM mapping is available for the account (`GTM Industry`, `GTM Industry Group`,
`GTM Business Vertical`, `CSM Segment`), treat it as authoritative and do not re-classify from
documents. Map it onto the labels below.

Use one primary label from:

| ID | Label | Aliases / hints |
|---|---|---|
| fashion | Fashion | apparel, clothing, footwear (fashion), River Island-style |
| sports | Sports & outdoor | sportswear, athletic, cycling (Rapha), running |
| jewellery | Jewellery | jewelry, accessories (jewellery-led) |
| grocery | Grocery & CPG | supermarket, convenience, Coop, food retail |
| restaurants | Restaurants | hospitality F&B, café, Cote |
| hospitality | Hospitality & leisure | competitive socialising, venues, bars, bowling, Clays |
| travel | Travel | airline, hotel, flights, tours |
| beauty | Beauty | cosmetics, skincare |
| home | Home & DIY | blinds, furniture, home improvement |
| retail | General retail | ecommerce, multi-category retail |
| mobility | Transport & mobility | bus, rail, transit |
| financial | Financial services | bank, insurance, loyalty finance |
| other | Other | only if nothing else fits |

If uncertain between two, pick the stronger evidence and list the alternative with lower confidence.

Match whole words only. Generic schema/document wording (`address`, `business`, `booking`) is not a vertical signal on its own.

## Vertical use-case expectations

### Fashion / Sports / Jewellery (commerce retail)

Priority use cases:

1. Welcome / consent onboarding  
2. Abandon cart (email + preferably SMS/push)  
3. Abandon browse  
4. Post-purchase / replenishment or cross-sell  
5. Win-back / reactivation  
6. Recommendations on site or in email  
7. Contextual personalization on key journeys  
8. Price drop / back in stock (if wishlist or high browse intent)

### Grocery & CPG

1. Welcome / loyalty join  
2. Replenishment / repeat purchase  
3. Abandon cart (if ecommerce)  
4. Promo / flyer-style lifecycle (not only BAU blasts)  
5. Personalized recommendations (category/aisle)  
6. Win-back for lapsed shoppers  
7. SMS for time-sensitive offers (if integrated)

### Restaurants

1. Welcome / booking or signup  
2. Reservation / visit reminder (if events exist)  
3. Win-back for lapsed diners  
4. Birthday / occasion  
5. Weblayer or on-site promo (if web present)  
6. Email + SMS where consent allows  

### Hospitality & leisure

Venue-led businesses (competitive socialising, bars, bowling, experiences) — booking, not basket.

1. Welcome / signup or membership  
2. Booking confirmation & pre-visit reminder  
3. Post-visit follow-up / review request  
4. Win-back for lapsed guests  
5. Birthday / occasion  
6. Group / corporate enquiry nurture  
7. Weblayer or on-site promo  
8. SMS/push for time-critical booking updates  

Do not score these clients against abandon cart / product recommendations as if they were retail.

### Travel

1. Welcome / booking confirmation follow-up  
2. Abandon browse / abandon book  
3. Pre-trip / post-trip nurture  
4. Win-back  
5. Recommendations (destinations / ancillaries)  
6. Omnichannel for time-critical updates  

### Beauty / Home / General retail

Same commerce core as Fashion, weighted toward browse abandonment, replenishment (beauty), and project/seasonal journeys (home).

### Transport & mobility

1. Welcome / account  
2. Service disruption / journey updates (if events exist)  
3. Loyalty / frequency nurture  
4. Win-back  
5. Prefer SMS/push for operational messaging when integrated  

## Matching rules

Mark each expected use case as:

- **covered** — clear live scenario (or strong channel+event evidence)
- **partial** — related scenario exists but missing channel, AI, or trigger quality
- **missing** — no credible live evidence

Signals that count:

- Scenario name patterns: abandon cart/basket, abandon browse, welcome, win-back, post-purchase, birthday, replenish, reservation, booking, pre-visit, group/corporate
- Events: `cart_update`, `checkout`, `purchase`, `view_item`, `consent`, `register`, `booking`
- Channels utilised in last ~90 days or on live scenarios
- AI: recommendations / contextual personalization / predictions / autosegments in use

BAU / FY / dated blast scenarios are **not** proof of always-on lifecycle coverage.

## Output format (JSON only when used by tools)

```json
{
  "vertical": {
    "id": "fashion",
    "label": "Fashion",
    "confidence": "high|medium|low",
    "rationale": "1-2 sentences",
    "alternatives": [{ "id": "retail", "label": "General retail", "why": "..." }]
  },
  "coverageSummary": "1-2 sentences for the account team",
  "useCases": [
    {
      "id": "abandon_cart",
      "title": "Abandon cart",
      "status": "covered|partial|missing",
      "priority": "high|medium|low",
      "evidence": "what was found or missing",
      "recommendation": "concrete next step"
    }
  ],
  "topGaps": [
    {
      "title": "...",
      "whyItMatters": "...",
      "adopt": "..."
    }
  ]
}
```

## Feedback tone

- Consultant-ready, concise, Bloomreach Engagement language
- Prioritize **top 3 gaps** for the vertical
- Separate **verified facts** (live scenarios/events) from **Glean context** (docs)
- Never claim Snowflake or external warehouse is required for Engagement lifecycle KPIs

## When evidence is thin

Say so. Prefer `confidence: low` and ask for a tracking doc / project confirmation rather than forcing a vertical.
