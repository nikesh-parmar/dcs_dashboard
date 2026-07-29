/**
 * Vertical taxonomy + use-case coverage assessment.
 * Keep aligned with glean-skills/vertical-use-case-audit/.
 */

const COMMERCE_CORE = [
  {
    id: "welcome",
    title: "Welcome / onboarding",
    priority: "high",
    scenarioMatch: /welcome|onboarding|double.?opt|signup|sign.?up/i,
    eventHints: ["consent", "register"],
  },
  {
    id: "abandon_cart",
    title: "Abandon cart",
    priority: "high",
    scenarioMatch: /abandon.*(cart|basket)|cart.?abandon|basket.?abandon/i,
    eventHints: ["cart_update", "checkout"],
    preferChannels: ["Email", "SMS", "Push"],
  },
  {
    id: "abandon_browse",
    title: "Abandon browse",
    priority: "high",
    scenarioMatch: /abandon.*(browse|product|view)|browse.?abandon/i,
    eventHints: ["view_item", "view_category"],
  },
  {
    id: "post_purchase",
    title: "Post-purchase / cross-sell",
    priority: "medium",
    scenarioMatch: /post.?purchase|purchase.*(follow|cross)|thank.?you|order.?confirm/i,
    eventHints: ["purchase", "purchase_item"],
  },
  {
    id: "reactivation",
    title: "Win-back / reactivation",
    priority: "high",
    scenarioMatch: /reactivat|win.?back|lapsing|churn|winback|re-?engage/i,
    eventHints: [],
  },
  {
    id: "recommendations",
    title: "Product recommendations",
    priority: "high",
    feature: "recommendations",
  },
  {
    id: "contextual_ai",
    title: "Contextual personalization on key journeys",
    priority: "medium",
    feature: "contextualPersonalization",
  },
  {
    id: "price_drop",
    title: "Price drop / back in stock",
    priority: "low",
    scenarioMatch: /price.?drop|back.?in.?stock|wishlist/i,
    eventHints: ["view_item", "wishlist", "add_to_wishlist"],
  },
];

const HOSPITALITY_CORE = [
  {
    id: "welcome",
    title: "Welcome / signup",
    priority: "high",
    scenarioMatch: /welcome|onboarding|signup|sign.?up|loyalty|membership/i,
    eventHints: ["consent", "register"],
  },
  {
    id: "booking_confirmation",
    title: "Booking confirmation & pre-visit reminder",
    priority: "high",
    scenarioMatch: /booking|reservation|pre.?visit|visit.?remind|confirm|arrival/i,
    eventHints: ["booking", "reservation", "purchase"],
  },
  {
    id: "post_visit",
    title: "Post-visit follow-up / review request",
    priority: "medium",
    scenarioMatch: /post.?visit|feedback|review|nps|thank.?you|survey/i,
    eventHints: ["booking", "purchase"],
  },
  {
    id: "reactivation",
    title: "Win-back for lapsed guests",
    priority: "high",
    scenarioMatch: /reactivat|win.?back|winback|lapsing|lapsed|churn|re-?engage/i,
    eventHints: [],
  },
  {
    id: "occasion",
    title: "Birthday / occasion",
    priority: "medium",
    scenarioMatch: /birthday|occasion|anniversary|celebrat/i,
    eventHints: [],
  },
  {
    id: "group_events",
    title: "Group / corporate enquiry nurture",
    priority: "medium",
    scenarioMatch: /group|corporate|christmas|party|event.?enquir|private.?hire/i,
    eventHints: [],
  },
  {
    id: "weblayer_promo",
    title: "On-site / weblayer promo",
    priority: "low",
    requireChannel: "Weblayer",
  },
  {
    id: "sms_updates",
    title: "SMS for time-critical booking updates",
    priority: "medium",
    requireChannelAny: ["SMS", "Push"],
  },
];

