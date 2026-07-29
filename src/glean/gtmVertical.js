/**
 * Authoritative vertical lookup: Salesforce GTM fields via Glean search.
 * Preferred over LLM/text guesses because it is the same mapping GTM reports on.
 */

import { parseToolResult } from "../loomi/client.js";

/** Environment / suffix words in Engagement project names that are not part of the client name. */
const ENV_TOKENS =
  /^(production|prod|live|staging|stage|sandbox|test|testing|tests|dev|development|demo|uat|qa|engagement|bloomreach|project)$/i;

/** Salesforce fields in GTM precedence order (most specific first). */
const GTM_FIELDS = [
  { key: "gtmIndustry", field: "GTM Industry" },
  { key: "gtmIndustryGroup", field: "GTM Industry Group" },
  { key: "csmSegment", field: "CSM Segment" },
  { key: "gtmBusinessVertical", field: "GTM Business Vertical" },
  { key: "industry", field: "Industry" },
];

/** GTM label → vertical pack id. Order matters: most specific patterns first. */
const GTM_LABEL_TO_VERTICAL = [
  [/\b(bars?|pubs?|nightlife|nightclubs?|casinos?|gambling|bowling|competitive socialis|venues?)\b/i, "hospitality"],
  [/\bhospitality\b/i, "hospitality"],
  [/\b(restaurants?|dining|food service|qsr|caf[eé]s?|takeaway|catering)\b/i, "restaurants"],
  [/\b(hotels?|airlines?|flights?|travel|tourism|accommodation|cruise)\b/i, "travel"],
  [/\b(recreation|leisure|entertainment|attractions?|theme park|cinemas?|theatres?)\b/i, "hospitality"],
  [/\b(fashion|apparel|clothing|footwear|accessories)\b/i, "fashion"],
  [/\b(sports?|athletic|outdoor|fitness)\b/i, "sports"],
  [/\b(jewell?ery|eyewear|watches)\b/i, "jewellery"],
  [/\b(cosmetics?|beauty|skincare|fragrance|perfume)\b/i, "beauty"],
  [/\b(grocery|groceries|supermarkets?|food & beverage|cpg|fmcg|convenience)\b/i, "grocery"],
  [/\b(home|garden|furniture|diy|hardware|interiors?)\b/i, "home"],
  [/\b(automotive|transportation|transit|rail|bus(?:es)?|mobility)\b/i, "mobility"],
  [/\b(financial|banks?|banking|insurance|fintech)\b/i, "financial"],
  [/\b(retail|e-?commerce|ecommerce|marketplace|consumer services)\b/i, "retail"],
];

/** Client name tokens from an Engagement project name ("Clays - Production" → ["clays"]). */
export function clientTokens(project = {}) {
  const raw = [project.name, project.workspace, project.workspace_name]
    .filter(Boolean)
    .join(" ");
  return [
    ...new Set(
      String(raw)
        .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
        .split(/[\s_-]+/)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 2 && !ENV_TOKENS.test(t))
    ),
  ];
}

export function mapGtmLabelToVerticalId(label) {
  const text = String(label || "");
  if (!text.trim()) return null;
  for (const [re, id] of GTM_LABEL_TO_VERTICAL) {
    if (re.test(text)) return id;
  }
  return null;
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

function readField(blob, field) {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, "i");
  const m = blob.match(re);
  const value = m ? m[1].trim() : "";
  return value && value.toLowerCase() !== "unknown" ? value : "";
}

/** Salesforce records arrive as one JSON-ish blob per line in the search text. */
function candidateBlobs(text, tokens) {
  const lines = String(text || "").split("\n");
  const out = [];
  for (const line of lines) {
    if (!line.includes('"')) continue;
    const hay = line.toLowerCase();
    // Only trust records that clearly belong to this client
    const owned = tokens.some((tok) => new RegExp(`\\b${tok}\\b`).test(hay));
    if (!owned) continue;
    if (!GTM_FIELDS.some(({ field }) => hay.includes(`"${field.toLowerCase()}"`))) continue;
    out.push(line);
  }
  return out;
}

/**
 * Look up the client's GTM vertical from Salesforce records indexed in Glean.
 * @returns {Promise<null | { verticalId: string|null, label: string, fields: object, accountName: string, website: string, source: string }>}
 */
export async function fetchGtmVertical(glean, project = {}) {
  if (!glean) return null;
  const tokens = clientTokens(project);
  if (!tokens.length) return null;

  const name = tokens.join(" ");
  let text = "";
  try {
    const raw = await glean.callTool("search", {
      query: name,
      app: "salescloud",
      num_results: 10,
    });
    text = extractText(parseToolResult(raw) ?? raw);
  } catch {
    return null;
  }

  const blobs = candidateBlobs(text, tokens);
  if (!blobs.length) return null;

  /** @type {Record<string, string>} */
  const fields = {};
  let accountName = "";
  let website = "";
  for (const blob of blobs) {
    for (const { key, field } of GTM_FIELDS) {
      if (!fields[key]) {
        const value = readField(blob, field);
        if (value) fields[key] = value;
      }
    }
    accountName = accountName || readField(blob, "Account Name");
    website = website || readField(blob, "Website") || readField(blob, "Domain");
  }

  for (const { key } of GTM_FIELDS) {
    const label = fields[key];
    if (!label) continue;
    const verticalId = mapGtmLabelToVerticalId(label);
    if (!verticalId) continue;
    return {
      verticalId,
      label,
      matchedField: GTM_FIELDS.find((f) => f.key === key)?.field || key,
      fields,
      accountName,
      website,
      source: "salesforce-gtm",
    };
  }

  return null;
}
