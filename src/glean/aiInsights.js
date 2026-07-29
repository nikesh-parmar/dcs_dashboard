/**
 * Glean-backed AI narratives for rule-based findings & adoption opportunities.
 * Facts stay in the deterministic audit; Glean only rewrites / prioritizes /
 * adds grounded next steps (never invents schema issues).
 */

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
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.answer === "string") return payload.answer;
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

function compactFindings(findings = []) {
  return findings.slice(0, 12).map((f) => ({
    severity: f.severity || "medium",
    area: f.area || "",
    title: f.title || "",
    detail: String(f.detail || "").slice(0, 280),
    recommendation: String(f.recommendation || "").slice(0, 220),
  }));
}

function compactAdoption(items = []) {
  return items.slice(0, 12).map((item) => ({
    impact: item.impact || "medium",
    effort: item.effort || "medium",
    area: item.area || "",
    title: item.title || "",
    scenario: item.scenario || "",
    detail: String(item.detail || "").slice(0, 280),
    action: String(item.action || "").slice(0, 220),
  }));
}

function compactBrief(brief) {
  if (!brief) return null;
  return {
    vertical: brief.vertical || "",
    summary: String(brief.summary || brief.overview || "").slice(0, 400),
    docs: (brief.trackingDocs || brief.sources || [])
      .slice(0, 6)
      .map((d) => ({
        title: d.title || "",
        url: d.url || "",
        summary: String(d.summary || d.snippet || "").slice(0, 160),
      })),
  };
}

async function searchContextDocs(glean, project = {}) {
  const name = String(project.name || project.workspace || "").trim();
  const queries = [
    name ? `${name} data audit tracking` : "Engagement data audit checklist",
    name ? `${name} Use Case Center adoption` : "Bloomreach Use Case Center scenarios",
    "Engagement data mapping best practices",
  ].filter(Boolean);

  const docs = [];
  const seen = new Set();
  for (const query of queries.slice(0, 2)) {
    try {
      const raw = await glean.callTool("search", { query, num_results: 5 });
      const parsed = raw?.documents || raw?.results || raw?.data?.documents;
      const list = Array.isArray(parsed)
        ? parsed
        : extractSearchDocsFromText(extractText(raw));
      for (const doc of list) {
        const title = String(doc.title || doc.name || "").trim();
        const url = String(doc.url || doc.link || "").trim();
        const key = (url || title).toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        docs.push({
          title: title || "Document",
          url,
          snippet: String(doc.snippet || doc.summary || "").slice(0, 220),
        });
      }
    } catch {
      // optional context only
    }
  }
  return docs.slice(0, 8);
}

function extractSearchDocsFromText(text) {
  if (!text || typeof text !== "string") return [];
  const match = text.match(/documents\[\d+\]:\s*\n([\s\S]*)/i);
  if (!match) return [];
  const chunks = match[1].split(/\n  - /).slice(1);
  const docs = [];
  for (const chunk of chunks) {
    const titleMatch = chunk.match(/(?:^|\n)\s*title:\s*(.+?)(?:\n|$)/);
    const urlMatch =
      chunk.match(/(?:^|\n)\s*url:\s*"([^"]+)"/) ||
      chunk.match(/(?:^|\n)\s*url:\s*'([^']+)'/) ||
      chunk.match(/(?:^|\n)\s*url:\s*(\S+)/);
    const snipMatch = chunk.match(/snippets\[\d+\]:\s*([\s\S]*?)(?=\n\s{4}\w+:|$)/i);
    const title = titleMatch ? titleMatch[1].trim().replace(/^["']|["']$/g, "") : "";
    let url = urlMatch ? urlMatch[1].trim() : "";
    if (url.endsWith('"') || url.endsWith("'")) url = url.slice(0, -1);
    const snippet = snipMatch ? snipMatch[1].replace(/\s+/g, " ").trim().slice(0, 220) : "";
    if (title || url) docs.push({ title: title || "Document", url, snippet });
  }
  return docs;
}

