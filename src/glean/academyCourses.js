/**
 * Glean-backed Bloomreach Academy course recommendations
 * tied to next-best-action / adoption opportunities.
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

function extractSearchDocs(raw) {
  const parsed = raw?.documents || raw?.results || raw?.data?.documents;
  if (Array.isArray(parsed)) {
    return parsed.map((doc) => ({
      title: String(doc.title || doc.name || "").trim(),
      url: String(doc.url || doc.link || "").trim(),
      snippet: String(doc.snippet || doc.summary || "").slice(0, 220),
    }));
  }
  return extractSearchDocsFromText(extractText(raw));
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

function isAcademyUrl(url) {
  return /academy\.bloomreach\.com/i.test(String(url || ""));
}

function emptyAcademy(reason = null) {
  return {
    available: false,
    error: reason,
    needsAuth: false,
    authUrl: null,
    foundations: FOUNDATIONS,
    suggested: [],
    sources: [],
  };
}

const FOUNDATIONS = [
  {
    title: "Platform Foundations",
    url: "https://academy.bloomreach.com/",
    badge: "foundation",
  },
  {
    title: "Email Campaign Essentials",
    url: "https://academy.bloomreach.com/",
    badge: "foundation",
  },
  {
    title: "Audiences & Segmentation",
    url: "https://academy.bloomreach.com/",
    badge: "foundation",
  },
];

function compactOpportunities(items = []) {
  return items.slice(0, 5).map((item) => ({
    title: String(item.title || "").slice(0, 160),
    area: String(item.area || item.scenario || "").slice(0, 80),
    detail: String(item.detail || item.narrative || "").slice(0, 220),
    action: String(item.action || "").slice(0, 180),
  }));
}

/**
 * @param {import('../loomi/client.js').LoomiClient} glean
 * @param {{ project?: object, opportunities?: array, vertical?: string }} input
 */
export async function fetchAcademyCourses(glean, input = {}) {
  if (!glean) return emptyAcademy("Glean not connected");

  try {
    await glean.ensureConnected();
  } catch (err) {
    if (err.code === "NEEDS_AUTH") {
      const out = emptyAcademy("Glean authentication required");
      out.needsAuth = true;
      out.authUrl = err.authUrl || glean.authProvider?.pendingAuthUrl || null;
      return out;
    }
    return emptyAcademy(err.message || String(err));
  }

  const opportunities = compactOpportunities(input.opportunities || []);
  const vertical = String(input.vertical || "").trim();
  const projectName = String(input.project?.name || input.project?.workspace || "").trim();
  const topicHints = opportunities
    .map((o) => o.title)
    .filter(Boolean)
    .slice(0, 3);

  const queries = [
    topicHints[0]
      ? `Bloomreach Academy ${topicHints[0]} Engagement course`
      : "Bloomreach Academy Engagement scenarios automation course",
    topicHints[1]
      ? `site:academy.bloomreach.com ${topicHints[1]}`
      : "site:academy.bloomreach.com deliverability personalisation",
    vertical
      ? `Bloomreach Academy ${vertical} Engagement training`
      : "Bloomreach Academy Engagement recommendations predictions",
  ];

  const docs = [];
  const seen = new Set();
  for (const query of queries.slice(0, 2)) {
    try {
      const raw = await glean.callTool("search", { query, num_results: 6 });
      for (const doc of extractSearchDocs(raw)) {
        const url = doc.url || "";
        const key = (url || doc.title).toLowerCase();
        if (!key || seen.has(key)) continue;
        if (url && !isAcademyUrl(url) && !/bloomreach\.com\/.*(academy|learn|course|training)/i.test(url)) {
          continue;
        }
        seen.add(key);
        docs.push(doc);
      }
    } catch {
      // optional
    }
  }

  let suggested = [];
  try {
    const raw = await glean.callTool("chat", {
      message: [
        "You help Bloomreach consultants recommend Bloomreach Academy courses.",
        "Return JSON only (no markdown fences) with this shape:",
        JSON.stringify({
          courses: [
            {
              title: "course title",
              url: "https://academy.bloomreach.com/...",
              relatedTo: "exact opportunity title",
              why: "one sentence why this course helps",
              badge: "do_next|recommended",
            },
          ],
        }),
        "Hard rules:",
        "- Prefer URLs on academy.bloomreach.com when available in contextDocs.",
        "- Relate each course to one opportunity from opportunities[].",
        "- Max 5 courses. First should use badge do_next; others recommended.",
        "- Do not invent unrelated product gaps.",
        `Client: ${projectName || "Engagement project"}${vertical ? ` (${vertical})` : ""}.`,
        "Opportunities JSON:",
        JSON.stringify(opportunities),
        "Context docs (search hits):",
        JSON.stringify(docs.slice(0, 10)),
      ].join("\n"),
    });

    const json = tryParseJsonObject(extractText(raw));
    const list = Array.isArray(json?.courses) ? json.courses : [];
    suggested = list
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const title = String(item.title || "").trim();
        if (!title) return null;
        let url = String(item.url || "").trim();
        if (!url) {
          const match = docs.find((d) =>
            d.title.toLowerCase().includes(title.toLowerCase().slice(0, 24))
          );
          url = match?.url || "https://academy.bloomreach.com/";
        }
        const badgeRaw = String(item.badge || "").toLowerCase();
        const badge =
          badgeRaw === "do_next" || index === 0 ? "do_next" : "recommended";
        return {
          title: title.slice(0, 160),
          url,
          relatedTo: String(item.relatedTo || "").trim().slice(0, 160),
          why: String(item.why || item.rationale || "").trim().slice(0, 280),
          badge,
        };
      })
      .filter(Boolean)
      .slice(0, 5);
  } catch (err) {
    return {
      ...emptyAcademy(err.message || String(err)),
      available: docs.length > 0,
      suggested: docs.slice(0, 4).map((d, i) => ({
        title: d.title,
        url: d.url || "https://academy.bloomreach.com/",
        relatedTo: topicHints[i] || "",
        why: d.snippet || "",
        badge: i === 0 ? "do_next" : "recommended",
      })),
      sources: docs.slice(0, 4),
    };
  }

  if (!suggested.length && docs.length) {
    suggested = docs.slice(0, 4).map((d, i) => ({
      title: d.title,
      url: d.url || "https://academy.bloomreach.com/",
      relatedTo: topicHints[i] || "",
      why: d.snippet || "Related Academy content for this opportunity.",
      badge: i === 0 ? "do_next" : "recommended",
    }));
  }

  return {
    available: suggested.length > 0,
    error: suggested.length ? null : "No Academy courses matched these opportunities yet.",
    needsAuth: false,
    authUrl: null,
    foundations: FOUNDATIONS,
    suggested,
    sources: docs.slice(0, 6).map((d) => ({ title: d.title, url: d.url })),
  };
}
