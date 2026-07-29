import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import dotenv from "dotenv";
import { loadConfig } from "./config.js";
import { MultiRegionLoomi, parseMcpEndpoints } from "./loomi/multiClient.js";
import { runProjectAudit } from "./loomi/audit.js";
import { createGleanClient, fetchClientBrief } from "./glean/clientBrief.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const {
  PORT,
  BIND_HOST,
  APP_BASE_URL,
  DATA_DIR,
  REDIRECT_URL,
  GLEAN_REDIRECT_URL,
  GLEAN_MCP_URL,
  onRender,
} = loadConfig();

const MCP_ENDPOINTS = parseMcpEndpoints(process.env);

const app = express();
// Render (and most PaaS) terminate TLS at the proxy
app.set("trust proxy", 1);

const loomi = new MultiRegionLoomi({
  endpoints: MCP_ENDPOINTS,
  redirectUrl: REDIRECT_URL,
  dataDir: DATA_DIR,
});
const glean = createGleanClient({
  redirectUrl: GLEAN_REDIRECT_URL,
  mcpUrl: GLEAN_MCP_URL,
  storagePath: path.join(DATA_DIR, "oauth-glean.json"),
});

/** @type {Map<string, object>} */
const projectCache = new Map();

app.use(express.json());
app.use(express.static(path.join(ROOT, "public")));

function sendError(res, err, fallbackClient = null) {
  if (err.code === "NEEDS_AUTH") {
    const client = fallbackClient || loomi.pendingClient;
    return res.status(401).json({
      error: err.message,
      needsAuth: true,
      authUrl: err.authUrl || client?.authProvider?.pendingAuthUrl,
    });
  }
  console.error(err);
  return res.status(500).json({ error: err.message || String(err) });
}

/**
 * Connect Loomi Connect (all regions) then Glean from one entry point.
 * Returns needsAuth + authUrl whenever the next MCP still needs a login window.
 */
async function connectAllMcps() {
  const loomiStatus = loomi.getStatus();
  if (!loomiStatus.allConnected) {
    const loomiResult = await loomi.connect();
    if (loomiResult.needsAuth) {
      return {
        ...loomiResult,
        provider: "loomi",
        glean: glean.getStatus(),
        allMcpsConnected: false,
        message:
          loomiResult.message ||
          `Authorize ${(loomiResult.pendingRegionId || "Loomi").toString().toUpperCase()} Loomi Connect, then return here.`,
      };
    }
  }

  const gleanStatus = glean.getStatus();
  if (!gleanStatus.connected) {
    const gleanResult = await glean.connect();
    if (gleanResult.needsAuth) {
      return {
        connected: true,
        allConnected: true,
        needsAuth: true,
        authUrl: gleanResult.authUrl,
        provider: "glean",
        glean: glean.getStatus(),
        allMcpsConnected: false,
        message: "Authorize Loomi, then return here.",
      };
    }
  }

  return {
    connected: true,
    allConnected: true,
    allMcpsConnected: true,
    provider: null,
    glean: glean.getStatus(),
    message: "Connected to Loomi.",
  };
}

app.get("/api/status", (_req, res) => {
  const loomiStatus = loomi.getStatus();
  const gleanStatus = glean.getStatus();
  res.json({
    ...loomiStatus,
    glean: gleanStatus,
    allMcpsConnected: Boolean(loomiStatus.allConnected && gleanStatus.connected),
  });
});

app.post("/api/connect", async (_req, res) => {
  try {
    const result = await connectAllMcps();
    res.json(result);
  } catch (err) {
    const provider = err?.authUrl && String(err.authUrl).includes("glean") ? glean : null;
    sendError(res, err, provider);
  }
});

app.post("/api/glean/connect", async (_req, res) => {
  try {
    // Kept for compatibility — same unified connect path
    const result = await connectAllMcps();
    res.json(result);
  } catch (err) {
    sendError(res, err, glean);
  }
});

app.post("/api/disconnect", async (_req, res) => {
  try {
    await loomi.disconnect();
    await glean.disconnect();
    projectCache.clear();
    res.json({ connected: false, allMcpsConnected: false });
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/oauth/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const error = req.query.error;
    const regionId =
      typeof req.query.region === "string" ? req.query.region : loomi.pendingRegionId;

    if (error) {
      return res.status(400).send(renderCallbackPage(false, String(error)));
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send(renderCallbackPage(false, "Missing authorization code"));
    }

    const finished = await loomi.finishAuth(code, regionId);
    const continued = await connectAllMcps();
    const needsMoreAuth = Boolean(continued.needsAuth && continued.authUrl);
    res.send(
      renderCallbackPage(true, "", {
        regionId: finished.regionId,
        needsMoreAuth,
        authUrl: continued.authUrl || "",
        message:
          continued.message ||
          (needsMoreAuth
            ? continued.provider === "glean"
              ? "Loomi connected. Continuing authorization…"
              : "Continuing authorization…"
            : "Connected to Loomi."),
      })
    );
  } catch (err) {
    console.error("OAuth callback failed:", err);
    res.status(500).send(renderCallbackPage(false, err.message || String(err)));
  }
});

