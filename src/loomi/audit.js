/**
 * Normalize Loomi schema + overview payloads into a Data Audit shaped like
 * Bloomreach Engagement audits (identifiers, consent, properties, events,
 * mapping, catalogs, findings) — see Glean: Data Audits Training Pack,
 * PerfectDraft / Fragrance Shop completed audits.
 */

const SYSTEM_EVENTS = new Set([
  "session_start",
  "session_end",
  "page_visit",
  "first_session",
  "campaign",
  "consent",
  "banner",
  "experiment",
  "merge",
  "double_opt_in",
]);

const CORE_COMMERCE_EVENTS = [
  "purchase",
  "purchase_item",
  "view_item",
  "view_category",
  "cart_update",
  "checkout",
  "search",
  "add_to_wishlist",
];

/** Alternate event type names that still satisfy a core commerce expectation. */
const CORE_COMMERCE_ALIASES = {
  add_to_wishlist: [/wishlist/i],
  cart_update: [/^cart_update$/i, /add[_-]?to[_-]?cart/i],
  checkout: [/^checkout$/i, /begin[_-]?checkout/i],
  view_item: [/^view_item$/i, /product[_-]?view|view[_-]?product/i],
  view_category: [/^view_category$/i, /category[_-]?view|view[_-]?category/i],
  search: [/^search$/i, /product[_-]?search|site[_-]?search/i],
  purchase: [/^purchase$/i, /^order$/i, /purchase_complete/i],
  purchase_item: [/^purchase_item$/i, /order_item|purchase_product/i],
};

function eventCoversCoreType(eventType, coreType) {
  const type = String(eventType || "");
  if (!type) return false;
  if (type === coreType) return true;
  const aliases = CORE_COMMERCE_ALIASES[coreType];
  if (!aliases?.length) return false;
  return aliases.some((re) => re.test(type));
}

function hasCoreCommerceEvent(eventRows, coreType) {
  return (Array.isArray(eventRows) ? eventRows : []).some((e) =>
    eventCoversCoreType(e.type || e.event_type || e.name, coreType)
  );
}

const TEMP_PROPERTY_RE = /^(temp_|tmp_|test_|xxx_|delete_)/i;

/** Ordered Data Mapping headers (Bloomreach standard schema). */
const MAPPING_EVENT_DEFS = [
  { key: "purchase", label: "Purchase (completed)" },
  { key: "returned_purchase", label: "Purchase (returned)" },
  { key: "purchase_item", label: "Purchase item" },
  { key: "add_to_cart", label: "Add to cart" },
  { key: "remove_from_cart", label: "Remove from cart" },
  { key: "view_item", label: "View item" },
  { key: "view_category", label: "View category" },
  { key: "checkout", label: "Checkout" },
  { key: "return_item", label: "Return item" },
  { key: "search", label: "Search" },
  { key: "add_to_wishlist", label: "Add to wishlist" },
  { key: "remove_from_wishlist", label: "Remove from wishlist" },
];

const MAPPING_CUSTOMER_ATTR_DEFS = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "gender", label: "Gender" },
  { key: "birthday", label: "Birthday" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
];

const MAPPING_CATALOG_DEFS = [
  { key: "main", label: "Main" },
  { key: "variant", label: "Variant" },
];

const MAPPING_CONSENT_DEFS = [
  { key: "newsletter", label: "Newsletter" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "personalized_notification", label: "Personalized notification" },
  { key: "personalized_mobile_notification", label: "Personalized mobile notification" },
  { key: "personalized_browser_notification", label: "Personalized browser notification" },
  { key: "retargeting", label: "Retargeting" },
  { key: "marketing", label: "Marketing" },
];

const CHANNEL_ORDER = ["Email", "SMS", "WhatsApp", "Push", "Weblayer", "In App"];

const EVENT_ATTR_LABELS = {
  product_id: "Product ID",
  variant_id: "Variant ID",
  price: "Price",
  quantity: "Quantity",
  purchase_id: "Purchase ID",
  total_price: "Total price",
  voucher_code: "Voucher code",
  category: "Category",
  query: "Query",
};

function buildEngagementUrls(projectUrl) {
  if (!projectUrl || typeof projectUrl !== "string") {
    return { projectUrl: "", catalogsUrl: "", importsUrl: "", dataManagerUrl: "" };
  }
  const base = projectUrl.replace(/\/+$/, "");
  return {
    projectUrl: base,
    catalogsUrl: `${base}/crm/catalogs`,
    importsUrl: `${base}/crm/imports`,
    dataManagerUrl: `${base}/data-manager`,
  };
}

function catalogUiUrl(projectUrl, catalogId) {
  const { catalogsUrl } = buildEngagementUrls(projectUrl);
  if (!catalogsUrl || !catalogId) return catalogsUrl || "";
  return `${catalogsUrl}/${catalogId}`;
}

function collectEventProperties(event) {
  const groups = event?.properties ?? {};
  const props = [];

  for (const [groupName, group] of Object.entries(groups)) {
    if (groupName === "are_all_used" || !group || typeof group !== "object") continue;
    const list = Array.isArray(group.properties) ? group.properties : [];
    for (const prop of list) {
      props.push({
        eventType: event.type,
        eventName: event.name || event.type,
        property: prop.property,
        type: prop.type,
        source: prop.source,
        used: Boolean(prop.used),
        private: Boolean(prop.private),
        description: prop.description || "",
        group: groupName === "default_group" ? "default" : groupName,
      });
    }
  }

  return props;
}

function unwrapList(payload, keys = ["data", "events", "properties", "ids", "identifiers", "fields", "categories"]) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (payload?.result) return unwrapList(payload.result, keys);
  if (payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    for (const key of keys) {
      if (Array.isArray(payload.data[key])) return payload.data[key];
    }
  }
  return [];
}

function classifyEvent(type) {
  if (SYSTEM_EVENTS.has(type)) return "system";
  if (CORE_COMMERCE_EVENTS.includes(type)) return "commerce";
  return "custom";
}

function isMappedValue(value) {
  return value != null && value !== "" && value !== false;
}

/** Turn mapping values (string | object | array) into a readable label. */
function titleCaseLabel(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatOperator(op) {
  const key = String(op || "").toLowerCase();
  if (key === "equals" || key === "eq") return "=";
  if (key === "not_equals" || key === "neq") return "≠";
  if (key === "contains") return "contains";
  if (key === "not_contains") return "does not contain";
  if (key === "in") return "in";
  if (key === "not_in") return "not in";
  return op || "=";
}

function formatFilterConstraints(filter) {
  const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
  return filters
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const attr =
        entry.attribute?.property ||
        entry.attribute?.name ||
        entry.attribute?.id ||
        (typeof entry.attribute === "string" ? entry.attribute : null) ||
        entry.property ||
        null;
      const constraint = entry.constraint || entry;
      const operator = formatOperator(constraint.operator || entry.operator);
      const operands = constraint.operands || entry.operands || [];
      const values = (Array.isArray(operands) ? operands : [operands])
        .map((op) => {
          if (op == null) return null;
          if (typeof op !== "object") return String(op);
          if (op.value != null) return String(op.value);
          return formatMappedValue(op);
        })
        .filter(Boolean);
      if (!attr) return null;
      return values.length ? `${attr} ${operator} ${values.join(", ")}` : String(attr);
    })
    .filter(Boolean);
}

function formatMappedValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value.map(formatMappedValue).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof value === "object") {
    // Standard event mapping: { type, filter: [...] }
    if (value.type && (value.filter != null || Object.prototype.hasOwnProperty.call(value, "filter"))) {
      const eventPart = `Event type - ${titleCaseLabel(value.type)}`;
      const constraints = formatFilterConstraints(value.filter);
      return constraints.length ? `${eventPart}, ${constraints.join(", ")}` : eventPart;
    }
    // Property reference: { property, type: "property" }
    if (value.property && typeof value.property !== "object") {
      return String(value.property);
    }
    for (const key of ["name", "event", "id", "field", "value", "mapped_to", "mappedTo"]) {
      if (isMappedValue(value[key]) && typeof value[key] !== "object") {
        return String(value[key]);
      }
    }
    const pairs = Object.entries(value)
      .filter(([, v]) => isMappedValue(v))
      .map(([k, v]) => `${k} → ${formatMappedValue(v)}`);
    return pairs.length ? pairs.join("; ") : null;
  }
  return String(value);
}

function buildMappingSections(mappingData) {
  const data = mappingData?.data ?? mappingData ?? {};
  const standardEvents = data.standard_events ?? {};
  const customerProps = data.customer_properties ?? {};
  const catalogs = data.catalogs ?? {};
  const consents = data.consents ?? {};

  const events = MAPPING_EVENT_DEFS.map(({ key, label }) => {
    const cfg = standardEvents[key];
    const attributeEntries =
      cfg && typeof cfg === "object"
        ? Object.entries(cfg).filter(([k]) => k !== "event")
        : Object.keys(EVENT_ATTR_LABELS).map((field) => [field, null]);

    return {
      key,
      label,
      mappedEvent: cfg ? formatMappedValue(cfg.event) : null,
      mapped: Boolean(cfg && isMappedValue(cfg.event)),
      attributes: attributeEntries.map(([field, mapped]) => ({
        field,
        label: EVENT_ATTR_LABELS[field] || field,
        mappedTo: formatMappedValue(mapped),
        mapped: isMappedValue(mapped),
      })),
    };
  });

  const customerAttributes = MAPPING_CUSTOMER_ATTR_DEFS.map(({ key, label }) => ({
    key,
    label,
    mappedTo: formatMappedValue(customerProps[key]),
    mapped: isMappedValue(customerProps[key]),
  }));

  const catalogRows = MAPPING_CATALOG_DEFS.map(({ key, label }) => ({
    key,
    label,
    mappedTo: formatMappedValue(catalogs[key]),
    mapped: isMappedValue(catalogs[key]),
  }));

  const consentKeys = new Set([
    ...MAPPING_CONSENT_DEFS.map((d) => d.key),
    ...Object.keys(consents),
  ]);
  const consentLabelByKey = Object.fromEntries(MAPPING_CONSENT_DEFS.map((d) => [d.key, d.label]));
  const consentRows = [...consentKeys].map((key) => ({
    key,
    label: consentLabelByKey[key] || key.replaceAll("_", " "),
    mappedTo: formatMappedValue(consents[key]),
    mapped: isMappedValue(consents[key]),
  }));

  // Flat rows kept for findings / legacy filters
  const rows = [
    ...events.map((e) => ({
      area: "Standard event",
      key: e.key,
      label: e.label,
      mappedTo: e.mappedEvent,
      mapped: e.mapped,
      details: `${e.attributes.filter((a) => a.mapped).length} attribute mapping(s)`,
      attributes: e.attributes,
      kind: "event",
    })),
    ...customerAttributes.map((a) => ({
      area: "Customer attribute",
      key: a.key,
      label: a.label,
      mappedTo: a.mappedTo,
      mapped: a.mapped,
      details: "",
      kind: "attribute",
    })),
    ...catalogRows.map((c) => ({
      area: "Catalog",
      key: c.key,
      label: c.label,
      mappedTo: c.mappedTo,
      mapped: c.mapped,
      details: "",
      kind: "catalog",
    })),
    ...consentRows.map((c) => ({
      area: "Consent",
      key: c.key,
      label: c.label,
      mappedTo: c.mappedTo,
      mapped: c.mapped,
      details: "",
      kind: "consent",
    })),
  ];

  return {
    events,
    customerAttributes,
    catalogs: catalogRows,
    consents: consentRows,
    rows,
  };
}

function buildMappingRows(mappingData) {
  return buildMappingSections(mappingData).rows;
}