function emptyInsights(reason = null) {
  return {
    available: false,
    source: null,
    error: reason,
    summary: "",
    findings: [],
    adoption: [],
    extras: [],
    sources: [],
    successPlans: [],
  };
}

function normalizeInsights(raw, { findings, adoption }) {
  const text = extractText(raw);
  const json = tryParseJsonObject(text);
  if (!json || typeof json !== "object") {
    const cleaned = text
      .replace(/\[\^\d+\]/g, "")
      .replace(/chatId:[\s\S]*$/i, "")
      .trim();
    if (!cleaned) return emptyInsights("Glean returned no usable AI insights.");
    return {
      available: true,
      source: "glean",
      error: null,
      summary: cleaned.slice(0, 600),
      findings: [],
      adoption: [],
      extras: [],
      sources: [],
      successPlans: [],
    };
  }

  const findingTitles = new Set(findings.map((f) => String(f.title || "").toLowerCase()));
  const adoptionTitles = new Set(adoption.map((a) => String(a.title || "").toLowerCase()));

  const findingNarratives = asNarrativeList(
    json.findings || json.findingNarratives || json.dataFindings
  ).map((item) => ({
    ...item,
    basedOnFinding: findingTitles.has(String(item.basedOn || item.title || "").toLowerCase()),
  }));

  const adoptionNarratives = asNarrativeList(
    json.adoption || json.adoptionNarratives || json.adoptionOpportunities
  ).map((item) => ({
    ...item,
    basedOnOpportunity: adoptionTitles.has(
      String(item.basedOn || item.title || "").toLowerCase()
    ),
  }));

  const extras = asExtraList(json.extras || json.additionalSuggestions || []).slice(0, 5);
  const sources = asSourceList(json.sources || []).slice(0, 6);
  const successPlans = asSuccessPlanList(
    json.successPlans || json.successPlanning || json.actionPlans || []
  );

  return {
    available: true,
    source: "glean",
    error: null,
    summary: String(json.summary || json.overview || "").trim().slice(0, 800),
    findings: findingNarratives.slice(0, 10),
    adoption: adoptionNarratives.slice(0, 10),
    extras,
    sources,
    successPlans,
  };
}

function asSuccessPlanList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const title = String(item.title || item.basedOn || item.opportunity || "").trim();
      if (!title) return null;
      const stepsRaw =
        item.actionSteps || item.steps || item.recommendedActions || item.actions || [];
      const actionSteps = (Array.isArray(stepsRaw) ? stepsRaw : [stepsRaw])
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .slice(0, 8);
      return {
        basedOn: String(item.basedOn || item.opportunity || title).trim().slice(0, 200),
        title: title.slice(0, 180),
        currentBenchmark: String(
          item.currentBenchmark || item.benchmark || item.situation || item.currentState || ""
        )
          .trim()
          .slice(0, 420),
        expectedLift: String(
          item.expectedLift || item.expectedValue || item.lift || item.value || ""
        )
          .trim()
          .slice(0, 320),
        bloomreachSolution: String(
          item.bloomreachSolution ||
            item.proposedSolution ||
            item.solution ||
            item.bloomreachCapability ||
            ""
        )
          .trim()
          .slice(0, 420),
        desiredOutcome: String(
          item.desiredOutcome || item.outcome || item.measurement || item.kpi || ""
        )
          .trim()
          .slice(0, 420),
        effort: String(item.effort || "medium").trim().toLowerCase().slice(0, 40) || "medium",
        actionSteps,
      };
    })
    .filter(Boolean)
    .slice(0, 6);
}