app.get("/oauth/glean/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const error = req.query.error;
    if (error) {
      return res.status(400).send(renderCallbackPage(false, String(error)));
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send(renderCallbackPage(false, "Missing authorization code"));
    }
    await glean.finishAuth(code);
    const continued = await connectAllMcps();
    const needsMoreAuth = Boolean(continued.needsAuth && continued.authUrl);
    res.send(
      renderCallbackPage(true, "", {
        needsMoreAuth,
        authUrl: continued.authUrl || "",
        message:
          continued.message ||
          (needsMoreAuth
            ? "Loomi connected. Continuing remaining login…"
            : "Connected to Loomi."),
      })
    );
  } catch (err) {
    console.error("Glean OAuth callback failed:", err);
    res.status(500).send(renderCallbackPage(false, err.message || String(err)));
  }
});

app.get("/api/organizations", async (_req, res) => {
  try {
    const { organizations, errors } = await loomi.listOrganizations();
    res.json({ organizations, errors });
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/projects", async (req, res) => {
  try {
    const orgId = req.query.orgId;
    if (!orgId || typeof orgId !== "string") {
      return res.status(400).json({ error: "orgId is required" });
    }

    const { projects, regionId } = await loomi.listProjects(orgId);
    for (const project of projects) {
      projectCache.set(project.id, project);
    }

    res.json({ projects, regionId });
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/client-brief", async (req, res) => {
  try {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
    const project = projectCache.get(projectId) || {
      id: projectId,
      name: typeof req.query.name === "string" ? req.query.name : projectId,
      workspace_name: typeof req.query.workspace === "string" ? req.query.workspace : "",
      category: typeof req.query.category === "string" ? req.query.category : "",
    };

    try {
      await glean.ensureConnected();
    } catch (err) {
      if (err.code === "NEEDS_AUTH") {
        return res.status(401).json({
          error: "Loomi authentication required",
          needsAuth: true,
          authUrl: err.authUrl || glean.authProvider.pendingAuthUrl,
          provider: "glean",
        });
      }
      throw err;
    }

    const brief = await fetchClientBrief(glean, {
      name: project.name,
      workspace: project.workspace_name,
      category: project.category,
    });
    res.json({ clientBrief: brief, glean: { connected: true } });
  } catch (err) {
    sendError(res, err, glean);
  }
});

app.get("/api/audit", async (req, res) => {
  try {
    const projectId = req.query.projectId;
    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({ error: "projectId is required" });
    }

    let project = projectCache.get(projectId);
    if (!project) {
      project = {
        id: projectId,
        name: projectId,
        category: "",
        workspace_name: "",
        url: "",
        region: typeof req.query.region === "string" ? req.query.region : null,
      };
    }

    const client = loomi.clientForProject(project);
    if (!client) {
      return res.status(401).json({ error: "No connected Loomi region for this project" });
    }

    const stream = req.query.stream === "1" || req.query.stream === "true";
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const send = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      send("progress", { step: "start", detail: "Starting audit…", percent: 1 });

      const audit = await runProjectAudit(client, project, {
        onProgress: (p) => send("progress", p),
        glean,
      });
      send("complete", audit);
      return res.end();
    }

    const audit = await runProjectAudit(client, project, { glean });
    res.json(audit);
  } catch (err) {
    if (req.query.stream === "1" || req.query.stream === "true") {
      try {
        if (err.code === "NEEDS_AUTH") {
          res.write(
            `event: audit_error\ndata: ${JSON.stringify({
              error: err.message,
              needsAuth: true,
              authUrl: err.authUrl || loomi.pendingClient?.authProvider?.pendingAuthUrl,
            })}\n\n`
          );
        } else {
          res.write(
            `event: audit_error\ndata: ${JSON.stringify({
              error: err.message || String(err),
            })}\n\n`
          );
        }
        return res.end();
      } catch {
        // fall through
      }
    }
    sendError(res, err);
  }
});

app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api") && !req.path.startsWith("/oauth")) {
    return res.sendFile(path.join(ROOT, "public", "index.html"));
  }
  return next();
});

function renderCallbackPage(ok, message = "", extra = {}) {
  const title = ok ? "Connected" : "Authorization failed";
  const body = ok
    ? extra.needsMoreAuth
      ? "One region connected. Continuing authorization for the next region…"
      : extra.message || "You can close this tab and return to the audit app."
    : `Something went wrong: ${message}`;
  const needsMoreAuth = Boolean(extra.needsMoreAuth && extra.authUrl);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Georgia, serif; background: #f3efe6; color: #1c1917; padding: 3rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #57534e; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>${body}</p>
  <script>
    if (${ok}) {
      ${
        needsMoreAuth
          ? `window.location.href = ${JSON.stringify(extra.authUrl)};`
          : `setTimeout(() => { window.location.href = "/"; }, 1200);`
      }
    }
  </script>
</body>
</html>`;
}

app.listen(PORT, BIND_HOST, () => {
  console.log(`Marketing Setup & Adoption Audit at ${APP_BASE_URL}`);
  console.log(`Listening on ${BIND_HOST}:${PORT}${onRender ? " (Render)" : ""}`);
  console.log(`MCP endpoints (${MCP_ENDPOINTS.length}):`);
  for (const url of MCP_ENDPOINTS) console.log(`  - ${url}`);
  console.log(`OAuth callback: ${REDIRECT_URL}`);
  console.log(`Glean MCP: ${GLEAN_MCP_URL}`);
  console.log(`Glean OAuth callback: ${GLEAN_REDIRECT_URL}`);
  console.log(`Token storage: ${DATA_DIR}`);
});
