/**
 * Glean-backed Q&A over Bloomreach documentation.
 * Returns a short plain-text answer plus one docs link for further reading.
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
  if (typeof payload.reply === "string") return payload.reply;
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

function cleanAnswer(text) {
  return String(text || "")
    .replace(/\[\^\d+\]/g, "")
    .replace(/chatId:\s*\S+/gi, "")
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenAnswer(text, maxChars = 220) {
  const cleaned = cleanAnswer(text);
  if (cleaned.length <= maxChars) return cleaned;
  const cut = cleaned.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastStop > 80) return cut.slice(0, lastStop + 1).trim();
  return `${cut.replace(/\s+\S*$/, "").trim()}…`;
}

function extractFirstDocsUrl(text) {
  const urlRe = /https?:\/\/[^\s)\]>"']+/g;
  const matches = String(text || "").match(urlRe) || [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?)]+$/, "");
    if (/documentation\.bloomreach\.com|support\.bloomreach\.com|academy\.bloomreach\.com/i.test(url)) {
      return url;
    }
  }
  return null;
}

const DEFAULT_DOCS = {
  title: "Bloomreach Engagement docs",
  url: "https://documentation.bloomreach.com/engagement",
};

/**
 * @param {import('../loomi/client.js').LoomiClient} glean
 * @param {{ question: string, history?: Array<{ role: string, content: string }> }} input
 */
export async function answerDocsQuestion(glean, input = {}) {
  if (!glean) {
    return { ok: false, error: "Glean not connected", answer: "", docsLink: DEFAULT_DOCS, sources: [] };
  }

  const question = String(input.question || "").trim();
  if (!question) {
    return {
      ok: false,
      error: "Question is required",
      answer: "",
      docsLink: DEFAULT_DOCS,
      sources: [],
    };
  }

  try {
    await glean.ensureConnected();
  } catch (err) {
    if (err.code === "NEEDS_AUTH") {
      return {
        ok: false,
        error: "Glean authentication required",
        needsAuth: true,
        authUrl: err.authUrl || glean.authProvider?.pendingAuthUrl || null,
        answer: "",
        docsLink: DEFAULT_DOCS,
        sources: [],
      };
    }
    return {
      ok: false,
      error: err.message || String(err),
      answer: "",
      docsLink: DEFAULT_DOCS,
      sources: [],
    };
  }

  const history = Array.isArray(input.history) ? input.history.slice(-4) : [];
  const historyBlock = history
    .map((turn) => `${turn.role === "assistant" ? "Assistant" : "User"}: ${String(turn.content || "").slice(0, 280)}`)
    .join("\n");

  try {
    let contextDocs = [];
    try {
      const raw = await glean.callTool("search", {
        query: `${question} site:documentation.bloomreach.com`,
        num_results: 4,
      });
      const docs = raw?.documents || raw?.results || raw?.data?.documents;
      if (Array.isArray(docs)) {
        contextDocs = docs.slice(0, 4).map((d) => ({
          title: String(d.title || d.name || "").slice(0, 120),
          url: String(d.url || d.link || "").slice(0, 300),
          snippet: String(d.snippet || d.summary || "").slice(0, 160),
        }));
      }
    } catch {
      contextDocs = [];
    }

    const raw = await glean.callTool("chat", {
      message: [
        "You are Loomi Assistant for Bloomreach Engagement.",
        "Return JSON only (no markdown fences) with this exact shape:",
        JSON.stringify({
          answer: "1-2 short plain sentences. No bullets. No markdown.",
          docsTitle: "best matching doc title",
          docsUrl: "https://documentation.bloomreach.com/...",
        }),
        "Hard rules:",
        "- answer must be plain text only, max ~40 words.",
        "- Do not include URLs inside answer.",
        "- Prefer documentation.bloomreach.com links from context.",
        "- If no perfect match, still give a short helpful answer and the closest docs URL.",
        historyBlock ? `Recent conversation:\n${historyBlock}` : "",
        contextDocs.length ? `Docs context JSON:\n${JSON.stringify(contextDocs)}` : "",
        `User question: ${question}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    const text = extractText(raw);
    const json = tryParseJsonObject(text);
    let answer = "";
    let docsLink = { ...DEFAULT_DOCS };

    if (json && typeof json === "object") {
      answer = shortenAnswer(json.answer || json.summary || json.reply || "");
      const url = String(json.docsUrl || json.url || json.docUrl || "").trim();
      const title = String(json.docsTitle || json.title || "Bloomreach docs").trim();
      if (url) docsLink = { title: title || "Bloomreach docs", url };
    } else {
      answer = shortenAnswer(text);
      const fromText = extractFirstDocsUrl(text);
      if (fromText) docsLink = { title: "Bloomreach docs", url: fromText };
    }

    if (!docsLink.url || docsLink.url === DEFAULT_DOCS.url) {
      const first = contextDocs.find((d) => d.url);
      if (first?.url) {
        docsLink = {
          title: first.title || "Bloomreach docs",
          url: first.url,
        };
      }
    }

    // Strip any leftover URLs from the short answer body.
    answer = answer.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();

    if (!answer) {
      return {
        ok: false,
        error: "No answer returned from Loomi docs chat.",
        answer: "",
        docsLink,
        sources: docsLink.url ? [docsLink] : [],
      };
    }

    return {
      ok: true,
      error: null,
      answer,
      docsLink,
      sources: docsLink.url ? [docsLink] : [],
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message || String(err),
      answer: "",
      docsLink: DEFAULT_DOCS,
      sources: [],
    };
  }
}