function buildConsentRows(consentSettings, mappingData) {
  const data = consentSettings?.data ?? consentSettings ?? {};
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const mappedConsents = mappingData?.data?.consents ?? mappingData?.consents ?? {};

  const rows = categories.map((cat) => {
    const translations = cat.translations ?? {};
    const defaultT = translations[""] || Object.values(translations)[0] || {};
    return {
      id: cat.id,
      name: defaultT.name || cat.id,
      description: defaultT.description || "",
      legitimateInterest: Boolean(cat.legitimate_interest),
      mappedStandard: Object.entries(mappedConsents)
        .filter(([, v]) => v === cat.id)
        .map(([k]) => k)
        .join(", "),
      sources: Object.entries(cat.sources || {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(", "),
    };
  });

  // Include mapping-only consent keys that aren't defined as categories
  for (const [standard, mappedTo] of Object.entries(mappedConsents)) {
    if (!mappedTo) continue;
    if (rows.some((r) => r.id === mappedTo || r.mappedStandard.includes(standard))) continue;
    rows.push({
      id: mappedTo,
      name: mappedTo,
      description: `Mapped from standard consent “${standard}”`,
      legitimateInterest: false,
      mappedStandard: standard,
      sources: "",
    });
  }

  return rows;
}

function buildFindings({
  overview,
  eventRows,
  attributeRows,
  identifiers,
  mappingRows,
  consentRows,
  catalogs,
  scenarios = [],
  catalogsAvailable = true,
  dataQuality = null,
}) {
  const findings = [];

  const unusedEvents = eventRows.filter((e) => !e.used || e.eventCount === 0);
  if (unusedEvents.length) {
    findings.push({
      severity: "medium",
      area: "Events",
      title: `${unusedEvents.length} inactive / unused event type(s)`,
      detail: unusedEvents
        .slice(0, 8)
        .map((e) => e.type)
        .join(", "),
      recommendation: "Review whether these can be archived or removed from Data Manager.",
    });
  }

  const missingCore = CORE_COMMERCE_EVENTS.filter(
    (type) => !hasCoreCommerceEvent(eventRows, type)
  );
  if (missingCore.length) {
    findings.push({
      severity: "high",
      area: "Events",
      title: "Missing common commerce events",
      detail: missingCore.join(", "),
      recommendation:
        "Confirm tracking document vs live schema; add missing events if required. Wishlist coverage counts any event type containing “wishlist” (not only add_to_wishlist).",
    });
  }

  const unmappedStandard = mappingRows.filter(
    (r) => r.area === "Standard event" && !r.mapped
  );
  if (unmappedStandard.length > 6) {
    findings.push({
      severity: "high",
      area: "Data mapping",
      title: `${unmappedStandard.length} standard events are unmapped`,
      detail: unmappedStandard
        .slice(0, 10)
        .map((r) => r.key)
        .join(", "),
      recommendation: "Map tracked events in Data & Assets → Mapping for recommendations and analytics.",
    });
  }

  const unmappedAttrs = mappingRows.filter(
    (r) => r.area === "Customer attribute" && !r.mapped
  );
  if (unmappedAttrs.length) {
    findings.push({
      severity: "medium",
      area: "Data mapping",
      title: `${unmappedAttrs.length} standard customer attributes unmapped`,
      detail: unmappedAttrs.map((r) => r.key).join(", "),
      recommendation: "Map email/phone/name fields used by campaigns and identity resolution.",
    });
  }

  const privateAttrs = attributeRows.filter((a) => a.private);
  const unusedAttrs = attributeRows.filter((a) => !a.used);
  const tempAttrs = attributeRows.filter((a) => TEMP_PROPERTY_RE.test(a.property));
  const noDescription = attributeRows.filter((a) => !a.description);

  if (tempAttrs.length) {
    findings.push({
      severity: "medium",
      area: "Customer properties",
      title: `${tempAttrs.length} temporary / test property name(s)`,
      detail: tempAttrs.map((a) => a.property).join(", "),
      recommendation: "Clean up temporary attributes to reduce Data Manager noise.",
    });
  }

  if (unusedAttrs.length) {
    findings.push({
      severity: "low",
      area: "Customer properties",
      title: `${unusedAttrs.length} unused customer attribute(s)`,
      detail: unusedAttrs
        .slice(0, 10)
        .map((a) => a.property)
        .join(", "),
      recommendation: "Remove unused properties or confirm they are newly defined.",
    });
  }

  const maxProps = overview.maxCustomerProperties;
  if (maxProps && attributeRows.length / maxProps > 0.8) {
    findings.push({
      severity: "high",
      area: "Customer properties",
      title: `Approaching property limit (${attributeRows.length}/${maxProps})`,
      detail: "Projects near the customer property cap should prioritize cleanup.",
      recommendation: "Delete unused/temporary properties before hitting the project limit.",
    });
  }

  if (!privateAttrs.length && attributeRows.some((a) => /email|phone|name|address/i.test(a.property))) {
    findings.push({
      severity: "medium",
      area: "PII",
      title: "PII-like attributes without private flag",
      detail: attributeRows
        .filter((a) => /email|phone|name|address/i.test(a.property) && !a.private)
        .map((a) => a.property)
        .join(", "),
      recommendation: "Mark sensitive attributes as private in Data Manager where appropriate.",
    });
  }

  const hardIds = identifiers.filter((i) => i.type === "hard");
  const softIds = identifiers.filter((i) => i.type === "soft");
  if (!hardIds.length) {
    findings.push({
      severity: "high",
      area: "Identifiers",
      title: "No hard ID configured",
      detail: softIds.map((i) => i.id).join(", ") || "none",
      recommendation: "Configure a hard identifier (e.g. registered / email) for identity resolution.",
    });
  }

  if (!consentRows.length) {
    findings.push({
      severity: "medium",
      area: "Consent",
      title: "No consent categories returned",
      detail: "Consent settings empty or unavailable.",
      recommendation: "Verify GDPR/consent categories are configured for campaign channels.",
    });
  }

  if (catalogsAvailable && !catalogs.length) {
    findings.push({
      severity: "low",
      area: "Catalogs",
      title: "No catalogs found",
      detail: "Product personalization and recommendations may be limited.",
      recommendation: "Confirm whether a product catalog should exist for this project.",
    });
  }

  const catalogMapped = mappingRows.some((r) => r.area === "Catalog" && r.mapped);
  if (catalogsAvailable && catalogs.length && !catalogMapped) {
    findings.push({
      severity: "medium",
      area: "Data mapping",
      title: "Catalogs exist but main catalog mapping is empty",
      detail: catalogs.map((c) => c.name).join(", "),
      recommendation: "Map the main product catalog and required columns in Mapping.",
    });
  }

  if (scenarios.length) {
    const noEvents = scenarios.filter((s) => !s.eventsUsed?.length);
    if (noEvents.length) {
      const bauLike = noEvents.filter(
        (s) => isOneOffBauScenario(s) || /\bbroadcast/i.test(String(s.name || ""))
      );
      const names = noEvents
        .slice(0, 8)
        .map((s) => s.name)
        .join(", ");
      const bauNote =
        bauLike.length === noEvents.length
          ? " Likely BAU / scheduled broadcast sends (e.g. FY week campaigns), which typically have no on-event trigger — usually expected rather than a gap."
          : bauLike.length
            ? ` ${bauLike
                .map((s) => s.name)
                .slice(0, 4)
                .join(", ")} look like BAU / scheduled broadcasts (often no event refs); review the rest for missing on-event wiring.`
            : "";
      findings.push({
        severity: "low",
        area: "Scenarios",
        title: `${noEvents.length} live scenario(s) have no detected event references`,
        detail: names + bauNote,
        recommendation: bauLike.length
          ? "Treat FY / Broadcast / BAU week sends as expected one-offs unless you intended an always-on automation. Confirm any non-BAU scenarios use the right on-event trigger."
          : "Confirm triggers (on-event vs repeated/API) and whether event refs are expected.",
      });
    }
  }

  if (noDescription.length > attributeRows.length * 0.5 && attributeRows.length > 5) {
    findings.push({
      severity: "low",
      area: "Documentation",
      title: "Most customer attributes lack descriptions",
      detail: `${noDescription.length}/${attributeRows.length} without description`,
      recommendation: "Add Data Manager descriptions to improve auditability and onboarding.",
    });
  }

  const dqIssues = dataQuality?.issues || [];
  const typeMismatches = dqIssues.filter((i) => i.kind === "value_type_mismatch");
  const schemaHints = dqIssues.filter((i) => i.kind === "schema_type_hint");
  const crossEvent = dqIssues.filter((i) => i.kind === "cross_event_type_conflict");

  if (typeMismatches.length) {
    findings.push({
      severity: "medium",
      area: "Data quality",
      title: `${typeMismatches.length} value type mismatch(es) in customer property sample`,
      detail: typeMismatches
        .slice(0, 8)
        .map((i) => `${i.property} (${i.declaredType} vs ${i.observed})`)
        .join("; "),
      recommendation:
        "Confirm tracking/imports cast values to the Data Manager type, or correct the property type.",
    });
  }

  if (schemaHints.length) {
    findings.push({
      severity: "low",
      area: "Data quality",
      title: `${schemaHints.length} property name(s) suggest a different type than declared`,
      detail: schemaHints
        .slice(0, 8)
        .map((i) => `${i.property}: declared ${i.declaredType}, name suggests ${i.suggestedType}`)
        .join("; "),
      recommendation: "Review Data Manager types for price/quantity/date/flag-style properties.",
    });
  }

  if (crossEvent.length) {
    findings.push({
      severity: "medium",
      area: "Data quality",
      title: `${crossEvent.length} event attribute(s) use inconsistent types across events`,
      detail: crossEvent
        .slice(0, 8)
        .map((i) => `${i.property}: ${i.detail}`)
        .join("; "),
      recommendation: "Align attribute types across events so analyses and scenarios behave consistently.",
    });
  }

  const severityRank = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

const ADOPTION_SCENARIO_PATTERNS = [
  {
    id: "abandon_cart",
    label: "Abandon cart",
    match: /abandon.*(cart|basket)|cart.?abandon|basket.?abandon/i,
    eventHints: ["cart_update", "checkout"],
  },
  {
    id: "abandon_browse",
    label: "Abandon browse",
    match: /abandon.*(browse|product|view)|browse.?abandon|product.?abandon|view.?abandon/i,
    eventHints: ["view_item", "view_category"],
  },
  {
    id: "abandon_checkout",
    label: "Abandon checkout",
    match: /abandon.*checkout|checkout.?abandon/i,
    eventHints: ["checkout"],
  },
  {
    id: "welcome",
    label: "Welcome / onboarding",
    match: /welcome|onboarding|double.?opt|signup|sign.?up/i,
    eventHints: ["consent", "register"],
  },
  {
    id: "reactivation",
    label: "Reactivation / win-back",
    match: /reactivat|win.?back|lapsing|churn|winback|re-?engage/i,
    eventHints: [],
  },
  {
    id: "post_purchase",
    label: "Post-purchase / follow-up",
    match: /purchase.*(follow|anniversary)|post.?purchase|order.?confirm|thank.?you/i,
    eventHints: ["purchase", "purchase_item"],
  },
  {
    id: "price_drop",
    label: "Price drop / back in stock",
    match: /price.?drop|back.?in.?stock|wishlist/i,
    eventHints: ["view_item", "wishlist", "add_to_wishlist"],
  },
];

function scenarioMatchesPattern(scenario, pattern) {
  const name = String(scenario?.name || "");
  if (pattern.match.test(name)) return true;
  const events = scenario?.eventsUsed || [];
  if (!pattern.eventHints?.length) return false;
  // Only use event hints when the name also looks like automation/abandon style
  if (!/automat|abandon|cart|basket|browse|welcome|reactivat|purchase/i.test(name)) {
    return false;
  }
  return pattern.eventHints.some((hint) => events.includes(hint));
}

function buildAdoptionOpportunities({
  scenarios = [],
  channels = [],
  personalization = null,
  mappingRows = [],
  eventRows = [],
  weblayers = [],
}) {
  const opportunities = [];
  const channelUsed = new Set(
    (Array.isArray(channels) ? channels : [])
      .filter((c) => c.used || c.status === "utilised")
      .map((c) => c.name)
  );
  const features = personalization?.features || {};
  const hasContextual = Boolean(features.contextualPersonalization?.used);
  const hasRecommendations = Boolean(features.recommendations?.used);
  const hasRecsPlus = Boolean(features.recommendationsPlus?.used);
  const hasPredictions = Boolean(features.predictions?.used);
  const hasAutosegments = Boolean(features.autosegments?.used);
  const hasSms = channelUsed.has("SMS");
  const hasPush = channelUsed.has("Push");
  const hasWhatsApp = channelUsed.has("WhatsApp");
  const hasEmail = channelUsed.has("Email");
  const hasWeblayer = channelUsed.has("Weblayer");
  const activeWeblayerNames = (Array.isArray(weblayers) ? weblayers : [])
    .map((w) => w.name)
    .filter(Boolean);
  const activeWeblayerSummary = activeWeblayerNames.length
    ? `Active weblayers: ${activeWeblayerNames.slice(0, 3).join(", ")}${activeWeblayerNames.length > 3 ? "…" : ""}.`
    : "No active weblayers detected.";

  const live = scenarios.filter((s) => s && !s.archived && !s.oneOff);

  const matchedByPattern = {};
  for (const pattern of ADOPTION_SCENARIO_PATTERNS) {
    matchedByPattern[pattern.id] = live.filter((s) => scenarioMatchesPattern(s, pattern));
  }

  const pushOpportunity = (item) => {
    const key = `${item.area}|${item.title}|${item.scenario || ""}`;
    if (opportunities.some((o) => `${o.area}|${o.title}|${o.scenario || ""}` === key)) return;
    opportunities.push({
      impact: item.impact || "medium",
      effort: item.effort || "medium",
      ...item,
    });
  };

  // Abandon cart / basket opportunities
  for (const scenario of matchedByPattern.abandon_cart) {
    const channelsOnScenario = scenario.channels || [];
    const emailOnly =
      channelsOnScenario.includes("Email") &&
      !channelsOnScenario.some((c) => ["SMS", "Push", "WhatsApp"].includes(c));

    if (!scenario.usesContextualPersonalization && !hasContextual) {
      pushOpportunity({
        impact: "high",
        effort: "medium",
        area: "Contextual personalization",
        scenario: scenario.name,
        title: "Add contextual personalization to abandon cart",
        detail:
          "Abandon cart flows benefit from Loomi AI choosing subject line / offer variants per customer instead of a single A/B winner.",
        action:
          "Enable contextual personalization on email (or weblayer) variants in this scenario, with purchase or cart recovery as the goal.",
      });
    } else if (!scenario.usesContextualPersonalization && hasContextual) {
      pushOpportunity({
        impact: "high",
        effort: "low",
        area: "Contextual personalization",
        scenario: scenario.name,
        title: "Extend contextual personalization into abandon cart",
        detail:
          "Contextual personalization is used elsewhere in the project, but not detected on this abandon cart scenario.",
        action: "Apply contextual personalization to this scenario’s channel variants for higher recovery rates.",
      });
    }

    if (emailOnly) {
      pushOpportunity({
        impact: "high",
        effort: hasSms || hasPush ? "medium" : "high",
        area: "Channels",
        scenario: scenario.name,
        title: "Add SMS (or push) for high-value abandon cart customers",
        detail:
          "This scenario currently looks email-only. High-value or near-purchase customers often respond better to SMS or push as a second touch.",
        action: hasSms
          ? "Branch high-value / high-intent customers into an SMS (or push) path after the first email wait."
          : "Introduce SMS for a high-value abandon cart segment, then escalate urgency on later nodes.",
      });
    }

    if (hasRecommendations && !(scenario.personalizationSignals || []).length) {
      pushOpportunity({
        impact: "medium",
        effort: "low",
        area: "Recommendations",
        scenario: scenario.name,
        title: "Include product recommendations in abandon cart messaging",
        detail:
          "Recommendation engines exist in the project, but this scenario has no detected recommendation / content-source usage.",
        action: "Embed a personalized or complementary products block in the abandon cart email using an existing engine.",
      });
    }

    if (hasPredictions) {
      pushOpportunity({
        impact: "medium",
        effort: "low",
        area: "Predictions",
        scenario: scenario.name,
        title: "Prioritize abandon cart sends with prediction scores",
        detail:
          "ML predictions are available and can rank who is most likely to purchase or churn.",
        action: "Use prediction scores to prioritize timing, channel, or incentive depth for abandon cart recovery.",
      });
    }
  }

  // Abandon browse
  for (const scenario of matchedByPattern.abandon_browse) {
    if (!scenario.usesContextualPersonalization) {
      pushOpportunity({
        impact: "medium",
        effort: hasContextual ? "low" : "medium",
        area: "Contextual personalization",
        scenario: scenario.name,
        title: "Personalize abandon browse creative with contextual AI",
        detail:
          "Browse abandonment is a strong fit for contextual personalization across weblayers and triggered messages.",
        action: "Test contextual variants (offer vs social proof vs urgency) optimized to view_item or add-to-cart.",
      });
    }
    if (hasRecommendations && !(scenario.personalizationSignals || []).length) {
      pushOpportunity({
        impact: "high",
        effort: "low",
        area: "Recommendations",
        scenario: scenario.name,
        title: "Power abandon browse with product recommendations",
        detail: "Customers who browsed but didn’t convert respond well to similar / personalized product blocks.",
        action: hasRecsPlus
          ? "Use Recommendations+ (journey-based) items in the browse abandon message or weblayer."
          : "Add a personalized or similar-items recommendation block to this flow.",
      });
    }
    if (
      !hasWeblayer &&
      !(scenario.channels || []).includes("Weblayer")
    ) {
      pushOpportunity({
        impact: "medium",
        effort: "medium",
        area: "Channels",
        scenario: scenario.name,
        title: "Consider an on-site weblayer for browse abandon",
        detail: `In-session weblayers can recover interest before the customer leaves the site. ${activeWeblayerSummary}`,
        action: activeWeblayerNames.length
          ? `Pair this journey with an existing weblayer (e.g. ${activeWeblayerNames[0]}) or create a browse-abandon weblayer.`
          : "Pair the triggered journey with a browse-abandon weblayer for still-on-site visitors.",
        weblayers: activeWeblayerNames,
      });
    }
  }

  // Welcome
  for (const scenario of matchedByPattern.welcome) {
    if (!hasRecsPlus && hasRecommendations) {
      pushOpportunity({
        impact: "medium",
        effort: "medium",
        area: "Recommendations+",
        scenario: scenario.name,
        title: "Upgrade welcome recommendations to Recommendations+",
        detail:
          "Welcome journeys are a natural place for journey-based personalized product suggestions.",
        action: "Swap history-based personalized engines for Recommendations+ where the add-on is enabled.",
      });
    }
    if (!(scenario.channels || []).some((c) => ["SMS", "Push", "WhatsApp"].includes(c)) && hasEmail) {
      pushOpportunity({
        impact: "low",
        effort: hasSms || hasPush ? "medium" : "high",
        area: "Channels",
        scenario: scenario.name,
        title: "Multi-channel welcome nurture",
        detail: "Welcome programmes often convert better with an SMS or push reminder after the first email.",
        action: "Add a secondary channel touch for subscribers who don’t open/click the welcome email.",
      });
    }
  }

  // Reactivation
  for (const scenario of matchedByPattern.reactivation) {
    if (hasPredictions || hasAutosegments) {
      pushOpportunity({
        impact: "high",
        effort: "low",
        area: "AI audiences",
        scenario: scenario.name,
        title: "Target reactivation with predictions / autosegments",
        detail:
          "Reactivation works best when limited to customers with meaningful win-back propensity rather than a broad inactive list.",
        action: hasPredictions
          ? "Filter or prioritize this journey using churn / propensity prediction scores."
          : "Use autosegment cohorts to tailor offers by behavioural cluster.",
      });
    }
    if (!scenario.usesContextualPersonalization) {
      pushOpportunity({
        impact: "medium",
        effort: hasContextual ? "low" : "medium",
        area: "Contextual personalization",
        scenario: scenario.name,
        title: "Contextually personalize reactivation offers",
        detail: "Win-back creatives (discount vs newness vs bestsellers) should vary by customer context.",
        action: "Run contextual personalization on reactivation variants with purchase or session as the goal.",
      });
    }
  }

  // Post purchase
  for (const scenario of matchedByPattern.post_purchase) {
    if (hasRecommendations && !(scenario.personalizationSignals || []).length) {
      pushOpportunity({
        impact: "medium",
        effort: "low",
        area: "Recommendations",
        scenario: scenario.name,
        title: "Cross-sell in post-purchase follow-up",
        detail: "Post-purchase is ideal for complementary / frequently bought together recommendations.",
        action: "Add a recommendation block tailored to the purchased category or items.",
      });
    }
  }

  // Project-level adoption (not scenario-specific)
  const anyAbandon = [
    ...matchedByPattern.abandon_cart,
    ...matchedByPattern.abandon_browse,
    ...matchedByPattern.abandon_checkout,
  ];

  if (!anyAbandon.length && eventRows.some((e) => ["cart_update", "checkout", "view_item"].includes(e.type) && e.used)) {
    pushOpportunity({
      impact: "high",
      effort: "high",
      area: "Scenarios",
      title: "Build an abandon cart / browse recovery journey",
      detail:
        "Commerce events exist, but no live abandon cart/browse scenario was detected.",
      action: "Launch an on-event abandon recovery scenario with email first, then SMS/push for high intent.",
    });
  }

  if (!hasContextual && live.length >= 3) {
    pushOpportunity({
      impact: "high",
      effort: "medium",
      area: "Contextual personalization",
      title: "Adopt contextual personalization on always-on journeys",
      detail:
        "Several live scenarios are running without detected contextual personalization. Always-on flows are the best place to start.",
      action: "Pick one high-volume journey (abandon cart or welcome) and replace static A/B with contextual personalization.",
    });
  }

  if (hasRecommendations && !hasRecsPlus) {
    pushOpportunity({
      impact: "medium",
      effort: "medium",
      area: "Recommendations+",
      title: "Evaluate Recommendations+ for journey-based personalization",
      detail:
        "Standard recommendation engines are in use; Recommendations+ can improve CTR by using interaction sequence.",
      action: "Pilot Recommendations+ on a homepage weblayer or abandon browse email where view_item mapping is solid.",
    });
  }

  if (
    !hasSms &&
    hasEmail &&
    live.some((s) => (s.channels || []).includes("Email"))
  ) {
    pushOpportunity({
      impact: "medium",
      effort: "high",
      area: "Channels",
      title: "Expand beyond email with SMS for high-value segments",
      detail:
        "No SMS campaign events in the last 90 days and no live SMS journeys. Confirm an SMS integration before building.",
      action: "If SMS is licensed and integrated, add it as an escalation for high-CLV / high-intent abandon or welcome customers.",
    });
  }

  if (!hasPush && hasEmail) {
    pushOpportunity({
      impact: "low",
      effort: "high",
      area: "Channels",
      title: "Consider push for time-sensitive triggers",
      detail: "No push campaign events detected in the last 90 days (or in live scenarios).",
      action: "If mobile/browser push is integrated, enable it on one always-on trigger where open rates matter.",
    });
  }

  if (!hasWhatsApp && (hasSms || hasEmail)) {
    pushOpportunity({
      impact: "low",
      effort: "high",
      area: "Channels",
      title: "WhatsApp as a conversational recovery channel",
      detail: "No WhatsApp campaign events detected in the last 90 days.",
      action: "If WhatsApp is licensed and integrated, pilot it on abandon cart for a consenting high-value segment.",
    });
  }

  if (!hasPredictions && live.some((s) => matchedByPattern.reactivation.includes(s) || matchedByPattern.abandon_cart.includes(s))) {
    pushOpportunity({
      impact: "medium",
      effort: "high",
      area: "Predictions",
      title: "Add propensity / churn predictions to prioritise sends",
      detail: "Abandon or reactivation journeys are live without ML prediction scores to rank audience value.",
      action: "Deploy a purchase propensity or churn prediction and use it to gate incentives or channel choice.",
    });
  }

  const purchaseMapped = mappingRows.some(
    (r) => r.area === "Standard event" && r.key === "purchase" && r.mapped
  );
  if (!purchaseMapped && anyAbandon.length) {
    pushOpportunity({
      impact: "medium",
      effort: "low",
      area: "Data mapping",
      title: "Map purchase events to unlock better AI optimisation",
      detail:
        "Abandon journeys exist but standard purchase mapping looks incomplete — contextual personalization and recommendations learn faster with mapped purchase goals.",
      action: "Map purchase (and purchase_item) in Data Manager → Mapping, then use purchase as the optimisation goal.",
    });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return opportunities
    .sort(
      (a, b) =>
        rank[a.impact] - rank[b.impact] ||
        rank[a.effort] - rank[b.effort] ||
        a.area.localeCompare(b.area)
    )
    .slice(0, 12);
}

/**
 * @param {object} params
 */
export function buildAudit({
  project,
  overview,
  eventSchema,
  propertySchema,
  identifierSchema,
  mapping,
  consentSettings,
  catalogs,
  importRows = [],
  scenarios = null,
  channels = null,
  recommendations = null,
  weblayers = null,
  scenarioPerformance = null,
  eventVolumes = null,
  eventFirstSeen = null,
  clientBrief = null,
  catalogsAvailable = true,
  propertySamples = null,
  toolErrors = [],
}) {
  const overviewData = overview?.data ?? overview ?? {};
  const eventCounts = overviewData.event_types_overview ?? {};
  const volumes = eventVolumes || { d30: new Map(), ok: false };
  const firstSeenMap = eventFirstSeen?.firstSeen || new Map();
  const events = unwrapList(eventSchema, ["events"]);
  const attributes = unwrapList(propertySchema, ["properties"]);
  const identifierRaw = unwrapList(identifierSchema, ["data", "ids", "identifiers", "fields"]);

  const identifiers = identifierRaw.map((id) => ({
    id: id.id || id.name || id.field || "",
    type: id.type || id.field_type || "",
    transformLowercase: Boolean(id.transform_lowercase),
    transformTrim: Boolean(id.transform_trim),
    description: id.description || "",
  }));

  const volumeFor = (map, type) => {
    if (!volumes.ok) return null;
    if (map.has(type)) return map.get(type);
    return 0;
  };

  const eventRows = events.map((event) => {
    const props = collectEventProperties(event);
    const countInfo = eventCounts[event.type];
    const eventCount = countInfo?.event_count ?? null;
    const eventCount30 = volumeFor(volumes.d30, event.type);
    const recentZero = volumes.ok && (eventCount30 ?? 0) === 0;
    const firstSeen = firstSeenMap.has(event.type)
      ? firstSeenMap.get(event.type)
      : null;
    return {
      type: event.type,
      name: event.name || event.type,
      classification: classifyEvent(event.type),
      source: event.source,
      used: Boolean(event.used),
      propertyCount: props.length,
      unusedPropertyCount: props.filter((p) => !p.used).length,
      eventCount,
      eventCount30,
      firstSeen,
      realTimeAnalytics: Boolean(event.real_time_analytics),
      description: event.description || "",
      status: !event.used || eventCount === 0 || recentZero ? "inactive" : "active",
      properties: props,
    };
  });

  const eventPropertyRows = events.flatMap(collectEventProperties);

  const attributeRows = attributes.map((attr) => ({
    property: attr.property,
    type: attr.type,
    source: attr.source,
    used: Boolean(attr.used),
    private: Boolean(attr.private),
    deleting: Boolean(attr.deleting),
    temporary: TEMP_PROPERTY_RE.test(attr.property || ""),
    description: attr.description || "",
  }));

  const dataQuality = analyzeDataQuality(
    attributeRows,
    eventPropertyRows,
    propertySamples || []
  );

  const mappingSections = buildMappingSections(mapping);
  const mappingRows = mappingSections.rows;
  const consentRows = buildConsentRows(consentSettings, mapping);
  const engagementUrls = buildEngagementUrls(project.url);
  const catalogRows = (Array.isArray(catalogs) ? catalogs : unwrapList(catalogs, ["data"])).map((cat) => {
    // Prefer already-normalized rows from loadCatalogs
    if (cat && cat.usageSummary != null) {
      return {
        ...cat,
        url: cat.url || catalogUiUrl(project.url, cat.id),
      };
    }
    const id = cat._id || cat.id || "";
    return {
      id,
      name: cat.name || "",
      displayName: cat.display_name || cat.name || "",
      type: cat.type || "",
      description: cat.description || "",
      createdBy: cat.created_by_display_name || "",
      created: cat.created ? new Date(cat.created * 1000).toISOString() : null,
      url: catalogUiUrl(project.url, id),
      used: false,
      usedInMapping: false,
      usageSummary: "—",
    };
  });

  const usedEvents = eventRows.filter((e) => e.used).length;
  const unusedEvents = eventRows.length - usedEvents;
  const usedAttributes = attributeRows.filter((a) => a.used).length;
  const unusedAttributes = attributeRows.length - usedAttributes;
  const hardIdCount = identifiers.filter((i) => i.type === "hard").length;
  const softIdCount = identifiers.filter((i) => i.type === "soft").length;
  const mappedStandardEvents = mappingSections.events.filter((e) => e.mapped).length;
  const totalStandardEvents = mappingSections.events.length;
  const channelUsage =
    channels?.channels ??
    CHANNEL_ORDER.map((name) => ({
      name,
      used: false,
      available: false,
      status: "not_utilised",
      sources: [],
      evidence: [],
      campaignEventCount: 0,
    }));
  const channelsUsed = channels?.used ?? channelUsage.filter((c) => c.used).map((c) => c.name);
  const channelsAvailableUnused = channels?.availableUnused ?? [];
  const channelsUnavailable =
    channels?.unavailable ?? channelUsage.filter((c) => !c.used).map((c) => c.name);
  const personalization = recommendations ?? {
    engines: [],
    runningCount: 0,
    totalCount: 0,
    scenarioHits: [],
    used: false,
    features: {
      recommendations: { used: false, count: 0, detail: "None" },
      contextualPersonalization: { used: false, count: 0, detail: "Not detected" },
      predictions: { used: false, count: 0, detail: "None" },
      autosegments: { used: false, count: 0, detail: "None" },
      recommendationsPlus: { used: false, count: 0, detail: "Not detected" },
    },
  };
  const aiFeatures = personalization.features || {};

  const overviewOut = {
    totalCustomers: overviewData.total_customers ?? null,
    identifiedCustomers: overviewData.identified_customers ?? null,
    mergedCustomers: overviewData.merged_customers ?? null,
    totalEvents: overviewData.events ?? null,
    customers30d: null,
    events30d: eventVolumes?.events30d ?? null,
    archivedEvents: overviewData.archived_events ?? null,
    userAccounts: overviewData.user_accounts ?? null,
    oldestTimestamp: overviewData.oldest_timestamp
      ? new Date(overviewData.oldest_timestamp * 1000).toISOString()
      : null,
    eventTypeCount: eventRows.length,
    usedEventTypes: usedEvents,
    unusedEventTypes: unusedEvents,
    systemEventTypes: eventRows.filter((e) => e.classification === "system").length,
    commerceEventTypes: eventRows.filter((e) => e.classification === "commerce").length,
    customEventTypes: eventRows.filter((e) => e.classification === "custom").length,
    attributeCount: attributeRows.length,
    usedAttributes,
    unusedAttributes,
    privateAttributes: attributeRows.filter((a) => a.private).length,
    temporaryAttributes: attributeRows.filter((a) => a.temporary).length,
    maxCustomerProperties: propertySchema?.max_customer_properties ?? null,
    identifierCount: identifiers.length,
    hardIdCount,
    softIdCount,
    consentCategoryCount: consentRows.length,
    catalogCount: catalogRows.length,
    importJobCount: null,
    catalogsAvailable,
    importsAvailable: false,
    liveScenarioCount: scenarios?.liveCount ?? 0,
    totalScenarioCount: scenarios?.allCount ?? 0,
    mappedStandardEvents,
    totalStandardEvents,
    channels: channelUsage,
    channelsUsed,
    channelsAvailableUnused,
    channelsUnavailable,
    recommendationEngineCount: personalization.totalCount,
    runningRecommendationEngines: personalization.runningCount,
    personalizationUsed: personalization.used,
    aiPersonalization: aiFeatures,
    predictionCount: aiFeatures.predictions?.count ?? 0,
    autosegmentCount: aiFeatures.autosegments?.count ?? 0,
    recommendationsPlusCount: aiFeatures.recommendationsPlus?.count ?? 0,
    contextualPersonalizationUsed: Boolean(aiFeatures.contextualPersonalization?.used),
    consentEnabled: Boolean(
      (consentSettings?.data ?? consentSettings)?.enabled ?? consentRows.length
    ),
  };

  const findings = buildFindings({
    overview: overviewOut,
    eventRows,
    attributeRows,
    identifiers,
    mappingRows,
    consentRows,
    catalogs: catalogRows,
    scenarios: scenarios?.scenarios ?? [],
    catalogsAvailable,
    dataQuality,
  });

  const adoptionOpportunities = buildAdoptionOpportunities({
    scenarios: scenarios?.scenarios ?? [],
    channels: channelUsage,
    personalization,
    mappingRows,
    eventRows,
    weblayers: weblayers?.active ?? [],
  });

  const dataExpiry = {
    available: false,
    note:
      "Event and property data expiry settings are configured in Engagement Data Manager (Expiration) and are not exposed via Loomi Connect.",
    dataManagerUrl: engagementUrls.dataManagerUrl || null,
    docsUrl: "https://documentation.bloomreach.com/engagement/docs/data-manager#event-expiration",
  };

  return {
    project: {
      id: project.id,
      name: project.name,
      category: project.category,
      workspace: project.workspace_name,
      url: engagementUrls.projectUrl || project.url,
      catalogsUrl: engagementUrls.catalogsUrl,
      importsUrl: engagementUrls.importsUrl,
      dataManagerUrl: engagementUrls.dataManagerUrl,
    },
    overview: overviewOut,
    clientBrief: clientBrief || null,
    findings,
    adoptionOpportunities,
    dataExpiry,
    dataQuality: dataQuality || {
      issues: [],
      sampleSize: 0,
      sampledCustomers: 0,
      note: null,
    },
    identifiers,
    consents: consentRows,
    events: eventRows.sort(
      (a, b) =>
        (b.eventCount30 ?? b.eventCount ?? 0) - (a.eventCount30 ?? a.eventCount ?? 0)
    ),
    eventProperties: eventPropertyRows.sort((a, b) =>
      `${a.eventType}.${a.property}`.localeCompare(`${b.eventType}.${b.property}`)
    ),
    attributes: attributeRows.sort((a, b) => a.property.localeCompare(b.property)),
    mapping: mappingRows,
    mappingSections: {
      events: mappingSections.events,
      customerAttributes: mappingSections.customerAttributes,
      catalogs: mappingSections.catalogs,
      consents: mappingSections.consents,
    },
    catalogs: catalogRows.sort((a, b) =>
      (a.displayName || a.name || "").localeCompare(b.displayName || b.name || "")
    ),
    imports: importRows,
    scenarios: scenarios?.scenarios ?? [],
    scenarioSummary: {
      total: scenarios?.allCount ?? 0,
      live: scenarios?.liveCount ?? 0,
      draft: scenarios?.draftCount ?? 0,
    },
    weblayers: weblayers?.active ?? [],
    weblayerSummary: {
      total: weblayers?.total ?? 0,
      active: weblayers?.activeCount ?? 0,
    },
    scenarioPerformance: scenarioPerformance?.rows ?? [],
    scenarioPerformanceSummary: {
      windowDays: scenarioPerformance?.windowDays ?? 30,
      revenueAvailable: Boolean(scenarioPerformance?.revenueAvailable),
    },
    channels: channelUsage,
    personalization,
    catalogsAvailable,
    toolErrors,
  };
}

async function callOptional(loomi, name, args, toolErrors, { quiet = false } = {}) {
  try {
    return await loomi.callTool(name, args);
  } catch (directErr) {
    try {
      const wrapped = await loomi.callTool("call_tool", { name, arguments: args });
      return wrapped?.result ?? wrapped;
    } catch (proxyErr) {
      const message = `${directErr.message}; proxy: ${proxyErr.message}`;
      if (!quiet) {
        console.warn(`Optional tool ${name} failed:`, message);
        toolErrors.push({ tool: name, error: message });
      }
      return null;
    }
  }
}

function extractEventsFromScenarioPayload(payload) {
  const events = new Set();
  const usages = [];

  const pushEvent = (eventType, usage, nodeType = "", nodeName = "") => {
    if (!eventType || typeof eventType !== "string") return;
    const cleaned = eventType.trim();
    if (!cleaned || cleaned.includes("{")) return;
    events.add(cleaned);
    usages.push({ event: cleaned, usage, nodeType, nodeName });
  };

  const walk = (value, context = {}) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, context);
      return;
    }
    if (typeof value !== "object") return;

    const nodeType = value.type || context.nodeType || "";
    const nodeName = value.name || context.nodeName || "";
    const usage = context.usage || inferEventUsage(nodeType);

    if (typeof value.event_type === "string") {
      pushEvent(value.event_type, usage, nodeType, nodeName);
    }

    // on-event-trigger stores { event: { type: "cart_update", filter: [...] } }
    if (typeof value.event === "string") {
      pushEvent(value.event, usage, nodeType, nodeName);
    } else if (value.event && typeof value.event === "object") {
      pushEvent(
        value.event.type || value.event.event_type || value.event.name,
        usage,
        nodeType,
        nodeName
      );
    }

    if (Array.isArray(value.events)) {
      for (const ev of value.events) {
        if (typeof ev === "string") {
          pushEvent(ev, usage, nodeType, nodeName);
        } else if (ev && typeof ev === "object") {
          pushEvent(
            ev.type || ev.event_type || ev.event || ev.name,
            usage,
            nodeType,
            nodeName
          );
        }
      }
    }

    // Funnel / condition steps often reference event types via step.type / step.name
    if (Array.isArray(value.steps)) {
      for (const step of value.steps) {
        if (!step || typeof step !== "object") continue;
        pushEvent(
          step.type || step.event_type || step.event || step.name,
          usage === "referenced" ? "condition" : usage,
          nodeType,
          nodeName || step.name || ""
        );
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "design" || key === "html" || key === "bee_free_html_output") continue;
      // Avoid re-walking event object keys that we already handled
      if (key === "event" && child && typeof child === "object" && !Array.isArray(child)) {
        walk(child.filter, { nodeType, nodeName, usage });
        continue;
      }
      walk(child, {
        nodeType: key === "type" ? nodeType : nodeType || context.nodeType,
        nodeName,
        usage: context.usage,
      });
    }
  };

  const data = payload?.data ?? payload ?? {};
  if (data.trigger) {
    walk(data.trigger, { usage: "trigger" });
  }
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  for (const node of nodes) {
    const usage = inferEventUsage(node?.type);
    walk(node, { usage, nodeType: node?.type, nodeName: node?.name });
  }

  const seen = new Set();
  const uniqueUsages = [];
  for (const row of usages) {
    const key = `${row.event}|${row.usage}|${row.nodeType}|${row.nodeName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueUsages.push(row);
  }

  return {
    events: [...events].sort(),
    usages: uniqueUsages,
  };
}

function inferEventUsage(nodeType = "") {
  const type = String(nodeType).toLowerCase();
  if (type.includes("trigger")) return "trigger";
  if (type.includes("add-event") || type.includes("add_event")) return "add event";
  if (type.includes("condition") || type.includes("filter")) return "condition";
  if (type.includes("wait")) return "wait";
  return "referenced";
}

function channelFromNodeType(nodeType = "") {
  const type = String(nodeType).toLowerCase();
  if (!type) return null;
  if (type.includes("whatsapp")) return "WhatsApp";
  if (type.includes("email")) return "Email";
  if (type.includes("sms") || type.includes("mms")) return "SMS";
  if (type.includes("push")) return "Push";
  // Weblayers / banners (web) vs in-app messages / app inbox (mobile)
  if (
    type.includes("serve-banner") ||
    type.includes("banner") ||
    type.includes("weblayer") ||
    type.includes("web-layer") ||
    type.includes("web_layer")
  ) {
    return "Weblayer";
  }
  if (
    type.includes("app-inbox") ||
    type.includes("app_inbox") ||
    type.includes("in-app") ||
    type.includes("in_app")
  ) {
    return "In App";
  }
  return null;
}

function extractChannelsFromNodes(nodes = []) {
  const channels = new Set();
  for (const node of nodes) {
    const channel = channelFromNodeType(node?.type);
    if (channel) channels.add(channel);
  }
  return CHANNEL_ORDER.filter((c) => channels.has(c));
}

function extractRecommendationIdsFromText(text) {
  if (!text) return [];
  const blob = String(text);
  const ids = new Set();
  const patterns = [
    /recommendationId\\?"\s*:\s*\\?"([a-f0-9]{24})/gi,
    /"recommendationId"\s*:\s*"([a-f0-9]{24})"/gi,
    /"recommendationID"\s*:\s*"([a-f0-9]{24})"/gi,
    /"recommendation_id"\s*:\s*"([a-f0-9]{24})"/gi,
    /recommendations?\s*\(\s*["']([a-f0-9]{24})["']/gi,
    /PARAM_recommendationId\s*=\s*["']([a-f0-9]{24})["']/gi,
  ];
  for (const pattern of patterns) {
    for (const match of blob.matchAll(pattern)) {
      if (match[1]) ids.add(match[1]);
    }
  }
  return [...ids];
}

function extractRecommendationIdsFromPayload(payload) {
  if (!payload) return [];
  try {
    return extractRecommendationIdsFromText(JSON.stringify(payload));
  } catch {
    return [];
  }
}

function detectScenarioPersonalization(nodes = []) {
  const signals = [];
  const recommendationIds = new Set();
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const nodeName = node.name || node.type || "node";
    if (Array.isArray(node.content_sources) && node.content_sources.length) {
      signals.push({
        kind: "content_sources",
        detail: `${nodeName}: ${node.content_sources.length} content source(s)`,
      });
    }
    if (/recommend/i.test(nodeName || "")) {
      signals.push({ kind: "node_name", detail: nodeName });
    }
    try {
      const blob = JSON.stringify(node);
      const ids = extractRecommendationIdsFromText(blob);
      for (const id of ids) {
        recommendationIds.add(id);
        signals.push({
          kind: "recommendation_id",
          detail: `${nodeName}: ${id}`,
          recommendationId: id,
        });
      }
      if (/recommendations?\s*\(/i.test(blob) && !ids.length) {
        signals.push({ kind: "jinja_recommendations", detail: nodeName });
      }
    } catch {
      // ignore circular / oversized
    }
  }
  // Dedupe
  const seen = new Set();
  const unique = signals.filter((s) => {
    const key = `${s.kind}|${s.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { signals: unique, recommendationIds: [...recommendationIds] };
}

function isLiveScenario(scenario) {
  if (!scenario || scenario.archived) return false;
  const status = String(scenario.status || "").toLowerCase();
  return status === "active" || status === "live" || status === "running" || status === "finishing";
}

/**
 * Detect one-off / BAU campaign scenarios (e.g. "BAU JD TH - 26WK25", "FY27 …")
 * so they aren't treated as always-on journeys for adoption suggestions.
 */
function isOneOffBauScenario(scenarioOrName) {
  const name = String(
    typeof scenarioOrName === "string"
      ? scenarioOrName
      : scenarioOrName?.name || ""
  );
  if (!name) return false;
  if (/\bBAU\b/i.test(name)) return true;
  if (/\bone[\s_-]?off\b/i.test(name)) return true;
  if (/\bbroadcast/i.test(name)) return true;
  // Fiscal-year / seasonal BAU campaigns (e.g. FY27, FY26)
  if (/\bFY\s?\d{2}\b/i.test(name)) return true;
  // Week codes: 26WK25, WK25, Week 30
  if (/\b\d{1,2}\s*WK\s*\d{2}\b/i.test(name)) return true;
  if (/\bWK\s*\d{1,2}\b/i.test(name) && /\b20\d{2}\b/.test(name)) return true;
  if (/\bweek\s*\d{1,2}\b/i.test(name) && /\bFY\s?\d{2}\b/i.test(name)) return true;
  // Dated blast / newsletter style campaigns
  if (/\b(newsletter|blast|promo)\b/i.test(name) && /\b(20\d{2}|\d{1,2}[\/\-]\d{1,2})\b/.test(name)) {
    return true;
  }
  return false;
}

/**
 * Whether a scenario starts from an on-event trigger vs a date/schedule trigger.
 * @returns {"event"|"date"|"unknown"}
 */
function detectScenarioTriggerMode(payload) {
  const nodes = Array.isArray(payload?.nodes)
    ? payload.nodes
    : Array.isArray(payload?.data?.nodes)
      ? payload.data.nodes
      : [];
  const triggerTypes = nodes
    .map((n) => String(n?.type || "").toLowerCase())
    .filter((t) => t.includes("trigger"));

  if (triggerTypes.some((t) => t.includes("on-event") || t.includes("on_event"))) {
    return "event";
  }
  if (
    triggerTypes.some(
      (t) =>
        t.includes("repeated") ||
        t.includes("planned") ||
        t.includes("schedule") ||
        t.includes("on-date") ||
        t.includes("on_date") ||
        t.includes("cron")
    )
  ) {
    return "date";
  }

  const trigger = payload?.trigger ?? payload?.data?.trigger ?? null;
  if (trigger && typeof trigger === "object") {
    const type = String(trigger.type || trigger.trigger_type || "").toLowerCase();
    if (type.includes("event")) return "event";
    if (type.includes("repeat") || type.includes("plan") || type.includes("date")) return "date";
  }

  return "unknown";
}

function scenarioKind(scenario) {
  return isOneOffBauScenario(scenario) ? "BAU" : "Automation";
}

function isActiveCampaign(item) {
  if (!item || item.archived) return false;
  const status = String(item.status || "").toLowerCase();
  return status === "active" || status === "live" || status === "running" || status === "finishing";
}

function scenarioUiUrl(projectUrl, scenarioId) {
  const base = String(projectUrl || "").replace(/\/+$/, "");
  if (!base || !scenarioId) return "";
  return `${base}/scenario/${scenarioId}`;
}

function emptyChannelMap() {
  return Object.fromEntries(
    CHANNEL_ORDER.map((name) => [name, { used: false, sources: [], evidence: [] }])
  );
}

function markChannelUsed(map, name, source) {
  if (!map[name]) return;
  map[name].used = true;
  if (source && !map[name].sources.includes(source)) {
    map[name].sources.push(source);
  }
}

/** Map campaign.action_type values to overview channel labels. */
function channelFromCampaignActionType(actionType = "") {
  const type = String(actionType || "").toLowerCase().trim();
  if (!type || type === "split" || type === "ads") return null;
  if (type.includes("whatsapp")) return "WhatsApp";
  if (type.includes("email") || type === "transactional_email") return "Email";
  if (type === "sms" || type === "mms" || type === "rcs") return "SMS";
  if (
    type.includes("push") ||
    type.includes("notification") ||
    type === "mobile_notification" ||
    type === "browser_notification"
  ) {
    return "Push";
  }
  if (
    type.includes("banner") ||
    type.includes("weblayer") ||
    type.includes("web_layer") ||
    type.includes("web-layer")
  ) {
    return "Weblayer";
  }
  if (
    type.includes("in_app") ||
    type.includes("in-app") ||
    type.includes("app_inbox") ||
    type.includes("app-inbox")
  ) {
    return "In App";
  }
  return null;
}

function parseCampaignActionTypeRows(eqlResult) {
  const rows = eqlResult?.data?.rows || eqlResult?.rows || [];
  const counts = new Map();
  for (const row of rows) {
    const header = row?.headers?.[0];
    const actionType = header?.value ?? header?.name ?? null;
    const count = Number(row?.values?.[0] ?? 0);
    if (!actionType || !Number.isFinite(count) || count <= 0) continue;
    counts.set(String(actionType), (counts.get(String(actionType)) || 0) + count);
  }
  return counts;
}

async function loadCampaignActionTypeCounts(loomi, projectId, toolErrors) {
  const query =
    "select count event campaign by event campaign.action_type grouping top 40 in last 90 days";
  try {
    const result = await loomi.callTool("execute_analytics_eql", {
      project_id: projectId,
      query,
    });
    if (result?.success === false || result?.error) {
      toolErrors.push({
        tool: "execute_analytics_eql",
        error: String(result.error || "campaign action_type query failed"),
      });
      return new Map();
    }
    return parseCampaignActionTypeRows(result);
  } catch (err) {
    toolErrors.push({
      tool: "execute_analytics_eql",
      error: err.message || String(err),
    });
    return new Map();
  }
}

function parseEventTypeCountRows(eqlResult) {
  const rows = eqlResult?.data?.rows || eqlResult?.rows || [];
  const counts = new Map();
  for (const row of rows) {
    const header = row?.headers?.[0];
    if (!header || header.type === "other") continue;
    const eventType = header?.value ?? header?.name ?? null;
    const count = Number(row?.values?.[0] ?? 0);
    if (!eventType || !Number.isFinite(count)) continue;
    counts.set(String(eventType), count);
  }
  return counts;
}

/**
 * Event volumes by type (30d) plus project totals for overview (30d customers/events).
 */
async function loadEventVolumes(loomi, projectId, toolErrors, { onProgress } = {}) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let ok = false;
  let d30 = new Map();
  let events30d = null;

  onProgress?.({
    step: "eventVolumes",
    detail: "Counting events by type (last 30 days)…",
    percent: 12,
  });

  try {
    const byType = await loomi.callTool("execute_analytics_eql", {
      project_id: projectId,
      query:
        "select count any event by any event type grouping top 100 in last 30 days",
    });
    if (byType?.success === false || byType?.error) {
      toolErrors.push({
        tool: "execute_analytics_eql",
        error: String(byType.error || "event volume 30d by-type query failed"),
      });
    } else {
      d30 = parseEventTypeCountRows(byType);
      ok = true;
    }
  } catch (err) {
    toolErrors.push({
      tool: "execute_analytics_eql",
      error: err.message || String(err),
    });
  }

  await wait(3200);
  onProgress?.({
    step: "eventVolumes",
    detail: "Counting total events (last 30 days)…",
    percent: 14,
  });

  try {
    const totalEvents = await loomi.callTool("execute_analytics_eql", {
      project_id: projectId,
      query: "select count(any event) in last 30 days",
    });
    const value = Number(totalEvents?.data?.rows?.[0]?.values?.[0]);
    if (Number.isFinite(value)) events30d = value;
  } catch (err) {
    toolErrors.push({
      tool: "execute_analytics_eql",
      error: err.message || String(err),
    });
  }

  return { d30, ok, events30d };
}

function parseEventTypeTimestampRows(eqlResult) {
  const rows = eqlResult?.data?.rows || eqlResult?.rows || [];
  const stamps = new Map();
  for (const row of rows) {
    const header = row?.headers?.[0];
    if (!header || header.type === "other") continue;
    const eventType = header?.value ?? header?.name ?? null;
    if (!eventType) continue;
    const raw = row?.values?.[0];
    if (raw == null || raw === "") continue;
    let ms = null;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      // Engagement timestamps are usually unix seconds; treat large values as ms.
      ms = raw > 1e12 ? raw : raw * 1000;
    } else {
      const asNum = Number(raw);
      if (Number.isFinite(asNum)) {
        ms = asNum > 1e12 ? asNum : asNum * 1000;
      } else {
        const parsed = Date.parse(String(raw));
        if (!Number.isNaN(parsed)) ms = parsed;
      }
    }
    if (ms == null || !Number.isFinite(ms)) continue;
    stamps.set(String(eventType), new Date(ms).toISOString());
  }
  return stamps;
}

/**
 * Earliest occurrence timestamp per event type (lifetime, best-effort via EQL).
 * May fail on large projects when the lifetime query exceeds the EQL cost limit.
 */
async function loadEventFirstSeen(loomi, projectId, toolErrors, { onProgress } = {}) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(3200);

  onProgress?.({
    step: "eventFirstSeen",
    detail: "Finding first seen date per event type…",
    percent: 16,
  });

  try {
    const result = await loomi.callTool("execute_analytics_eql", {
      project_id: projectId,
      query: "select min any event timestamp by any event type",
    });
    if (result?.success === false || result?.error) {
      toolErrors.push({
        tool: "execute_analytics_eql",
        error: String(result.error || "event first-seen query failed"),
      });
      return { firstSeen: new Map(), ok: false };
    }
    const firstSeen = parseEventTypeTimestampRows(result);
    return { firstSeen, ok: firstSeen.size > 0 };
  } catch (err) {
    toolErrors.push({
      tool: "execute_analytics_eql",
      error: err.message || String(err),
    });
    return { firstSeen: new Map(), ok: false };
  }
}