function fallbackSuccessPlans(adoption = [], adoptionNarratives = []) {
  const plans = [];
  const seen = new Set();

  for (const item of adoptionNarratives) {
    const title = String(item.title || item.basedOn || "").trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    plans.push({
      basedOn: item.basedOn || title,
      title,
      currentBenchmark: item.narrative || "Gap identified in the project audit.",
      expectedLift: "Improve journey coverage and conversion for this use case.",
      bloomreachSolution:
        item.action || "Adopt the matching Use Case Center scenario in Engagement.",
      desiredOutcome: "Live scenario with measurable opens/clicks/conversions vs baseline.",
      effort: "medium",
      actionSteps: [
        item.action || "Review the related Use Case Center scenario.",
        "Confirm required events and consent categories are mapped.",
        "Pilot with a limited audience, then measure lift before scaling.",
      ].filter(Boolean),
    });
    if (plans.length >= 5) return plans;
  }

  for (const item of adoption) {
    const title = String(item.title || "").trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    if (/weblayer|web layer|banner/.test(`${item.area || ""} ${title}`.toLowerCase())) continue;
    seen.add(key);
    plans.push({
      basedOn: title,
      title,
      currentBenchmark: String(item.detail || "Opportunity flagged by the audit.").slice(0, 420),
      expectedLift: `Impact: ${item.impact || "medium"} — prioritize for success planning.`,
      bloomreachSolution: String(
        item.action || "Implement via Bloomreach Engagement scenarios / Use Case Center."
      ).slice(0, 420),
      desiredOutcome: "Adopted use case with defined KPI and review cadence.",
      effort: String(item.effort || "medium").toLowerCase(),
      actionSteps: [
        String(item.action || "Define scope and owner for this opportunity.").slice(0, 280),
        "Map prerequisites (events, consent, catalog) before build.",
        "Ship a pilot, instrument success metrics, then expand.",
      ],
    });
    if (plans.length >= 5) break;
  }

  return plans;
}

function asNarrativeList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const title = String(item.title || item.basedOn || "").trim();
      const narrative = String(item.narrative || item.detail || item.summary || "").trim();
      const action = String(
        item.action || item.priorityAction || item.nextStep || item.recommendation || ""
      ).trim();
      if (!title && !narrative && !action) return null;
      return {
        basedOn: String(item.basedOn || title).trim(),
        title: title || "Recommendation",
        severity: String(item.severity || item.impact || "").trim().toLowerCase() || null,
        narrative: narrative.slice(0, 500),
        action: action.slice(0, 320),
      };
    })
    .filter(Boolean);
}

function asExtraList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const title = String(item.title || "").trim();
      const detail = String(item.detail || item.narrative || "").trim();
      if (!title || !detail) return null;
      return {
        area: String(item.area || "Suggestion").trim().slice(0, 80),
        title: title.slice(0, 160),
        detail: detail.slice(0, 400),
        rationale: String(item.rationale || item.why || "").trim().slice(0, 240),
      };
    })
    .filter(Boolean);
}

function asSourceList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const title = String(item.title || item.name || "").trim();
      const url = String(item.url || "").trim();
      if (!title && !url) return null;
      return { title: title || "Source", url };
    })
    .filter(Boolean);
}

/**
 * Enrich deterministic findings/adoption with Glean chat + optional search context.
 * @param {import('../loomi/client.js').LoomiClient} glean
 * @param {{ project?: object, findings?: array, adoptionOpportunities?: array, clientBrief?: object|null }} input
 */