/** @type {Array<{ id: string, label: string, match: RegExp, useCases: object[] }>} */
export const VERTICAL_PACK = [
  {
    id: "hospitality",
    label: "Hospitality & leisure",
    match:
      /\b(hospitality|competitive socialis(?:ing|ation)|competitive socializing|venues?|leisure|entertainment venue|clays?|bowling|mini.?golf|darts|shuffleboard|karaoke|escape rooms?|nightlife|bars?|pubs?|private hire)\b/i,
    useCases: HOSPITALITY_CORE,
  },
  {
    id: "fashion",
    label: "Fashion",
    match:
      /\b(fashion|apparel|clothing|clothes|menswear|womenswear|footwear|dress(?:es)?|river island)\b/i,
    useCases: COMMERCE_CORE,
  },
  {
    id: "sports",
    label: "Sports & outdoor",
    match:
      /\b(sports?|sportswear|athletic|athleisure|outdoor|cycling|rapha|running|fitness)\b/i,
    useCases: COMMERCE_CORE,
  },
  {
    id: "jewellery",
    label: "Jewellery",
    match: /\b(jewell?ery|watches)\b/i,
    useCases: COMMERCE_CORE,
  },
  {
    id: "beauty",
    label: "Beauty",
    match: /\b(beauty|cosmetics?|skincare|fragrance|perfume)\b/i,
    useCases: [
      ...COMMERCE_CORE,
      {
        id: "replenishment",
        title: "Replenishment / repeat purchase",
        priority: "high",
        scenarioMatch: /replenish|repeat.?purchase|subscription|refill/i,
        eventHints: ["purchase"],
      },
    ],
  },
  {
    id: "home",
    label: "Home & DIY",
    match:
      /\b(home improvement|blinds?|curtains?|furniture|diy|homeware|interiors?|decor)\b/i,
    useCases: COMMERCE_CORE,
  },
  {
    id: "grocery",
    label: "Grocery & CPG",
    match:
      /\b(grocery|groceries|supermarket|cpg|fmcg|coop|convenience.?store|food.?retail)\b/i,
    useCases: [
      {
        id: "welcome",
        title: "Welcome / loyalty join",
        priority: "high",
        scenarioMatch: /welcome|loyalty|onboarding|signup/i,
        eventHints: ["consent", "register"],
      },
      {
        id: "replenishment",
        title: "Replenishment / repeat purchase",
        priority: "high",
        scenarioMatch: /replenish|repeat|loyalty.?offer/i,
        eventHints: ["purchase"],
      },
      {
        id: "abandon_cart",
        title: "Abandon cart (ecommerce)",
        priority: "high",
        scenarioMatch: /abandon.*(cart|basket)|cart.?abandon/i,
        eventHints: ["cart_update", "checkout"],
      },
      {
        id: "reactivation",
        title: "Win-back for lapsed shoppers",
        priority: "high",
        scenarioMatch: /reactivat|win.?back|lapsing|churn/i,
        eventHints: [],
      },
      {
        id: "recommendations",
        title: "Category / product recommendations",
        priority: "medium",
        feature: "recommendations",
      },
      {
        id: "sms_offers",
        title: "SMS time-sensitive offers",
        priority: "medium",
        requireChannel: "SMS",
      },
    ],
  },
  {
    id: "restaurants",
    label: "Restaurants",
    match:
      /\b(restaurants?|dining|caf[eé]s?|cote|hospitality.?f&b|food.?service|takeaway|qsr)\b/i,
    useCases: [
      {
        id: "welcome",
        title: "Welcome / signup",
        priority: "high",
        scenarioMatch: /welcome|onboarding|signup|loyalty/i,
        eventHints: ["consent", "register"],
      },
      {
        id: "visit_reminder",
        title: "Visit / reservation reminder",
        priority: "medium",
        scenarioMatch: /reservation|booking|visit.?remind|table/i,
        eventHints: ["booking", "reservation"],
      },
      {
        id: "reactivation",
        title: "Win-back for lapsed diners",
        priority: "high",
        scenarioMatch: /reactivat|win.?back|lapsing|churn/i,
        eventHints: [],
      },
      {
        id: "occasion",
        title: "Birthday / occasion",
        priority: "medium",
        scenarioMatch: /birthday|occasion|anniversary/i,
        eventHints: [],
      },
      {
        id: "weblayer_promo",
        title: "On-site / weblayer promo",
        priority: "low",
        requireChannel: "Weblayer",
      },
    ],
  },
  {
    id: "travel",
    label: "Travel",
    match:
      /\b(travel|airlines?|flights?|hotels?|resorts?|tour operator|tours|itinerary|holidays?|vacations?)\b/i,
    useCases: [
      {
        id: "welcome",
        title: "Welcome / booking follow-up",
        priority: "high",
        scenarioMatch: /welcome|booking.?confirm|onboarding/i,
        eventHints: ["consent", "register", "booking"],
      },
      {
        id: "abandon_browse",
        title: "Abandon browse / abandon book",
        priority: "high",
        scenarioMatch: /abandon.*(browse|book|search)|browse.?abandon|book.?abandon/i,
        eventHints: ["view_item", "booking", "search"],
      },
      {
        id: "trip_nurture",
        title: "Pre/post-trip nurture",
        priority: "medium",
        scenarioMatch: /pre.?trip|post.?trip|travel.?nurture|itinerary/i,
        eventHints: ["booking", "purchase"],
      },
      {
        id: "reactivation",
        title: "Win-back",
        priority: "high",
        scenarioMatch: /reactivat|win.?back|lapsing|churn/i,
        eventHints: [],
      },
      {
        id: "recommendations",
        title: "Destination / ancillary recommendations",
        priority: "medium",
        feature: "recommendations",
      },
    ],
  },
  {
    id: "mobility",
    label: "Transport & mobility",
    match:
      /\b(bus(?:es)?|rail|railway|transit|public transport|transport|eireann|mobility|trains?|commuter)\b/i,
    useCases: [
      {
        id: "welcome",
        title: "Welcome / account",
        priority: "high",
        scenarioMatch: /welcome|onboarding|signup|account/i,
        eventHints: ["consent", "register"],
      },
      {
        id: "service_updates",
        title: "Service / journey updates",
        priority: "medium",
        scenarioMatch: /disruption|service.?update|journey|delay/i,
        eventHints: [],
      },
      {
        id: "loyalty_frequency",
        title: "Loyalty / frequency nurture",
        priority: "high",
        scenarioMatch: /loyalty|frequency|regular.?travel|commuter/i,
        eventHints: [],
      },
      {
        id: "reactivation",
        title: "Win-back",
        priority: "medium",
        scenarioMatch: /reactivat|win.?back|lapsing/i,
        eventHints: [],
      },
      {
        id: "sms_push",
        title: "SMS/Push for operational messaging",
        priority: "medium",
        requireChannelAny: ["SMS", "Push"],
      },
    ],
  },
  {
    id: "financial",
    label: "Financial services",
    match:
      /\b(bank|banking|fintech|insurance|insurer|financial|affinion|loyalty.?finance)\b/i,
    useCases: [
      {
        id: "welcome",
        title: "Welcome / onboarding",
        priority: "high",
        scenarioMatch: /welcome|onboarding|signup/i,
        eventHints: ["consent", "register"],
      },
      {
        id: "reactivation",
        title: "Win-back / re-engagement",
        priority: "high",
        scenarioMatch: /reactivat|win.?back|re-?engage/i,
        eventHints: [],
      },
      {
        id: "lifecycle_nurture",
        title: "Lifecycle nurture (non-BAU)",
        priority: "medium",
        scenarioMatch: /nurture|lifecycle|education|onboard/i,
        eventHints: [],
      },
    ],
  },
  {
    id: "retail",
    label: "General retail",
    match: /\b(retail|retailer|e-?commerce|ecommerce|shopify|commerce|marketplace)\b/i,
    useCases: COMMERCE_CORE,
  },
];