/** Quote EQL identifiers that are not plain ASCII words. */
function eqlIdent(name) {
  const s = String(name || "").trim();
  if (!s) return '""';
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseSingleCount(eqlResult) {
  const value = Number(eqlResult?.data?.rows?.[0]?.values?.[0]);
  return Number.isFinite(value) ? value : null;
}

/** Infer a likely Data Manager type from a property/attribute name. */
function expectedTypeFromName(name) {
  const n = String(name || "").toLowerCase();
  if (
    /(_price|_amount|_quantity|_qty|_count|_score|_percent|_pct|_total|_points|_rating)$/.test(n) ||
    /^(price|quantity|score|rating|amount|total)$/.test(n)
  ) {
    return "number";
  }
  if (/(_date|_at|birthday|birth_date|dob)$/.test(n) || n === "birthday" || n === "dob") {
    return "date";
  }
  if (/^(is_|has_|was_|can_)/.test(n)) return "boolean";
  if (/_ids$/.test(n) || /_list$/.test(n)) return "list";
  return null;
}

function observedValueKind(value) {
  if (value == null || value === "") return "empty";
  if (value === "******") return "masked";
  if (Array.isArray(value)) return "list";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isFinite(value) ? "number" : "invalid_number";
  if (typeof value === "object") return "object";
  if (typeof value === "string") {
    const s = value.trim();
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return "number_string";
    if (/^\d{4}-\d{2}-\d{2}([T\s].*)?$/.test(s)) return "date_string";
    if (/^(true|false)$/i.test(s)) return "boolean_string";
    if (s.startsWith("[") && s.endsWith("]")) return "list_string";
    return "string";
  }
  return typeof value;
}

function valueMatchesDeclaredType(declaredType, value) {
  const t = String(declaredType || "").toLowerCase();
  const kind = observedValueKind(value);
  if (kind === "empty" || kind === "masked") return { ok: true, skipped: true, kind };

  if (t === "number") {
    if (kind === "number" || kind === "number_string") return { ok: true, kind };
    return { ok: false, kind, reason: `expected number, observed ${kind}` };
  }
  if (t === "date" || t === "datetime") {
    if (kind === "number" || kind === "number_string" || kind === "date_string") {
      return { ok: true, kind };
    }
    return { ok: false, kind, reason: `expected ${t}, observed ${kind}` };
  }
  if (t === "list") {
    if (kind === "list") return { ok: true, kind };
    if (kind === "list_string") {
      return { ok: false, kind, reason: "expected list, observed JSON array string" };
    }
    return { ok: false, kind, reason: `expected list, observed ${kind}` };
  }
  if (t === "boolean") {
    if (kind === "boolean" || kind === "boolean_string") return { ok: true, kind };
    if (kind === "number_string" && /^(0|1)$/.test(String(value).trim())) {
      return { ok: true, kind };
    }
    return { ok: false, kind, reason: `expected boolean, observed ${kind}` };
  }
  // string and unknown types: accept most values
  return { ok: true, kind };
}

function summarizeSample(value) {
  if (value == null) return "null";
  if (value === "******") return "******";
  if (Array.isArray(value)) return `[list:${value.length}]`;
  const s = String(value);
  return s.length > 48 ? `${s.slice(0, 45)}…` : s;
}

/**
 * Sample customer property values and compare against schema types.
 * Also flags name-vs-declared type hints and cross-event type conflicts.
 */
export function analyzeDataQuality(attributeRows, eventPropertyRows, samples = []) {
  const issues = [];
  const seen = new Set();
  const push = (issue) => {
    const key = `${issue.kind}|${issue.scope || ""}|${issue.property}|${issue.detail || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };

  for (const attr of attributeRows || []) {
    const suggested = expectedTypeFromName(attr.property);
    const declared = String(attr.type || "").toLowerCase();
    if (!suggested || !declared) continue;
    if (suggested === declared) continue;
    if (suggested === "date" && (declared === "date" || declared === "datetime")) continue;
    if (suggested === "boolean" && declared === "string") {
      push({
        kind: "schema_type_hint",
        severity: "low",
        scope: "customer",
        property: attr.property,
        declaredType: declared,
        suggestedType: suggested,
        detail: "Name looks like a flag; declared as string",
      });
      continue;
    }
    if (suggested !== declared) {
      push({
        kind: "schema_type_hint",
        severity: "low",
        scope: "customer",
        property: attr.property,
        declaredType: declared,
        suggestedType: suggested,
        detail: `Name suggests ${suggested}`,
      });
    }
  }

  for (const prop of eventPropertyRows || []) {
    const suggested = expectedTypeFromName(prop.property);
    const declared = String(prop.type || "").toLowerCase();
    if (!suggested || !declared) continue;
    if (suggested === declared) continue;
    if (suggested === "date" && (declared === "date" || declared === "datetime")) continue;
    if (suggested === "boolean" && declared === "string") continue;
    push({
      kind: "schema_type_hint",
      severity: "low",
      scope: "event",
      property: `${prop.eventType}.${prop.property}`,
      declaredType: declared,
      suggestedType: suggested,
      detail: `Name suggests ${suggested} on ${prop.eventType}`,
    });
  }

  const byName = new Map();
  for (const prop of eventPropertyRows || []) {
    const key = String(prop.property || "");
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(prop);
  }
  for (const [name, props] of byName) {
    const types = [...new Set(props.map((p) => String(p.type || "").toLowerCase()).filter(Boolean))];
    if (types.length < 2) continue;
    push({
      kind: "cross_event_type_conflict",
      severity: "medium",
      scope: "event",
      property: name,
      declaredType: types.join(" | "),
      detail: types
        .map((t) => {
          const events = props.filter((p) => String(p.type || "").toLowerCase() === t).map((p) => p.eventType);
          return `${t} (${[...new Set(events)].slice(0, 4).join(", ")})`;
        })
        .join("; "),
    });
  }

  const schemaByProp = new Map(
    (attributeRows || []).map((a) => [String(a.property), a])
  );
  const mismatchCounts = new Map();

  for (const sample of samples || []) {
    const props = sample.properties || {};
    for (const [name, entry] of Object.entries(props)) {
      const schema = schemaByProp.get(name);
      if (!schema) continue;
      const value = entry && typeof entry === "object" && "value" in entry ? entry.value : entry;
      const check = valueMatchesDeclaredType(schema.type, value);
      if (check.skipped || check.ok) continue;
      const key = name;
      const prev = mismatchCounts.get(key) || {
        count: 0,
        examples: [],
        declaredType: schema.type,
        observedKinds: new Set(),
      };
      prev.count += 1;
      prev.observedKinds.add(check.kind);
      if (prev.examples.length < 3) {
        prev.examples.push(summarizeSample(value));
      }
      mismatchCounts.set(key, prev);
    }
  }

  for (const [property, info] of mismatchCounts) {
    push({
      kind: "value_type_mismatch",
      severity: "medium",
      scope: "customer",
      property,
      declaredType: info.declaredType,
      observed: [...info.observedKinds].join(", "),
      detail: `${info.count} sample value(s); e.g. ${info.examples.join(", ")}`,
      sampleHits: info.count,
    });
  }

  return {
    issues: issues.sort((a, b) => {
      const rank = { medium: 0, low: 1, high: -1 };
      return (rank[a.severity] ?? 2) - (rank[b.severity] ?? 2);
    }),
    sampleSize: samples.length,
    sampledCustomers: samples.length,
    note:
      samples.length > 0
        ? `Based on ${samples.length} customer profile(s) plus schema name heuristics.`
        : "Schema heuristics only — customer value sampling unavailable.",
  };
}

/**
 * Prefer registered profiles, then fetch property bags for type checks.
 */
async function loadCustomerPropertySamples(
  loomi,
  projectId,
  toolErrors,
  { onProgress, sampleSize = 6 } = {}
) {
  const samples = [];
  try {
    onProgress?.({
      step: "dataQuality",
      detail: "Sampling customer profiles for data quality…",
      percent: 37,
    });
    const listed = await loomi.callTool("list_customers", {
      project_id: projectId,
      count: Math.min(40, Math.max(sampleSize * 4, 20)),
      skip: 0,
    });
    const customers = listed?.data || listed?.customers || [];
    const ranked = [...customers]
      .sort((a, b) => {
        const ar = a?.ids?.registered ? 1 : 0;
        const br = b?.ids?.registered ? 1 : 0;
        return br - ar;
      })
      .slice(0, sampleSize);

    for (let i = 0; i < ranked.length; i += 1) {
      const customerId = ranked[i]._id || ranked[i].id;
      if (!customerId) continue;
      onProgress?.({
        step: "dataQuality",
        detail: `Checking property values (${i + 1}/${ranked.length})…`,
        percent: 37 + Math.round((i / Math.max(ranked.length, 1)) * 3),
      });
      try {
        const bag = await loomi.callTool("get_customer_properties", {
          project_id: projectId,
          customer_id: customerId,
        });
        samples.push({
          customerId,
          properties: bag?.properties || {},
        });
      } catch (err) {
        toolErrors.push({
          tool: "get_customer_properties",
          error: err.message || String(err),
        });
      }
    }
  } catch (err) {
    toolErrors.push({
      tool: "list_customers",
      error: err.message || String(err),
    });
  }
  return samples;
}

function matchLiveScenario(campaignName, scenarios = []) {
  const needle = String(campaignName || "").trim().toLowerCase();
  if (!needle) return null;
  const exact = scenarios.find((s) => String(s.name || "").trim().toLowerCase() === needle);
  if (exact) return exact;
  const partial = scenarios.find((s) => {
    const name = String(s.name || "").trim().toLowerCase();
    return name && (needle.includes(name) || name.includes(needle));
  });
  return partial || null;
}

function parseCampaignMetricRows(eqlResult) {
  const rows = eqlResult?.data?.rows || eqlResult?.rows || [];
  const out = [];
  for (const row of rows) {
    const name = row?.headers?.[0]?.value;
    if (!name || row?.headers?.[0]?.type === "other") continue;
    const values = row.values || [];
    const delivered = Number(values[0] ?? 0) || 0;
    const opens = Number(values[1] ?? 0) || 0;
    const clicks = Number(values[2] ?? 0) || 0;
    out.push({
      campaignName: String(name),
      delivered,
      opens,
      clicks,
      openRate: delivered > 0 ? opens / delivered : null,
      ctr: opens > 0 ? clicks / opens : delivered > 0 ? clicks / delivered : null,
      revenue: null,
    });
  }
  return out;
}

/**
 * Top campaigns/scenarios by opens & clicks (last 30 days).
 * Revenue is included when purchase events carry campaign attribution; otherwise null.
 */
async function loadScenarioPerformance(loomi, projectId, scenarioRows, toolErrors) {
  const query =
    'select count(event campaign where .status = "delivered"), count(event campaign where .status = "opened"), count(event campaign where .status = "clicked") by event campaign.campaign_name grouping top 20 in last 30 days';

  let engagementRows = [];
  try {
    const result = await loomi.callTool("execute_analytics_eql", {
      project_id: projectId,
      query,
    });
    if (result?.success === false || result?.error) {
      toolErrors.push({
        tool: "execute_analytics_eql",
        error: String(result.error || "scenario performance query failed"),
      });
    } else {
      engagementRows = parseCampaignMetricRows(result);
    }
  } catch (err) {
    toolErrors.push({
      tool: "execute_analytics_eql",
      error: err.message || String(err),
    });
  }

  // Optional revenue attribution (often missing on purchase events)
  const revenueByCampaign = new Map();
  try {
    const revenueResult = await loomi.callTool("execute_analytics_eql", {
      project_id: projectId,
      query:
        "select sum event purchase.total_price by event purchase.campaign_name grouping top 20 in last 30 days",
    });
    for (const row of revenueResult?.data?.rows || []) {
      const name = row?.headers?.[0]?.value;
      const value = Number(row?.values?.[0] ?? 0);
      if (name && Number.isFinite(value) && value > 0) {
        revenueByCampaign.set(String(name), value);
      }
    }
  } catch {
    // purchase campaign attribution not available — leave revenue null
  }

  const rows = engagementRows
    .map((row) => {
      const matched = matchLiveScenario(row.campaignName, scenarioRows);
      const revenue = revenueByCampaign.get(row.campaignName) ?? null;
      const kind =
        matched?.kind ||
        (isOneOffBauScenario(row.campaignName) ? "BAU" : "Automation");
      const triggerMode = matched?.triggerMode || "unknown";
      return {
        ...row,
        revenue,
        matchedScenarioId: matched?.id || null,
        matchedScenarioName: matched?.name || null,
        kind,
        triggerMode,
      };
    })
    // Top performing = always-on, event-triggered automations (exclude BAU / FY / date triggers)
    .filter((row) => {
      if (row.kind !== "Automation") return false;
      if (isOneOffBauScenario(row.campaignName)) return false;
      if (row.matchedScenarioName && isOneOffBauScenario(row.matchedScenarioName)) {
        return false;
      }
      // Require on-event trigger when we know the scenario
      if (row.matchedScenarioId) {
        return row.triggerMode === "event";
      }
      // Unmatched campaign names: keep only if they don't look date-scheduled
      return !/\b(daily|weekly|monthly|scheduled|calendar)\b/i.test(row.campaignName);
    })
    .sort((a, b) => b.clicks - a.clicks || b.opens - a.opens || b.delivered - a.delivered)
    .slice(0, 15)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    windowDays: 30,
    rows,
    revenueAvailable: [...revenueByCampaign.values()].some((v) => v > 0),
  };
}

async function loadChannelUsage(loomi, projectId, scenarioRows, toolErrors) {
  const channels = emptyChannelMap();

  for (const scenario of scenarioRows) {
    for (const name of scenario.channels || []) {
      markChannelUsed(channels, name, "Live scenarios");
    }
  }

  // Active campaign modules still count as utilised when running.
  const campaignChecks = [
    { tool: "search_email_campaigns", channel: "Email", label: "email campaign" },
    { tool: "search_sms_campaigns", channel: "SMS", label: "SMS campaign" },
    { tool: "search_banners", channel: "Weblayer", label: "weblayer / banner" },
    { tool: "search_in_app_messages", channel: "In App", label: "in-app message" },
  ];

  for (const check of campaignChecks) {
    const result = await callOptional(
      loomi,
      check.tool,
      { project_id: projectId },
      toolErrors,
      { quiet: true }
    );
    if (!result) continue;
    const active = unwrapList(result, ["data"]).filter(isActiveCampaign);
    if (active.length) {
      markChannelUsed(
        channels,
        check.channel,
        `${active.length} active ${check.label}(s)`
      );
    }
  }

  // Ground truth for sends: campaign.action_type over the last 90 days.
  // (Loomi Connect cannot list integrations / sender profiles.)
  const actionCounts = await loadCampaignActionTypeCounts(loomi, projectId, toolErrors);
  const channelEventCounts = Object.fromEntries(CHANNEL_ORDER.map((n) => [n, 0]));
  for (const [actionType, count] of actionCounts.entries()) {
    const channel = channelFromCampaignActionType(actionType);
    if (!channel) continue;
    channelEventCounts[channel] += count;
    markChannelUsed(
      channels,
      channel,
      `campaign events (${actionType}: ${count.toLocaleString()})`
    );
  }

  const rows = CHANNEL_ORDER.map((name) => {
    const entry = channels[name];
    return {
      name,
      used: entry.used,
      available: entry.used,
      status: entry.used ? "utilised" : "not_utilised",
      sources: entry.sources,
      evidence: entry.evidence,
      campaignEventCount: channelEventCounts[name] || 0,
    };
  });

  return {
    channels: rows,
    used: rows.filter((r) => r.used).map((r) => r.name),
    availableUnused: [],
    unavailable: rows.filter((r) => !r.used).map((r) => r.name),
    actionTypes: Object.fromEntries(actionCounts),
  };
}

async function loadAiPersonalization(loomi, projectId, scenarioRows, toolErrors, { onProgress } = {}) {
  onProgress?.({ step: "recommendations", detail: "Loading recommendation engines…", percent: 55 });
  const recResult = await callOptional(
    loomi,
    "search_recommendations",
    { project_id: projectId },
    toolErrors
  );
  const recList = unwrapList(recResult, ["data"]).filter((r) => r && !r.archived);
  const engines = recList.map((r) => ({
    id: r._id || r.id || "",
    name: r.name || "",
    status: r.status || "",
    tags: r.tags || [],
    running: ["running", "active", "live"].includes(String(r.status || "").toLowerCase()),
  }));

  // Sample engines for Recommendations+ detection + catalog ID discovery
  const plusCandidates = [...engines]
    .sort((a, b) => Number(b.running) - Number(a.running))
    .filter((e) => /personalized|journey|recs?\+|recommendations?\+/i.test(e.name))
    .slice(0, 8);
  const runningSample = engines.filter((e) => e.running).slice(0, 8);
  const sampleMap = new Map();
  for (const engine of [...plusCandidates, ...runningSample]) {
    if (engine.id) sampleMap.set(engine.id, engine);
  }
  const sample = [...sampleMap.values()].slice(0, 12);

  let recommendationsPlusCount = 0;
  const plusEngines = [];
  const recommendationCatalogRefs = [];
  let i = 0;
  for (const engine of sample) {
    i += 1;
    onProgress?.({
      step: "recommendations",
      detail: `Inspecting recommendation engines (${i}/${sample.length})…`,
      percent: 55 + Math.round((i / Math.max(sample.length, 1)) * 10),
    });
    const detail = await callOptional(
      loomi,
      "search_recommendations",
      { project_id: projectId, recommendation_id: engine.id },
      toolErrors
    );
    const definition = detail?.data?.definition ?? detail?.definition ?? {};
    const catalogId =
      definition?.mapping?.catalog ||
      definition?.catalog ||
      definition?.catalog_id ||
      null;
    if (catalogId) {
      recommendationCatalogRefs.push({
        catalogId: String(catalogId),
        engineId: engine.id,
        engineName: engine.name,
      });
    }
    if (isRecommendationsPlus(definition)) {
      recommendationsPlusCount += 1;
      plusEngines.push({
        ...engine,
        modelType: definition.model_type || "",
        type: definition.type || "",
      });
    }
  }

  onProgress?.({ step: "predictions", detail: "Loading predictions…", percent: 68 });
  const predResult = await callOptional(
    loomi,
    "search_predictions",
    { project_id: projectId },
    toolErrors
  );
  const predictions = unwrapList(predResult, ["data"])
    .filter((p) => p && !p.archived)
    .map((p) => ({
      id: p._id || p.id || "",
      name: p.name || "",
      status: p.status || p.job_info?.status || "",
      tags: p.tags || [],
    }));

  onProgress?.({ step: "autosegments", detail: "Loading autosegments…", percent: 72 });
  const autoResult = await callOptional(
    loomi,
    "search_autosegments",
    { project_id: projectId },
    toolErrors
  );
  const autosegments = unwrapList(autoResult, ["data"])
    .filter((a) => a && !a.archived)
    .map((a) => ({
      id: a._id || a.id || "",
      name: a.name || "",
      status: a.job_info?.status || a.status || "",
      lastRunAt: a.job_info?.last_run_at
        ? new Date(a.job_info.last_run_at * 1000).toISOString()
        : null,
      tags: a.tags || [],
    }));

  onProgress?.({
    step: "contextual",
    detail: "Checking weblayer templates for personalization & recommendations…",
    percent: 76,
  });
  const contextualFromScenarios = scenarioRows.filter((s) => s.usesContextualPersonalization);
  const bannerScan = await detectContextualInBanners(loomi, projectId, toolErrors);
  const contextualBannerHits = bannerScan.contextualHits || [];
  const bannerRecUsages = bannerScan.recommendationUsages || [];

  // Map recommendation engine ID → usages in scenarios / weblayers
  const usageByEngineId = new Map();
  const pushUsage = (engineId, usage) => {
    if (!engineId) return;
    const key = String(engineId);
    if (!usageByEngineId.has(key)) usageByEngineId.set(key, []);
    const list = usageByEngineId.get(key);
    const dedupe = `${usage.kind}|${usage.name}|${usage.id || ""}`;
    if (list.some((u) => `${u.kind}|${u.name}|${u.id || ""}` === dedupe)) return;
    list.push(usage);
  };

  for (const scenario of scenarioRows || []) {
    for (const recommendationId of scenario.recommendationIds || []) {
      pushUsage(recommendationId, {
        kind: "scenario",
        id: scenario.id,
        name: scenario.name,
      });
    }
    // Fallback: signal text may include id
    for (const signal of scenario.personalizationSignals || []) {
      if (signal.recommendationId) {
        pushUsage(signal.recommendationId, {
          kind: "scenario",
          id: scenario.id,
          name: scenario.name,
        });
      }
    }
  }
  for (const row of bannerRecUsages) {
    pushUsage(row.recommendationId, {
      kind: "weblayer",
      id: row.bannerId,
      name: row.bannerName,
      status: row.status,
    });
  }

  const enginesWithUsage = engines.map((engine) => {
    const usedIn = usageByEngineId.get(String(engine.id)) || [];
    return {
      ...engine,
      usedInTemplates: usedIn.length > 0,
      usedIn,
      usedInSummary: usedIn.length
        ? usedIn
            .map((u) => `${u.kind === "weblayer" ? "Weblayer" : "Scenario"}: ${u.name}`)
            .join("; ")
        : "",
    };
  });

  const usedEngineCount = enginesWithUsage.filter((e) => e.usedInTemplates).length;
  const templateUsageCount = [...usageByEngineId.values()].reduce((n, list) => n + list.length, 0);

  const scenarioHits = scenarioRows
    .filter((s) => (s.personalizationSignals || []).length || (s.recommendationIds || []).length)
    .map((s) => ({
      scenarioId: s.id,
      scenarioName: s.name,
      signals: s.personalizationSignals,
      recommendationIds: s.recommendationIds || [],
    }));

  const features = {
    recommendations: {
      used: usedEngineCount > 0 || templateUsageCount > 0,
      count: engines.length,
      runningCount: engines.filter((e) => e.running).length,
      usedInTemplatesCount: usedEngineCount,
      detail: engines.length
        ? `${usedEngineCount} used in templates / ${engines.filter((e) => e.running).length} running / ${engines.length} engines`
        : "None",
    },
    contextualPersonalization: {
      used: contextualFromScenarios.length > 0 || contextualBannerHits.length > 0,
      count: contextualFromScenarios.length + contextualBannerHits.length,
      detail:
        contextualFromScenarios.length || contextualBannerHits.length
          ? `${contextualFromScenarios.length} scenario(s), ${contextualBannerHits.length} weblayer(s)`
          : "Not detected",
    },
    predictions: {
      used: predictions.length > 0,
      count: predictions.length,
      detail: predictions.length ? `${predictions.length} prediction(s)` : "None",
    },
    autosegments: {
      used: autosegments.length > 0,
      count: autosegments.length,
      detail: autosegments.length ? `${autosegments.length} autosegment(s)` : "None",
    },
    recommendationsPlus: {
      used: recommendationsPlusCount > 0,
      count: recommendationsPlusCount,
      detail: recommendationsPlusCount
        ? `${recommendationsPlusCount} journey-based engine(s)`
        : "Not detected",
    },
  };

  return {
    engines: enginesWithUsage,
    runningCount: features.recommendations.runningCount,
    totalCount: engines.length,
    usedInTemplatesCount: usedEngineCount,
    scenarioHits,
    used: Object.values(features).some((f) => f.used),
    features,
    predictions,
    autosegments,
    plusEngines,
    recommendationCatalogRefs,
    contextual: {
      scenarios: contextualFromScenarios.map((s) => ({ id: s.id, name: s.name })),
      banners: contextualBannerHits,
    },
  };
}

function isRecommendationsPlus(definition = {}) {
  const modelType = String(definition.model_type || "").toLowerCase();
  const persType = String(
    definition.personalization_type || definition.personalization || ""
  ).toLowerCase();
  if (persType.includes("journey")) return true;
  if (/journey|sequential|transformer|neural|^nn$|recs?_?plus/.test(modelType)) return true;
  // Non-CF personalized models are treated as Recommendations+
  if (definition.type === "personalized" && modelType && modelType !== "cf") return true;
  return false;
}

function payloadHasContextualPersonalization(payload) {
  if (!payload || typeof payload !== "object") return false;
  try {
    const blob = JSON.stringify(payload);
    return (
      /"contextual_personalization"\s*:\s*(true|"enabled"|"contextual")/i.test(blob) ||
      /"personalization_type"\s*:\s*"contextual"/i.test(blob) ||
      /"optimization_type"\s*:\s*"contextual"/i.test(blob) ||
      /"variant_selector"\s*:\s*"contextual"/i.test(blob) ||
      /"type"\s*:\s*"contextual[_-]personalization"/i.test(blob)
    );
  } catch {
    return false;
  }
}

function nodesUseContextualPersonalization(nodes = []) {
  return nodes.some((node) => {
    const type = String(node?.type || "").toLowerCase();
    if (type.includes("contextual")) return true;
    return payloadHasContextualPersonalization(node);
  });
}

function extractWeblayersFromNodes(nodes = []) {
  const refs = [];
  const seen = new Set();

  const pushRef = (id, name, nodeType) => {
    const key = `${id || ""}|${name || ""}`;
    if (!id && !name) return;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({
      id: id ? String(id) : null,
      name: name || null,
      nodeType: nodeType || null,
    });
  };

  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const type = String(node.type || "").toLowerCase();
    const isWeblayerNode =
      type.includes("banner") ||
      type.includes("weblayer") ||
      type.includes("serve-banner") ||
      type.includes("web-layer");
    if (!isWeblayerNode) continue;

    pushRef(
      node.banner_id ||
        node.bannerId ||
        node.weblayer_id ||
        node.weblayerId ||
        node.campaign_id ||
        node.campaignId ||
        null,
      node.name || node.banner_name || node.bannerName || node.weblayer_name || null,
      node.type
    );

    // Nested config shapes
    const nested =
      node.banner || node.weblayer || node.config || node.data || node.params || null;
    if (nested && typeof nested === "object") {
      pushRef(
        nested._id || nested.id || nested.banner_id || nested.bannerId || null,
        nested.name || nested.banner_name || null,
        node.type
      );
    }
  }

  return refs;
}

function isActiveWeblayer(item) {
  if (!item || item.archived) return false;
  const status = String(item.status || "").toLowerCase();
  return status === "active" || status === "live" || status === "running" || status === "finishing";
}

async function loadActiveWeblayers(loomi, projectId, scenarioRows, toolErrors) {
  const listed = await callOptional(
    loomi,
    "search_banners",
    { project_id: projectId },
    toolErrors
  );
  const all = unwrapList(listed, ["data"]);
  const active = all.filter(isActiveWeblayer);

  const rows = active.map((banner) => {
    const id = String(banner._id || banner.id || "");
    const name = banner.name || id;
    const editedRaw = banner.edited ?? banner.updated ?? banner.updated_at ?? null;
    const edited =
      editedRaw == null
        ? null
        : typeof editedRaw === "number"
          ? new Date(editedRaw * 1000).toISOString()
          : new Date(editedRaw).toISOString();

    return {
      id,
      name,
      status: banner.status || "active",
      tags: banner.tags || [],
      initiativeId: banner.initiative_id || null,
      edited: edited && !Number.isNaN(Date.parse(edited)) ? edited : null,
    };
  });

  return {
    active: rows.sort((a, b) => a.name.localeCompare(b.name)),
    total: all.filter((b) => !b.archived).length,
    activeCount: rows.length,
  };
}

async function detectContextualInBanners(loomi, projectId, toolErrors) {
  const listed = await callOptional(
    loomi,
    "search_banners",
    { project_id: projectId },
    toolErrors
  );
  const banners = unwrapList(listed, ["data"]).filter((b) => b && !b.archived);
  // Prefer active banners; also include inactive ones that look recommendation-related
  const prioritized = [
    ...banners.filter(isActiveWeblayer),
    ...banners.filter(
      (b) => !isActiveWeblayer(b) && /recommend/i.test(String(b.name || ""))
    ),
  ];
  const seenBanner = new Set();
  const sample = [];
  for (const banner of prioritized) {
    const id = String(banner._id || banner.id || "");
    if (!id || seenBanner.has(id)) continue;
    seenBanner.add(id);
    sample.push(banner);
    if (sample.length >= 25) break;
  }

  const contextualHits = [];
  const recommendationUsages = []; // { recommendationId, bannerId, bannerName, status }

  for (const banner of sample) {
    const id = banner._id || banner.id;
    const detail = await callOptional(
      loomi,
      "search_banners",
      { project_id: projectId, banner_id: id },
      toolErrors
    );
    const payload = detail?.data ?? detail ?? banner;
    const name = payload.name || banner.name || id;
    if (payloadHasContextualPersonalization(payload)) {
      contextualHits.push({ id, name });
    }
    for (const recommendationId of extractRecommendationIdsFromPayload(payload)) {
      recommendationUsages.push({
        recommendationId,
        bannerId: String(id),
        bannerName: name,
        status: payload.status || banner.status || "",
      });
    }
  }
  return { contextualHits, recommendationUsages };
}

async function loadLiveScenarios(loomi, project, toolErrors, { onProgress } = {}) {
  const projectId = project.id;
  onProgress?.({ step: "scenarios", detail: "Listing scenarios…", percent: 40 });
  const listed = await callOptional(
    loomi,
    "search_scenarios",
    { project_id: projectId },
    toolErrors
  );
  const all = unwrapList(listed, ["data"]);
  const live = all.filter(isLiveScenario).slice(0, 25);

  const rows = [];
  let index = 0;
  for (const summary of live) {
    index += 1;
    onProgress?.({
      step: "scenarios",
      detail: `Analyzing live scenario ${index}/${live.length}…`,
      percent: 40 + Math.round((index / Math.max(live.length, 1)) * 10),
    });
    const scenarioId = summary._id || summary.id;
    const detail = await callOptional(
      loomi,
      "search_scenarios",
      {
        project_id: projectId,
        scenario_id: scenarioId,
        include_node_designs: true,
      },
      toolErrors
    );
    const payload = detail?.data ?? detail ?? summary;
    const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
    const extracted = extractEventsFromScenarioPayload({ data: payload });
    const nodeTypes = [...new Set(nodes.map((n) => n.type).filter(Boolean))];
    const channels = extractChannelsFromNodes(nodes);
    const weblayers = extractWeblayersFromNodes(nodes);
    const personalization = detectScenarioPersonalization(nodes);
    const personalizationSignals = personalization.signals;
    const recommendationIds = personalization.recommendationIds;
    const usesContextualPersonalization = nodesUseContextualPersonalization(nodes);
    const triggerMode = detectScenarioTriggerMode(payload);

    rows.push({
      id: scenarioId,
      name: payload.name || summary.name || scenarioId,
      status: payload.status || summary.status || "",
      archived: Boolean(payload.archived ?? summary.archived),
      oneOff: isOneOffBauScenario(payload.name || summary.name || ""),
      kind: scenarioKind(payload.name || summary.name || ""),
      triggerMode,
      tags: payload.tags || summary.tags || [],
      initiativeId: payload.initiative_id || summary.initiative_id || null,
      createdBy: payload.created_by_display_name || summary.created_by_display_name || "",
      edited: payload.edited
        ? new Date(payload.edited * 1000).toISOString()
        : summary.edited
          ? new Date(summary.edited * 1000).toISOString()
          : null,
      eventsUsed: extracted.events,
      eventUsages: extracted.usages,
      channels,
      weblayers,
      personalizationSignals,
      recommendationIds,
      usesPersonalization: personalizationSignals.length > 0 || recommendationIds.length > 0,
      usesContextualPersonalization,
      nodeTypes,
      nodeCount: nodes.length || null,
      url: scenarioUiUrl(project.url, scenarioId),
    });
  }

  return {
    allCount: all.length,
    liveCount: live.length,
    draftCount: all.filter((s) => String(s.status || "").toLowerCase() === "draft").length,
    scenarios: rows.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function summarizeCatalogUsages(usagePayload) {
  const data = usagePayload?.used_by ? usagePayload : usagePayload?.data ?? usagePayload ?? {};
  const usedBy = data.used_by ?? {};
  const labels = {
    scenarios: "scenarios",
    recommendations: "recommendations",
    email_campaigns: "email campaigns",
    sms_campaigns: "SMS campaigns",
    banners: "banners",
    experiments: "experiments",
    in_app_messages: "in-app messages",
    surveys: "surveys",
    other: "other",
  };

  let total = 0;
  const parts = [];
  const counts = {};
  for (const [key, label] of Object.entries(labels)) {
    const list = Array.isArray(usedBy[key]) ? usedBy[key] : [];
    counts[key] = list.length;
    total += list.length;
    if (!list.length) continue;
    const names = list
      .map((item) =>
        typeof item === "string"
          ? item
          : item?.name || item?.display_name || item?.title || item?.id || item?._id || ""
      )
      .filter(Boolean);
    if (names.length && names.length <= 3) {
      parts.push(`${label}: ${names.join(", ")}`);
    } else if (names.length) {
      parts.push(`${list.length} ${label} (${names.slice(0, 2).join(", ")}…)`);
    } else {
      parts.push(`${list.length} ${label}`);
    }
  }

  const usedInMapping = Boolean(data.used_by_data_mapping);
  return {
    counts,
    total,
    usedInMapping,
    source: "loomi",
    summary: parts.length
      ? parts.join("; ")
      : usedInMapping
        ? "Used in data mapping"
        : "None",
    used: total > 0 || usedInMapping,
  };
}

function deriveCatalogUsages(catalogId, { mapping = null, recommendationCatalogRefs = [] } = {}) {
  const parts = [];
  const mapData = mapping?.data ?? mapping ?? {};
  const mapped = mapData.catalogs ?? {};
  const mainId = formatMappedValue(mapped.main);
  const variantId = formatMappedValue(mapped.variant);
  const usedInMapping = mainId === catalogId || variantId === catalogId;
  if (usedInMapping) {
    const roles = [];
    if (mainId === catalogId) roles.push("main");
    if (variantId === catalogId) roles.push("variant");
    parts.push(`Data mapping (${roles.join(", ")})`);
  }

  const recHits = recommendationCatalogRefs.filter((r) => r.catalogId === catalogId);
  if (recHits.length) {
    const names = recHits.map((r) => r.engineName).filter(Boolean);
    parts.push(
      names.length <= 3
        ? `recommendations: ${names.join(", ")}`
        : `${recHits.length} recommendations (${names.slice(0, 2).join(", ")}…)`
    );
  }

  return {
    counts: { recommendations: recHits.length },
    total: recHits.length + (usedInMapping ? 1 : 0),
    usedInMapping,
    source: "derived",
    summary: parts.length
      ? `${parts.join("; ")} (derived — Catalog V2 usage API unavailable)`
      : "Usages unavailable (Catalog V2 API only)",
    used: parts.length > 0,
  };
}

async function loadCatalogs(loomi, project, mapping, toolErrors, { recommendationCatalogRefs = [], onProgress } = {}) {
  const projectId = project.id;
  onProgress?.({ step: "catalogs", detail: "Listing catalogs…", percent: 82 });
  const listed = await callOptional(
    loomi,
    "search_catalogs",
    { project_id: projectId },
    toolErrors
  );
  const byId = new Map();

  for (const cat of unwrapList(listed, ["data"])) {
    const id = cat?._id || cat?.id;
    if (id) byId.set(String(id), cat);
  }

  // Resolve catalog IDs from data mapping (main / variant)
  const mapData = mapping?.data ?? mapping ?? {};
  const mappedCatalogs = mapData.catalogs ?? {};
  const extraIds = new Set();
  for (const key of ["main", "variant"]) {
    const raw = mappedCatalogs[key];
    const id = formatMappedValue(raw) || (typeof raw === "string" ? raw : null);
    if (id) extraIds.add(String(id));
  }
  for (const ref of recommendationCatalogRefs) {
    if (ref?.catalogId) extraIds.add(String(ref.catalogId));
  }

  for (const id of extraIds) {
    if (byId.has(id)) continue;
    const detail = await callOptional(
      loomi,
      "search_catalogs",
      { project_id: projectId, catalog_id: id },
      toolErrors,
      { quiet: true }
    );
    const cat = detail?.data ?? detail;
    const resolvedId = cat?._id || cat?.id;
    if (resolvedId) byId.set(String(resolvedId), cat);
  }

  const rows = [];
  let index = 0;
  for (const cat of byId.values()) {
    index += 1;
    const id = String(cat._id || cat.id || "");
    onProgress?.({
      step: "catalogs",
      detail: `Loading catalog usages (${index}/${byId.size})…`,
      percent: 82 + Math.round((index / Math.max(byId.size, 1)) * 10),
    });

    const usageResult = await callOptional(
      loomi,
      "get_catalog_usages",
      { project_id: projectId, catalog_id: id },
      toolErrors,
      { quiet: true }
    );

    let usages;
    if (usageResult && (usageResult.used_by || usageResult.data?.used_by || usageResult.success)) {
      usages = summarizeCatalogUsages(usageResult);
    } else {
      usages = deriveCatalogUsages(id, { mapping, recommendationCatalogRefs });
    }

    rows.push({
      id,
      name: cat.name || "",
      displayName: cat.display_name || cat.name || id,
      type: cat.type || "",
      description: cat.description || "",
      createdBy: cat.created_by_display_name || "",
      created: cat.created ? new Date(cat.created * 1000).toISOString() : null,
      url: catalogUiUrl(project.url, id),
      usages,
      used: Boolean(usages.used),
      usedInMapping: Boolean(usages.usedInMapping),
      usageSummary: usages.summary,
      usageSource: usages.source,
    });
  }

  return {
    available: true,
    catalogs: rows.sort((a, b) =>
      (a.displayName || a.name).localeCompare(b.displayName || b.name)
    ),
  };
}

/**
 * Run a full project data audit via Loomi MCP tools.
 * @param {import('./client.js').LoomiClient} loomi
 * @param {object} project
 * @param {{ onProgress?: (p: { step: string, detail: string, percent: number }) => void, glean?: import('./client.js').LoomiClient | null }} [options]
 */
export async function runProjectAudit(loomi, project, { onProgress, glean = null } = {}) {
  const projectId = project.id;
  const toolErrors = [];
  const progress = (step, detail, percent) => {
    onProgress?.({ step, detail, percent });
  };

  let clientBrief = null;
  const gleanMeta = { connected: false, needsAuth: false, authUrl: null };

  // Run Glean client brief in parallel with Loomi audit work (separate MCP / rate limits)
  const gleanPromise = (async () => {
    if (!glean) return { brief: null, meta: gleanMeta };
    const meta = { connected: false, needsAuth: false, authUrl: null };
    try {
      await glean.ensureConnected();
      meta.connected = true;
      const { fetchClientBrief } = await import("../glean/clientBrief.js");
      const brief = await fetchClientBrief(glean, {
        name: project.name,
        workspace: project.workspace_name || project.workspace,
        category: project.category,
      });
      return { brief, meta };
    } catch (err) {
      if (err.code === "NEEDS_AUTH") {
        meta.needsAuth = true;
        meta.authUrl = err.authUrl || glean.authProvider?.pendingAuthUrl || null;
      } else {
        toolErrors.push({
          tool: "glean.search",
          error: err.message || String(err),
        });
      }
      return { brief: null, meta };
    }
  })();

  progress("overview", "Loading project overview (+ Glean in parallel)…", 4);
  const overview = await loomi.callTool("get_project_overview", {
    project_id: projectId,
  });

  progress("events", "Loading event schema…", 10);
  const eventSchema = await loomi.callTool("get_event_schema", {
    project_id: projectId,
  });

  progress("eventVolumes", "Counting events & customers (last 30 days)…", 12);
  const eventVolumes = await loadEventVolumes(loomi, projectId, toolErrors, {
    onProgress,
  });

  progress("eventFirstSeen", "Finding first seen date per event type…", 16);
  const eventFirstSeen = await loadEventFirstSeen(loomi, projectId, toolErrors, {
    onProgress,
  });

  progress("properties", "Loading customer properties…", 18);
  const propertySchema = await loomi.callTool("get_customer_property_schema", {
    project_id: projectId,
  });

  progress("identifiers", "Loading customer identifiers…", 22);
  const identifierSchema = await callOptional(
    loomi,
    "get_customer_schema",
    { project_id: projectId },
    toolErrors
  );

  progress("mapping", "Loading data mapping…", 28);
  const mapping = await callOptional(
    loomi,
    "get_mapping",
    { project_id: projectId },
    toolErrors
  );

  progress("consent", "Loading consent settings…", 34);
  const consentSettings = await callOptional(
    loomi,
    "get_consent_settings",
    { project_id: projectId },
    toolErrors
  );

  progress("dataQuality", "Checking data quality from sample profiles…", 36);
  const propertySamples = await loadCustomerPropertySamples(
    loomi,
    projectId,
    toolErrors,
    { onProgress, sampleSize: 6 }
  );

  progress("scenarios", "Loading live scenarios…", 40);
  const scenarios = await loadLiveScenarios(loomi, project, toolErrors, { onProgress });

  progress("weblayers", "Loading active weblayers…", 50);
  const weblayers = await loadActiveWeblayers(
    loomi,
    projectId,
    scenarios.scenarios,
    toolErrors
  );

  progress("channels", "Detecting channel usage from campaign events…", 52);
  const channels = await loadChannelUsage(
    loomi,
    projectId,
    scenarios.scenarios,
    toolErrors
  );

  progress("performance", "Loading top scenario performance…", 58);
  const scenarioPerformance = await loadScenarioPerformance(
    loomi,
    projectId,
    scenarios.scenarios,
    toolErrors
  );

  const recommendations = await loadAiPersonalization(
    loomi,
    projectId,
    scenarios.scenarios,
    toolErrors,
    { onProgress }
  );

  const catalogResult = await loadCatalogs(loomi, project, mapping, toolErrors, {
    recommendationCatalogRefs: recommendations.recommendationCatalogRefs || [],
    onProgress,
  });

  progress("glean", "Finishing Glean client documents…", 94);
  const gleanResult = await gleanPromise;
  clientBrief = gleanResult.brief;
  Object.assign(gleanMeta, gleanResult.meta);

  progress("assemble", "Building audit findings…", 96);
  const audit = buildAudit({
    project,
    overview,
    eventSchema,
    propertySchema,
    identifierSchema,
    mapping,
    consentSettings,
    catalogs: catalogResult.catalogs,
    catalogsAvailable: catalogResult.available,
    importRows: [],
    scenarios,
    channels,
    recommendations,
    weblayers,
    scenarioPerformance,
    eventVolumes,
    eventFirstSeen,
    clientBrief,
    propertySamples,
    toolErrors,
  });

  progress("vertical", "Verifying vertical use-case coverage…", 97);
  const { assessVerticalUseCases, enrichVerticalAssessmentWithGlean } = await import(
    "../glean/verticalUseCases.js"
  );
  let verticalAssessment = assessVerticalUseCases({
    project,
    clientBrief,
    scenarios: scenarios?.scenarios ?? [],
    channels: audit.channels || channels?.channels || [],
    eventRows: audit.events || [],
    personalization: audit.personalization || recommendations,
  });

  if (glean && gleanMeta.connected) {
    try {
      verticalAssessment = await enrichVerticalAssessmentWithGlean(glean, verticalAssessment, {
        project,
        clientBrief,
      });
      if (verticalAssessment.needsAuth) {
        gleanMeta.needsAuth = true;
        gleanMeta.authUrl = verticalAssessment.authUrl || gleanMeta.authUrl;
      }
    } catch (err) {
      toolErrors.push({
        tool: "glean.verticalAssessment",
        error: err.message || String(err),
      });
    }
  }

  // Prefer verified vertical on the client brief when present
  if (clientBrief && verticalAssessment?.vertical?.label) {
    clientBrief.vertical = verticalAssessment.vertical.label;
    audit.clientBrief = clientBrief;
  }

  let aiInsights = {
    available: false,
    source: null,
    error: glean ? null : "Glean not connected",
    summary: "",
    findings: [],
    adoption: [],
    extras: [],
    sources: [],
  };

  if (glean && gleanMeta.connected) {
    progress("aiInsights", "Generating AI recommendations via Glean…", 98);
    try {
      const { enrichFindingsWithGlean } = await import("../glean/aiInsights.js");
      aiInsights = await enrichFindingsWithGlean(glean, {
        project,
        findings: audit.findings,
        adoptionOpportunities: audit.adoptionOpportunities,
        clientBrief,
        verticalAssessment,
      });
      if (aiInsights.needsAuth) {
        gleanMeta.needsAuth = true;
        gleanMeta.authUrl = aiInsights.authUrl || gleanMeta.authUrl;
      }
    } catch (err) {
      toolErrors.push({
        tool: "glean.aiInsights",
        error: err.message || String(err),
      });
      aiInsights = {
        ...aiInsights,
        error: err.message || String(err),
      };
    }
  }

  progress("done", "Audit complete", 100);
  return { ...audit, verticalAssessment, aiInsights, glean: gleanMeta };
}
