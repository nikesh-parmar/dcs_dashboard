/**
 * Glean-backed Q&A over Bloomreach documentation.
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

function cleanAnswer(text) {
  return String(text || "")
    .replace(/\[\^\d+\]/g, "")
    .replace(/chatId:\s*\S+/gi, "")
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
    .trim();
}

function extractSources(text) {
  const sources = [];
  const seen = new Set();
  const urlRe = /https?:\/\/[^\s)\]>"']+/g;
  const matches = String(text || "").match(urlRe) || [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?)]+$/, "");
    if (!/bloomreach\.com|exponea\.com/i.test(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ title: "Bloomreach docs", url });
    if (sources.length >= 4) break;
  }
  return sources;
}

/**
 * @param {import('../loomi/client.js').LoomiClient} glean
 * @param {{ question: string, history?: Array<{ role: string, content: string }> }} input
 */
export async function answerDocsQuestion(glean, input = {}) {
  if (!glean) {
    return { ok: false, error: "Glean not connected", answer: "", sources: [] };
  }

  const question = String(input.question || "").trim();
  if (!question) {
    return { ok: false, error: "Question is required", answer: "", sources: [] };
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
        sources: [],
      };
    }
    return { ok: false, error: err.message || String(err), answer: "", sources: [] };
  }

  const history = Array.isArray(input.history) ? input.history.slice(-6) : [];
  const historyBlock = history
    .map((turn) => `${turn.role === "assistant" ? "Assistant" : "User"}: ${String(turn.content || "").slice(0, 500)}`)
    .join("\n");

  try {
    // Prefer docs-oriented search context, then chat synthesis.
    let contextDocs = [];
    try {
      const raw = await glean.callTool("search", {
        query: `${question} site:documentation.bloomreach.com`,
        num_results: 5,
      });
      const docs = raw?.documents || raw?.results || raw?.data?.documents;
      if (Array.isArray(docs)) {
        contextDocs = docs.slice(0, 5).map((d) => ({
          title: String(d.title || d.name || "").slice(0, 160),
          url: String(d.url || d.link || "").slice(0, 300),
          snippet: String(d.snippet || d.summary || "").slice(0, 220),
        }));
      }
    } catch {
      contextDocs = [];
    }

    const raw = await glean.callTool("chat", {
      message: [
        "You are a Bloomreach Digital Client Services assistant.",
        "Answer using Bloomreach Engagement / Bloomreach documentation only.",
        "Prefer official docs at documentation.bloomreach.com and support.bloomreach.com.",
        "If unsure, say what you know and point to the closest doc.",
        "Keep answers concise (under 180 words) with concrete steps when useful.",
        "Include 1-3 documentation URLs when available.",
        historyBlock ? `Recent conversation:\n${historyBlock}` : "",
        contextDocs.length
          ? `Search context JSON:\n${JSON.stringify(contextDocs)}`
          : "",
        `User question: ${question}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    const answer = cleanAnswer(extractText(raw));
    const sources = [
      ...contextDocs
        .filter((d) => d.url)
        .map((d) => ({ title: d.title || "Bloomreach docs", url: d.url })),
      ...extractSources(answer),
    ];
    const seen = new Set();
    const uniqueSources = [];
    for (const s of sources) {
      const key = String(s.url || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      uniqueSources.push(s);
      if (uniqueSources.length >= 4) break;
    }

    if (!answer) {
      return {
        ok: false,
        error: "No answer returned from Loomi docs chat.",
        answer: "",
        sources: uniqueSources,
      };
    }

    return { ok: true, error: null, answer, sources: uniqueSources };
  } catch (err) {
    return {
      ok: false,
      error: err.message || String(err),
      answer: "",
      sources: [],
    };
  }
}