function normalizeLabel(value) {
  return String(value || "")
    .replace(/[#*_`|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findVerticalByLabel(label) {
  const needle = normalizeLabel(label).toLowerCase();
  if (!needle) return null;
  return (
    VERTICAL_PACK.find((v) => v.label.toLowerCase() === needle) ||
    VERTICAL_PACK.find((v) => v.match.test(needle) || needle.includes(v.id)) ||
    null
  );
}

/** Distinct keywords in `text` that a vertical matched, so weak single hits can be outranked. */
function matchedKeywords(vertical, text) {
  const re = new RegExp(vertical.match.source, "gi");
  const hits = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    hits.add(m[0].toLowerCase());
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return [...hits];
}

/**
 * Infer vertical from free text (client brief, docs, project name).
 */
export function inferVerticalFromText(text, hintedLabel = "") {
  const hinted = findVerticalByLabel(hintedLabel);
  if (hinted) {
    return {
      id: hinted.id,
      label: hinted.label,
      confidence: "medium",
      rationale: `Matched hinted vertical “${normalizeLabel(hintedLabel)}”.`,
      alternatives: [],
    };
  }

  const hay = String(text || "");
  const hits = VERTICAL_PACK.map((vertical, order) => ({
    vertical,
    order,
    keywords: matchedKeywords(vertical, hay),
  }))
    .filter((h) => h.keywords.length > 0)
    .sort((a, b) => b.keywords.length - a.keywords.length || a.order - b.order);

  if (!hits.length) {
    return {
      id: "other",
      label: normalizeLabel(hintedLabel) || "Other",
      confidence: "low",
      rationale: "No strong vertical signals found in client docs or project naming.",
      alternatives: [],
    };
  }

  const primary = hits[0];
  const decisive = hits.length === 1 || primary.keywords.length > hits[1].keywords.length;
  return {
    id: primary.vertical.id,
    label: primary.vertical.label,
    confidence: hits.length === 1 ? "high" : decisive ? "medium" : "low",
    rationale: `Inferred from client/project text signals for ${
      primary.vertical.label
    } (matched: ${primary.keywords.slice(0, 4).join(", ")}).`,
    alternatives: hits.slice(1, 3).map((h) => ({
      id: h.vertical.id,
      label: h.vertical.label,
      why: `Also matched: ${h.keywords.slice(0, 3).join(", ")}`,
    })),
  };
}

function isOneOffName(name) {
  return /\b(bau|fy\d{2}|wk\d{1,2}|newsletter|blast)\b/i.test(String(name || ""));
}

function liveScenarios(scenarios = []) {
  return (Array.isArray(scenarios) ? scenarios : []).filter(
    (s) => s && !s.archived && !s.oneOff && !isOneOffName(s.name)
  );
}

function channelSet(channels = []) {
  return new Set(
    (Array.isArray(channels) ? channels : [])
      .filter((c) => c.used || c.status === "utilised")
      .map((c) => c.name)
  );
}

function eventSet(eventRows = []) {
  const set = new Set();
  for (const e of Array.isArray(eventRows) ? eventRows : []) {
    const type = e.type || e.event_type || e.name;
    if (!type) continue;
    set.add(type);
    // Alias tokens so "wishlist_add" / "add_to_wishlist" satisfy wishlist hints
    if (/wishlist/i.test(type)) set.add("wishlist");
    if (/wishlist/i.test(type)) set.add("add_to_wishlist");
  }
  return set;
}

function featureUsed(personalization, key) {
  return Boolean(personalization?.features?.[key]?.used || personalization?.[key]?.used);
}

function evaluateUseCase(useCase, { scenarios, channels, events, personalization }) {
  const matchedScenarios = useCase.scenarioMatch
    ? scenarios.filter((s) => useCase.scenarioMatch.test(String(s.name || "")))
    : [];

  if (useCase.feature) {
    const used = featureUsed(personalization, useCase.feature);
    return {
      id: useCase.id,
      title: useCase.title,
      priority: useCase.priority || "medium",
      status: used ? "covered" : "missing",
      evidence: used
        ? `${useCase.feature} is in use in the project.`
        : `${useCase.feature} not detected as used.`,
      recommendation: used
        ? "Keep expanding onto priority journeys for this vertical."
        : `Enable ${useCase.title.toLowerCase()} on at least one always-on journey.`,
      matchedScenarios: [],
    };
  }

  if (useCase.requireChannel) {
    const used = channels.has(useCase.requireChannel);
    return {
      id: useCase.id,
      title: useCase.title,
      priority: useCase.priority || "medium",
      status: used ? "covered" : "missing",
      evidence: used
        ? `${useCase.requireChannel} channel utilised.`
        : `${useCase.requireChannel} channel not utilised.`,
      recommendation: used
        ? `Use ${useCase.requireChannel} on a vertical priority journey, not only blasts.`
        : `Confirm ${useCase.requireChannel} integration, then add one always-on use case.`,
      matchedScenarios: [],
    };
  }

  if (useCase.requireChannelAny) {
    const hit = useCase.requireChannelAny.find((c) => channels.has(c));
    return {
      id: useCase.id,
      title: useCase.title,
      priority: useCase.priority || "medium",
      status: hit ? "covered" : "missing",
      evidence: hit
        ? `${hit} channel utilised.`
        : `${useCase.requireChannelAny.join("/")} not utilised.`,
      recommendation: hit
        ? `Lean on ${hit} for time-critical vertical messaging.`
        : `Add SMS or Push if operational messaging matters for this vertical.`,
      matchedScenarios: matchedScenarios.map((s) => s.name),
    };
  }

  if (matchedScenarios.length) {
    const prefer = useCase.preferChannels || [];
    const channelGap =
      prefer.length > 0 &&
      matchedScenarios.every((s) => {
        const on = s.channels || [];
        return !prefer.some((c) => on.includes(c) && c !== "Email") && on.includes("Email");
      });

    return {
      id: useCase.id,
      title: useCase.title,
      priority: useCase.priority || "medium",
      status: channelGap ? "partial" : "covered",
      evidence: `Live scenario(s): ${matchedScenarios
        .slice(0, 3)
        .map((s) => s.name)
        .join(", ")}.`,
      recommendation: channelGap
        ? "Extend beyond email-only onto SMS/Push where consent allows."
        : "Looks covered — review creative/AI quality next.",
      matchedScenarios: matchedScenarios.map((s) => s.name),
    };
  }

  const eventHit = (useCase.eventHints || []).some((h) => events.has(h));
  if (eventHit) {
    return {
      id: useCase.id,
      title: useCase.title,
      priority: useCase.priority || "medium",
      status: "partial",
      evidence: `Supporting events exist (${(useCase.eventHints || []).join(", ")}), but no clear live scenario name match.`,
      recommendation: `Build or rename an always-on “${useCase.title}” journey so coverage is explicit.`,
      matchedScenarios: [],
    };
  }

  return {
    id: useCase.id,
    title: useCase.title,
    priority: useCase.priority || "medium",
    status: "missing",
    evidence: "No live scenario or strong supporting signal found.",
    recommendation: `Add a vertical-standard “${useCase.title}” automation.`,
    matchedScenarios: [],
  };
}

/**
 * Deterministic vertical verification + use-case coverage.
 */
export function assessVerticalUseCases({
  project = {},
  clientBrief = null,
  scenarios = [],
  channels = [],
  eventRows = [],
  personalization = null,
  gtmVertical = null,
} = {}) {
  const text = [
    clientBrief?.vertical,
    clientBrief?.summary,
    clientBrief?.overview,
    project.name,
    project.workspace || project.workspace_name,
    project.category,
    ...(clientBrief?.trackingDocs || []).map((d) => `${d.title} ${d.summary || ""}`),
  ]
    .filter(Boolean)
    .join(" ");

  const gtm = gtmVertical || clientBrief?.gtmVertical || null;
  const gtmPack = gtm?.verticalId
    ? VERTICAL_PACK.find((v) => v.id === gtm.verticalId)
    : null;

  const vertical = gtmPack
    ? {
        id: gtmPack.id,
        label: gtmPack.label,
        confidence: "high",
        rationale: `Salesforce GTM mapping${
          gtm.accountName ? ` for ${gtm.accountName}` : ""
        }: ${gtm.matchedField || "GTM Industry"} = “${gtm.label}”.`,
        alternatives: [],
        source: "salesforce-gtm",
      }
    : inferVerticalFromText(text, clientBrief?.vertical || "");
  const pack =
    VERTICAL_PACK.find((v) => v.id === vertical.id) ||
    VERTICAL_PACK.find((v) => v.id === "retail");

  const ctx = {
    scenarios: liveScenarios(scenarios),
    channels: channelSet(channels),
    events: eventSet(eventRows),
    personalization,
  };

  const useCases = (pack?.useCases || COMMERCE_CORE).map((uc) => evaluateUseCase(uc, ctx));
  const covered = useCases.filter((u) => u.status === "covered");
  const partial = useCases.filter((u) => u.status === "partial");
  const missing = useCases.filter((u) => u.status === "missing");

  const priorityRank = { high: 0, medium: 1, low: 2 };
  const topGaps = [...partial, ...missing]
    .sort(
      (a, b) =>
        (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) ||
        a.title.localeCompare(b.title)
    )
    .slice(0, 5)
    .map((u) => ({
      title: u.title,
      status: u.status,
      whyItMatters: `${u.title} is an expected ${pack.label} use case (${u.priority} priority).`,
      adopt: u.recommendation,
      evidence: u.evidence,
    }));

  const coverageSummary =
    missing.length === 0 && partial.length === 0
      ? `${pack.label} core use cases look well covered from live signals.`
      : `${pack.label}: ${covered.length} covered, ${partial.length} partial, ${missing.length} missing. Focus next on: ${topGaps
          .slice(0, 3)
          .map((g) => g.title)
          .join(", ")}.`;

  return {
    available: true,
    source: gtmPack ? "rules+gtm" : "rules",
    gtmVertical: gtm || null,
    vertical,
    packId: pack.id,
    packLabel: pack.label,
    coverageSummary,
    useCases,
    coveredCount: covered.length,
    partialCount: partial.length,
    missingCount: missing.length,
    topGaps,
    aiNarrative: null,
  };
}

/** True when text names a vertical other than `keepId` (guards against a drifting Glean narrative). */
function namesOtherVertical(text, keepId) {
  const hay = String(text || "");
  if (!hay) return false;
  return VERTICAL_PACK.some(
    (v) => v.id !== keepId && new RegExp(`\\b${v.label.split(" ")[0]}\\b`, "i").test(hay)
  );
}

function extractText(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload.text === "string") return payload.text;
  if (Array.isArray(payload.content)) {
    return payload.content
      .map((c) => (typeof c?.text === "string" ? c.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function tryParseJsonObject(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // ignore
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // ignore
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Optional Glean chat pass: verify vertical + rewrite top-gap feedback using the skill contract.
 */
export async function enrichVerticalAssessmentWithGlean(glean, assessment, { project, clientBrief } = {}) {
  if (!glean || !assessment?.available) return assessment;

  try {
    await glean.ensureConnected();
  } catch (err) {
    return {
      ...assessment,
      aiNarrative: null,
      gleanError: err.message || String(err),
      needsAuth: err.code === "NEEDS_AUTH",
      authUrl: err.authUrl || glean.authProvider?.pendingAuthUrl || null,
    };
  }

  const gtmLocked = Boolean(assessment.gtmVertical?.verticalId);
  const compact = {
    client: project?.name || project?.workspace || "client",
    briefVertical: clientBrief?.vertical || "",
    confirmedVertical: gtmLocked
      ? {
          id: assessment.vertical.id,
          label: assessment.vertical.label,
          source: `Salesforce GTM ${assessment.gtmVertical.matchedField || "GTM Industry"} = ${assessment.gtmVertical.label}`,
        }
      : null,
    briefSummary: String(clientBrief?.summary || clientBrief?.overview || "").slice(0, 400),
    assessment: {
      vertical: assessment.vertical,
      coverageSummary: assessment.coverageSummary,
      useCases: assessment.useCases.map((u) => ({
        id: u.id,
        title: u.title,
        status: u.status,
        priority: u.priority,
        evidence: u.evidence,
      })),
      topGaps: assessment.topGaps,
    },
  };

  try {
    const raw = await glean.callTool("chat", {
      message: [
        "Apply the Bloomreach vertical-use-case-audit skill.",
        gtmLocked
          ? "The vertical is already confirmed from the Salesforce GTM mapping (confirmedVertical). Keep it exactly as given and only improve the account feedback."
          : "Verify the vertical and improve account feedback for missing/partial use cases.",
        "Do not invent live scenarios or schema issues. Use only the assessment JSON.",
        "The field values below are placeholders describing the shape — never copy them as answers.",
        "Return JSON only:",
        JSON.stringify({
          vertical: {
            id: "<vertical id>",
            label: "<vertical label>",
            confidence: "high|medium|low",
            rationale: "...",
            alternatives: [],
          },
          coverageSummary: "...",
          topGaps: [
            {
              title: "...",
              whyItMatters: "...",
              adopt: "...",
            },
          ],
          narrative: "2-4 sentences for the feedback deck",
        }),
        "Assessment JSON:",
        JSON.stringify(compact),
      ].join("\n"),
    });

    const text = extractText(raw);
    const json = tryParseJsonObject(text);
    if (!json || typeof json !== "object") {
      return {
        ...assessment,
        aiNarrative: text.replace(/chatId:[\s\S]*$/i, "").trim().slice(0, 700) || null,
        source: "rules+glean",
      };
    }

    // A GTM-confirmed vertical is authoritative — Glean may refine wording, never the vertical.
    const vertical =
      gtmLocked || !json.vertical || typeof json.vertical !== "object"
        ? assessment.vertical
        : {
            id: String(json.vertical.id || assessment.vertical.id),
            label: String(json.vertical.label || assessment.vertical.label),
            confidence: String(json.vertical.confidence || assessment.vertical.confidence),
            rationale: String(json.vertical.rationale || assessment.vertical.rationale),
            alternatives: Array.isArray(json.vertical.alternatives)
              ? json.vertical.alternatives
              : assessment.vertical.alternatives,
          };

    const topGaps = Array.isArray(json.topGaps) && json.topGaps.length
      ? json.topGaps.slice(0, 5).map((g, idx) => ({
          title: String(g.title || assessment.topGaps[idx]?.title || "Gap"),
          status: assessment.topGaps[idx]?.status || "missing",
          whyItMatters: String(g.whyItMatters || g.why || assessment.topGaps[idx]?.whyItMatters || ""),
          adopt: String(g.adopt || g.recommendation || assessment.topGaps[idx]?.adopt || ""),
          evidence: assessment.topGaps[idx]?.evidence || "",
        }))
      : assessment.topGaps;

    const gleanSummary = String(json.coverageSummary || "").trim();
    const gleanNarrative = String(json.narrative || json.summary || "").trim().slice(0, 800);

    return {
      ...assessment,
      vertical,
      coverageSummary:
        gleanSummary && !(gtmLocked && namesOtherVertical(gleanSummary, vertical.id))
          ? gleanSummary
          : assessment.coverageSummary,
      topGaps,
      aiNarrative:
        gleanNarrative && !(gtmLocked && namesOtherVertical(gleanNarrative, vertical.id))
          ? gleanNarrative
          : null,
      source: gtmLocked ? "rules+gtm+glean" : "rules+glean",
    };
  } catch (err) {
    return {
      ...assessment,
      gleanError: err.message || String(err),
      source: "rules",
    };
  }
}