export async function enrichFindingsWithGlean(glean, input = {}) {
  if (!glean) return emptyInsights("Glean not connected");

  const project = input.project || {};
  const findings = Array.isArray(input.findings) ? input.findings : [];
  const adoption = Array.isArray(input.adoptionOpportunities)
    ? input.adoptionOpportunities
    : [];
  const label =
    [project.name, project.workspace || project.workspace_name].filter(Boolean).join(" / ") ||
    "this Engagement project";

  try {
    await glean.ensureConnected();
  } catch (err) {
    if (err.code === "NEEDS_AUTH") {
      const out = emptyInsights("Glean authentication required");
      out.needsAuth = true;
      out.authUrl = err.authUrl || glean.authProvider?.pendingAuthUrl || null;
      return out;
    }
    return emptyInsights(err.message || String(err));
  }

  if (!findings.length && !adoption.length) {
    return {
      ...emptyInsights(null),
      available: true,
      source: "glean",
      summary: "No rule-based findings or adoption gaps to enrich.",
      successPlans: [],
    };
  }

  let contextDocs = [];
  try {
    contextDocs = await searchContextDocs(glean, project);
  } catch {
    contextDocs = [];
  }

  const brief = compactBrief(input.clientBrief);
  const vertical = input.verticalAssessment
    ? {
        label: input.verticalAssessment.packLabel || input.verticalAssessment.vertical?.label,
        confidence: input.verticalAssessment.vertical?.confidence,
        coverageSummary: input.verticalAssessment.coverageSummary,
        topGaps: (input.verticalAssessment.topGaps || []).slice(0, 5),
      }
    : null;
  const payload = {
    client: label,
    vertical: brief?.vertical || vertical?.label || "",
    clientSummary: brief?.summary || "",
    verticalAssessment: vertical,
    findings: compactFindings(findings),
    adoptionOpportunities: compactAdoption(adoption),
    contextDocs: contextDocs.length ? contextDocs : brief?.docs || [],
  };

  try {
    const raw = await glean.callTool("chat", {
      message: [
        `You are helping a Bloomreach consultant interpret a read-only Engagement data audit for ${label}.`,
        "Return JSON only (no markdown fences) with this shape:",
        JSON.stringify({
          summary: "2-3 sentences prioritizing what matters for this client",
          findings: [
            {
              basedOn: "exact title from findings[]",
              title: "short headline",
              severity: "high|medium|low",
              narrative: "client-specific explanation",
              action: "concrete next step",
            },
          ],
          adoption: [
            {
              basedOn: "exact title from adoptionOpportunities[]",
              title: "short headline",
              narrative: "why this matters for this client",
              action: "concrete adopt step",
            },
          ],
          successPlans: [
            {
              basedOn: "exact title from adoptionOpportunities[] (best-action opportunity)",
              title: "success-plan headline",
              currentBenchmark: "current situation or benchmark for this client",
              expectedLift: "expected lift or business value if addressed",
              bloomreachSolution: "proposed Bloomreach Engagement / Use Case Center solution",
              desiredOutcome: "desired outcome and how to measure success",
              effort: "low|medium|high",
              actionSteps: [
                "recommended action 1",
                "recommended action 2",
                "recommended action 3",
              ],
            },
          ],
          extras: [
            {
              area: "optional area",
              title: "only if grounded in contextDocs",
              detail: "suggestion",
              rationale: "which doc or audit signal supports this",
            },
          ],
          sources: [{ title: "doc title", url: "https://..." }],
        }),
        "Hard rules:",
        "- Do NOT invent missing events, properties, mappings, or schema issues that are not in findings[].",
        "- Prefer rewriting / prioritizing items from findings[] and adoptionOpportunities[].",
        "- When verticalAssessment is present, bias adoption advice toward its topGaps for that vertical.",
        "- basedOn must match an input title when referencing those lists.",
        "- successPlans: produce one plan for each of the top 3–5 highest-value adoptionOpportunities (best actions).",
        "- Each successPlan must include currentBenchmark, expectedLift, bloomreachSolution, desiredOutcome, effort, and 3–5 concrete actionSteps.",
        "- extras only when clearly supported by contextDocs or the audit JSON; max 3.",
        "- Be specific to the client vertical/summary when available.",
        "Audit JSON:",
        JSON.stringify(payload),
      ].join("\n"),
    });

    const insights = normalizeInsights(raw, { findings, adoption });
    if (!insights.successPlans.length) {
      insights.successPlans = fallbackSuccessPlans(adoption, insights.adoption);
    }
    if (!insights.sources.length && contextDocs.length) {
      insights.sources = contextDocs.slice(0, 4).map((d) => ({
        title: d.title,
        url: d.url,
      }));
    }
    return insights;
  } catch (err) {
    return emptyInsights(err.message || String(err));
  }
}
