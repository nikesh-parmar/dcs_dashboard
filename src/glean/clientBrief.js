import { parseToolResult, LoomiClient } from "../loomi/client.js";
import { fetchGtmVertical } from "./gtmVertical.js";

/**
 * Ask Glean for client documents (esp. tracking docs), plus one-line overview + vertical.
 * Glean search returns a YAML-like text blob — we parse that explicitly.
 * @param {LoomiClient} glean
 * @param {{ name?: string, workspace?: string, category?: string }} project
 */
export async function fetchClientBrief(glean, project = {}) {
  const label = [project.name, project.workspace].filter(Boolean).join(" / ") || "this customer";
  const nameHint = String(project.name || project.workspace || "").trim();
  const keywords = shortKeywords(nameHint);

  // Targeted searches in parallel (no SOW emphasis)
  const [trackingDocHits, sheetHits, clientHits, gtmVertical] = await Promise.all([
    searchSafe(glean, {
      query: `${keywords} Tracking Document`.trim(),
      num_results: 10,
    }),
    searchSafe(glean, {
      query: `${keywords} tracking`.trim(),
      num_results: 8,
      type: "spreadsheet",
      app: "gdrive",
    }),
    searchSafe(glean, {
      query: keywords.trim(),
      num_results: 8,
      app: "gdrive",
    }),
    fetchGtmVertical(glean, project).catch(() => null),
  ]);

  const discovered = dedupeDocs([
    ...trackingDocHits.map((d) => ({ ...d, kind: "tracking" })),
    ...sheetHits.map((d) => ({ ...d, kind: "tracking" })),
    ...clientHits.map((d) => ({ ...d, kind: "context" })),
  ]);

  // Pull tracking-doc spreadsheet URLs mentioned inside other client docs (SOW/kickoff/handover)
  const linkedTracking = extractLinkedTrackingDocs(discovered, project);

  const namedDocs = filterDocsWithClientNameInTitle(
    [...discovered, ...linkedTracking],
    project
  );

  // Prefer explicit "Tracking Document" titles, then other client-named docs
  const preferred = preferCustomerDocs(namedDocs, keywords);

  // One chat call only (skip second chat) — faster overview
  let brief = emptyBrief(label);
  try {
    const catalog = preferred.slice(0, 10).map(formatDocForPrompt).join("\n");
    const raw = await glean.callTool("chat", {
      message: [
        `Bloomreach Engagement customer: ${label}.`,
        "Return JSON only (no markdown fences):",
        JSON.stringify({
          vertical: "1-2 word industry",
          summary: "ONE sentence: who the client is and what they use Engagement for",
          implementation: ["short implementation note if known"],
          integrations: [{ name: "JS SDK", detail: "status" }],
          gaps: [],
        }),
        "Rules: summary must be one sentence. Ignore SOWs for document listing.",
        catalog ? `Context docs:\n${catalog}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    brief = normalizeClientBrief(raw, label);
  } catch {
    // keep empty brief; fill from search below
  }

  brief.trackingDocs = rankDocuments([
    ...filterDocsWithClientNameInTitle(brief.trackingDocs || [], project),
    ...preferred,
    ...linkedTracking,
  ]).slice(0, 12);

  brief.sources = brief.trackingDocs.filter((d) => d.url).slice(0, 8);

  if (!brief.summary) {
    brief.summary = brief.trackingDocs.length
      ? `${label} - client documents found in Glean; see list below.`
      : `No documents with “${nameHint || label}” in the title were found in Glean.`;
  }

  brief.summary = coerceOneLiner(brief.summary, label, preferred, brief.implementation);
  brief.gtmVertical = gtmVertical || null;
  // Salesforce GTM mapping outranks anything inferred from chat or documents
  brief.vertical = gtmVertical?.label
    ? gtmVertical.label
    : coerceVertical(brief.vertical, brief.summary, preferred);
  brief.overview = brief.summary;

  brief.trackingDocs = (brief.trackingDocs || []).map((d) => ({
    ...d,
    summary: describeDocument(d),
  }));

  if (!brief.gaps.length && !brief.trackingDocs.length) {
    brief.gaps = [
      `No documents with “${nameHint || label}” in the title were found in Glean.`,
    ];
  }

  return brief;
}

/** Title must include the project/client name (or all significant name tokens). */
function titleHasClientName(title, project = {}) {
  const t = String(title || "").toLowerCase();
  if (!t) return false;

  const candidates = [project.name, project.workspace]
    .map((s) => String(s || "").trim().toLowerCase())
    .filter((s) => s.length >= 2);

  for (const name of candidates) {
    if (t.includes(name)) return true;
  }

  const primary = candidates.sort((a, b) => b.length - a.length)[0];
  if (!primary) return false;

  const tokens = primary
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^(the|and|for|inc|ltd|llc|co)$/i.test(w));

  // "3 Day Blinds" -> day + blinds (digit-only tokens dropped)
  if (tokens.length >= 2) return tokens.every((tok) => t.includes(tok));
  return tokens.length === 1 && t.includes(tokens[0]);
}

function filterDocsWithClientNameInTitle(docs, project) {
  if (!Array.isArray(docs)) return [];
  const seen = new Set();
  const out = [];
  for (const doc of docs) {
    if (!doc) continue;
    // Linked tracking docs may already be tagged
    const ok =
      doc.forceInclude ||
      titleHasClientName(doc.title, project) ||
      (isTrackingDocumentTitle(doc.title) && doc.fromClientContext);
    if (!ok) continue;
    if (/\bsow\b|statement of work|sales order/i.test(doc.title || "") && !isTrackingDocumentTitle(doc.title)) {
      continue;
    }
    const key = (doc.url || doc.title || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: doc.title || "Document",
      url: doc.url || "",
      summary: doc.summary || doc.snippet || "",
    });
  }
  return out;
}

function isTrackingDocumentTitle(title) {
  return /tracking\s*document/i.test(String(title || ""));
}

/**
 * Find spreadsheet URLs labeled as Tracking Document inside snippets
 * (common in kickoff decks / handovers when the sheet title is hard to search).
 */
function extractLinkedTrackingDocs(docs, project) {
  const out = [];
  const seen = new Set();
  const sheetRe =
    /(?:\[\s*([^\]]*?tracking\s*document[^\]]*)\s*\]\()\s*(https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+)/gi;
  const labeledRe =
    /tracking\s*document[^h]{0,80}(https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+)/gi;
  const bareSheetRe = /(https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+)/gi;

  for (const doc of docs) {
    const text = `${doc.title || ""}\n${doc.snippet || ""}`.replace(/\s+/g, " ");
    if (!titleHasClientName(doc.title, project) && !titleHasClientName(text.slice(0, 200), project)) {
      // Still allow if snippet clearly names the client + tracking document
      const hay = text.toLowerCase();
      const tokens = shortKeywords(project.name || project.workspace || "")
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);
      if (!tokens.length || !tokens.every((tok) => hay.includes(tok))) continue;
    }

    for (const re of [sheetRe, labeledRe]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const url = (m[2] || m[1] || "").replace(/\s+/g, "");
        if (!url || seen.has(url)) continue;
        seen.add(url);
        const linkTitle = (m[1] && /tracking/i.test(m[1]) ? m[1] : null) ||
          `[EXTERNAL] ${project.name || "Client"} Tracking Document`;
        out.push({
          title: String(linkTitle).replace(/^\[|\]$/g, "").trim() || "Tracking Document",
          url,
          summary: "Tracking document linked from client materials",
          forceInclude: true,
          fromClientContext: true,
          kind: "tracking",
        });
      }
    }

    // If this doc itself is a sheet and mentions tracking document in title
    if (isTrackingDocumentTitle(doc.title) && doc.url && !seen.has(doc.url)) {
      seen.add(doc.url);
      out.push({
        title: doc.title,
        url: doc.url,
        summary: doc.snippet || "Tracking document",
        forceInclude: true,
        kind: "tracking",
      });
    }

    // Fallback: "Tracking Document https://docs.google.com/spreadsheets/..."
    if (/tracking\s*document/i.test(text)) {
      bareSheetRe.lastIndex = 0;
      let m;
      while ((m = bareSheetRe.exec(text)) !== null) {
        const url = m[1];
        if (!url || seen.has(url)) continue;
        // Only take sheets near the phrase tracking document
        const idx = text.toLowerCase().indexOf("tracking document");
        const urlIdx = text.indexOf(url);
        if (idx >= 0 && Math.abs(urlIdx - idx) < 180) {
          seen.add(url);
          out.push({
            title: `${project.name || "Client"} Tracking Document`,
            url,
            summary: "Tracking document linked from client materials",
            forceInclude: true,
            fromClientContext: true,
            kind: "tracking",
          });
        }
      }
    }
  }

  return out;
}

function rankDocuments(docs) {
  return dedupeDocs(docs).sort((a, b) => docScore(b) - docScore(a));
}

function docScore(d) {
  const t = `${d.title} ${d.summary || ""}`.toLowerCase();
  let s = 0;
  if (/tracking\s*document/.test(t)) s += 10;
  if (/track/.test(t)) s += 3;
  if (/external/.test(t)) s += 1;
  if (/\bsow\b|sales order|questionnaire|email integration/.test(t)) s -= 4;
  return s;
}

function shortKeywords(name) {
  if (!name) return "Bloomreach Engagement";
  return name
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^(the|and|for|inc|ltd|llc|co)$/i.test(w))
    .slice(0, 6)
    .join(" ");
}

async function searchSafe(glean, args) {
  try {
    const raw = await glean.callTool("search", args);
    return extractSearchDocs(raw);
  } catch {
    return [];
  }
}

/**
 * Glean MCP search usually returns { text: "cursor: ...\\ndocuments[N]:\\n  - title: ..." }
 */
function extractSearchDocs(raw) {
  const parsed = parseToolResult(raw) ?? raw;

  const structured =
    parsed?.documents ||
    parsed?.results ||
    parsed?.data?.documents ||
    (Array.isArray(parsed) ? parsed : null);
  if (Array.isArray(structured) && structured.length) {
    return structured.map(normalizeSearchDoc).filter(Boolean);
  }

  const text = extractText(parsed);
  const fromYaml = parseGleanDocumentsText(text);
  if (fromYaml.length) return fromYaml;

  const asJson = tryParseJsonObject(text);
  const nested =
    asJson?.documents || asJson?.results || (Array.isArray(asJson) ? asJson : null);
  if (Array.isArray(nested)) return nested.map(normalizeSearchDoc).filter(Boolean);

  return [];
}

function parseGleanDocumentsText(text) {
  if (!text || typeof text !== "string") return [];
  const match = text.match(/documents\[\d+\]:\s*\n([\s\S]*)/i);
  if (!match) return [];

  const body = match[1];
  const chunks = body.split(/\n  - /).slice(1);
  const docs = [];

  for (const chunk of chunks) {
    const titleMatch = chunk.match(/(?:^|\n)\s*title:\s*(.+?)(?:\n|$)/);
    const urlMatch =
      chunk.match(/(?:^|\n)\s*url:\s*"([^"]+)"/) ||
      chunk.match(/(?:^|\n)\s*url:\s*'([^']+)'/) ||
      chunk.match(/(?:^|\n)\s*url:\s*(\S+)/);
    const dsMatch = chunk.match(/(?:^|\n)\s*datasource:\s*(\S+)/);
    const snipMatch = chunk.match(
      /snippets\[\d+\]:\s*([\s\S]*?)(?=\n\s{4}title:|\n\s{4}url:|\n\s{4}updateTime:|\n\s{4}createTime:|$)/i
    );

    let title = titleMatch ? titleMatch[1].trim().replace(/^["']|["']$/g, "") : "";
    let url = urlMatch ? urlMatch[1].trim() : "";
    if (url.endsWith('"') || url.endsWith("'")) url = url.slice(0, -1);

    let snippet = "";
    if (snipMatch) {
      snippet = snipMatch[1]
        .replace(/\s+/g, " ")
        .replace(/^\[/, "")
        .trim()
        .slice(0, 400);
    }

    if (!title && !url) continue;
    docs.push({
      title: title || "Document",
      url,
      snippet,
      datasource: dsMatch ? dsMatch[1].trim().toLowerCase() : "",
    });
  }

  return docs;
}

function normalizeSearchDoc(doc) {
  if (!doc || typeof doc !== "object") return null;
  const title = String(doc.title || doc.name || "").trim();
  const url = String(doc.url || doc.link || "").trim();
  if (!title && !url) return null;

  let snippet = "";
  if (Array.isArray(doc.snippets) && doc.snippets.length) {
    snippet = doc.snippets
      .map((s) => (typeof s === "string" ? s : s?.snippet || ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
  } else if (typeof doc.snippet === "string") {
    snippet = doc.snippet.replace(/\s+/g, " ").trim().slice(0, 400);
  }

  const datasource = String(doc.datasource || doc.app || "").toLowerCase();
  return { title: title || "Document", url, snippet, datasource };
}

function dedupeDocs(docs) {
  const seen = new Set();
  const out = [];
  for (const doc of docs) {
    const key = (doc.url || doc.title || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(doc);
  }
  return out;
}

function preferCustomerDocs(docs, keywords) {
  const kw = String(keywords || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const score = (d) => {
    let s = docScore(d);
    const hay = `${d.title} ${d.snippet || d.summary || ""} ${d.url}`.toLowerCase();
    if (/docs\.google\.com|drive\.google/i.test(d.url || "")) s += 4;
    if (/documentation\.bloomreach\.com|bloomreachreadmedocs/i.test(d.url + (d.datasource || ""))) {
      s -= 5;
    }
    for (const w of kw) {
      if (hay.includes(w.toLowerCase())) s += 2;
    }
    return s;
  };
  return [...docs].sort((a, b) => score(b) - score(a));
}

function looksLikeTrackingDoc(d) {
  const hay = `${d.title} ${d.snippet || d.summary || ""}`.toLowerCase();
  return /track|event schema|data (map|spec)|pixel|sdk|catalog/i.test(hay);
}

function pickPrimaryDoc(docs = []) {
  const scored = docs
    .map((d) => ({ d, score: docScore(d) + (looksLikeTrackingDoc(d) ? 2 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.d || docs[0] || null;
}

function cleanSnippet(text) {
  return String(text || "")
    .replace(/\\"/g, '"')
    .replace(/[#*_`|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** One clear sentence describing what the document is (not a raw Glean snippet). */
function describeDocument(doc) {
  const title = String(doc.title || "Document").replace(/\s+/g, " ").trim();
  const t = title.toLowerCase();
  const existing = String(doc.summary || "").trim();

  // Keep short human sentences we already wrote (e.g. linked tracking docs)
  if (
    existing &&
    existing.length >= 24 &&
    existing.length <= 140 &&
    !/[|#…]{2,}|,,,|snippets?\[|https?:\/\//i.test(existing) &&
    /^[A-Z]/.test(existing)
  ) {
    return /[.!?]$/.test(existing) ? existing : `${existing}.`;
  }

  if (/tracking\s*document/i.test(t)) {
    return "Engagement tracking spreadsheet defining events, attributes, and data sources.";
  }
  if (/email.*(integration|questionnaire)|questionnaire.*email/i.test(t)) {
    return "Email integration questionnaire covering DNS, domains, warmup, and ESP setup.";
  }
  if (/use\s*cases?.*(scope|tracker)|in\s*scope\s*tracker/i.test(t)) {
    return "Use-case tracker listing scoped automations and their current status.";
  }
  if (/kick-?off/i.test(t)) {
    return "Kick-off presentation covering the team, plan, and next implementation steps.";
  }
  if (/handover/i.test(t)) {
    return "Sales-to-delivery handover summary for the Engagement project.";
  }
  if (/id'?s?\s*set-?up|project and id|identifiers?/i.test(t) && /set-?up|form|project/i.test(t)) {
    return "Project setup form for hard and soft customer identifiers.";
  }
  if (/scope\s*question/i.test(t)) {
    return "Open scope questions and clarifications for the project team.";
  }
  if (/sales order/i.test(t)) {
    return "Signed sales order outlining products, packages, and commercial scope.";
  }
  if (/\bsow\b|statement of work/i.test(t)) {
    return "Statement of work describing implementation scope and responsibilities.";
  }
  if (/folder/i.test(t) || /drive\.google\.com\/drive\/folders/i.test(doc.url || "")) {
    return "Shared Drive folder with client project materials.";
  }
  if (/\.pdf$/i.test(t) || /drive\.google\.com\/file\//i.test(doc.url || "")) {
    return "PDF project document related to this Engagement client.";
  }
  if (/docs\.google\.com\/spreadsheets/i.test(doc.url || "")) {
    return "Google Sheet used for project tracking or configuration.";
  }
  if (/docs\.google\.com\/document/i.test(doc.url || "")) {
    return "Google Doc with project notes or configuration details.";
  }
  if (/docs\.google\.com\/presentation/i.test(doc.url || "")) {
    return "Google Slides deck for the Engagement project.";
  }

  const plain = title
    .replace(/^\[external\]\s*/i, "")
    .replace(/\.(pdf|docx?|xlsx?)$/i, "")
    .trim();
  return `Client project document: ${plain}.`;
}

function coerceOneLiner(summary, label, docs = [], implementation = []) {
  let text = String(summary || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\|[^\n]*\|/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/[#*_>`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (isGarbageSummary(text)) text = "";

  const sentence = text.match(/([A-Z][^.!?]{30,170}[.!?])/);
  if (sentence && !isGarbageSummary(sentence[1])) return sentence[1].trim();

  if (text && text.length >= 40 && text.length <= 200 && !/\n/.test(text) && !isGarbageSummary(text)) {
    return /[.!?]$/.test(text) ? text : `${text}.`;
  }

  const implLine = (implementation || []).find((line) => {
    const s = String(line || "").trim();
    return s.length >= 40 && s.length <= 180 && !isGarbageSummary(s);
  });
  if (implLine) {
    const s = String(implLine).trim();
    return s.startsWith(label) ? s : `${label}: ${s}`;
  }

  const primary = pickPrimaryDoc(docs);
  if (primary) {
    return `${label} - see documents below.`;
  }

  return docs.length
    ? `${label} - see documents below.`
    : `No documents found in Glean for ${label}.`;
}

function isGarbageSummary(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (/^here are\b|one-line summary|responsible\s*,\s*status|estimated days|document \| vertical/i.test(t)) {
    return true;
  }
  if ((t.match(/,/g) || []).length >= 5) return true;
  if (/,,,|…\.\s*$/.test(t)) return true;
  return false;
}

function coerceVertical(vertical, summary, docs = []) {
  const given = String(vertical || "")
    .replace(/[#*_`|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (given && given.length <= 40 && !/here are|summary/i.test(given)) {
    return given;
  }

  const hay = `${summary} ${docs
    .slice(0, 5)
    .map((d) => `${d.title} ${d.snippet || d.summary || ""}`)
    .join(" ")}`.toLowerCase();

  const rules = [
    [/\b(hospitality|competitive socialis|venues?|leisure|bars?|pubs?|bowling|clays?)\b/i, "Hospitality"],
    [/\b(restaurants?|dining|caf[eé]s?|takeaway)\b/i, "Restaurants"],
    [/\b(windows?|blinds?|shades?|curtains?|home improvement)\b/i, "Home improvement"],
    [/\b(fashion|apparel|clothing|menswear|womenswear)\b/i, "Fashion"],
    [/\b(beauty|cosmetics?|skincare)\b/i, "Beauty"],
    [/\b(travel|airlines?|hotels?|flights?|holidays?)\b/i, "Travel"],
    [/\b(grocery|groceries|supermarket|cpg|fmcg)\b/i, "CPG"],
    [/\b(bank|banking|fintech|insurance)\b/i, "Financial services"],
    [/\b(pharma|healthcare|wellness)\b/i, "Health"],
    [/\b(automotive|vehicles?|dealership)\b/i, "Automotive"],
    [/\b(retail|retailer|e-?commerce|ecommerce|shopify|commerce)\b/i, "Retail"],
  ];
  for (const [re, label] of rules) {
    if (re.test(hay)) return label;
  }
  return given.slice(0, 40);
}

function formatDocForPrompt(d) {
  return `- [${d.kind || "doc"}] ${d.title}\n  url: ${d.url || "(no url)"}\n  note: ${d.snippet || d.summary || "(no snippet)"}`;
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

function asLinkList(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const title = String(item.title || item.name || "").trim();
      const url = String(item.url || item.link || "").trim();
      const summary = String(item.summary || item.detail || item.description || "").trim();
      if (!title && !url && !summary) return null;
      return { title: title || "Source", url, summary };
    })
    .filter(Boolean);
}

function asStringList(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return String(item.detail || item.summary || item.text || item.title || "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function asIntegrationList(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") {
        const text = item.trim();
        return text ? { name: text, detail: "" } : null;
      }
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || item.title || "").trim();
      const detail = String(item.detail || item.summary || item.status || "").trim();
      if (!name && !detail) return null;
      return { name: name || "Integration", detail };
    })
    .filter(Boolean);
}

function normalizeClientBrief(raw, fallbackLabel) {
  if (raw == null) {
    return emptyBrief(fallbackLabel, ["Glean chat synthesis failed; showing search hits if any."]);
  }

  const parsed = parseToolResult(raw) ?? raw;
  const text = extractText(parsed);
  const json = tryParseJsonObject(text);

  if (json && typeof json === "object") {
    const trackingDocs = asLinkList(json.trackingDocs || json.tracking_documents || json.docs);
    const sources = asLinkList(json.sources);
    const implementation = asStringList(json.implementation || json.implementationNotes);
    const integrations = asIntegrationList(json.integrations);
    const gaps = asStringList(json.gaps || json.unknown);
    const summary = String(json.summary || json.overview || "").trim();
    const vertical = String(json.vertical || "").trim();

    return {
      overview: summary,
      vertical,
      summary,
      trackingDocs,
      implementation,
      integrations,
      gaps,
      sources: sources.length ? sources : trackingDocs.filter((d) => d.url),
      source: "glean",
    };
  }

  const cleaned = text
    .replace(/\[\^\d+\]/g, "")
    .replace(/chatId:[\s\S]*$/i, "")
    .trim();

  return {
    overview: cleaned.slice(0, 400),
    vertical: "",
    summary: cleaned.slice(0, 400),
    trackingDocs: [],
    implementation: [],
    integrations: [],
    gaps: cleaned ? [] : [`No Glean notes found for ${fallbackLabel}.`],
    sources: [],
    source: "glean",
  };
}

function emptyBrief(fallbackLabel, gaps = []) {
  return {
    overview: "",
    vertical: "",
    summary: "",
    trackingDocs: [],
    implementation: [],
    integrations: [],
    gaps,
    sources: [],
    source: "glean",
  };
}

/**
 * Create a LoomiClient pointed at Bloomreach Glean MCP.
 */
export function createGleanClient({ redirectUrl, mcpUrl, storagePath }) {
  return new LoomiClient({
    mcpUrl:
      mcpUrl ||
      process.env.GLEAN_MCP_URL ||
      "https://bloomreach-be.glean.com/mcp/default",
    redirectUrl,
    regionId: "glean",
    storagePath,
  });
}
