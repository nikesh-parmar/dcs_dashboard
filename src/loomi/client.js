import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { FileOAuthClientProvider } from "./authProvider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse MCP tool call results into JSON when possible.
 * Loomi tools typically return a single text content block with JSON.
 */
function unwrapPayload(parsed) {
  if (!parsed || typeof parsed !== "object") return parsed;
  // call_tool / some list tools wrap payloads as { result: {...} }
  if (parsed.result && typeof parsed.result === "object" && !Array.isArray(parsed.result)) {
    return unwrapPayload(parsed.result);
  }
  return parsed;
}

function isToolFailure(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  if (parsed.success === false) return true;
  // Loomi includes `error: null` on success — only treat real error values as failure
  const err = parsed.error;
  return typeof err === "string" ? err.length > 0 : err != null;
}

export function parseToolResult(result) {
  if (result?.structuredContent) {
    return unwrapPayload(result.structuredContent);
  }

  const texts = (result?.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text);

  if (texts.length === 0) {
    return unwrapPayload(result);
  }

  const joined = texts.join("\n");
  try {
    return unwrapPayload(JSON.parse(joined));
  } catch {
    return { text: joined };
  }
}

export class LoomiClient {
  /**
   * @param {{ mcpUrl: string, redirectUrl: string, regionId?: string, storagePath?: string }} config
   */
  constructor({ mcpUrl, redirectUrl, regionId = null, storagePath = null }) {
    this.mcpUrl = mcpUrl;
    this.redirectUrl = redirectUrl;
    this.regionId = regionId;
    this.client = null;
    this.transport = null;
    this.connected = false;
    this._callQueue = Promise.resolve();

    this.authProvider = new FileOAuthClientProvider({
      redirectUrl,
      storagePath: storagePath || path.join(ROOT, ".data", "oauth.json"),
      clientMetadata: {
        client_name: regionId
          ? `Marketing Setup & Adoption Audit (${String(regionId).toUpperCase()})`
          : "Marketing Setup & Adoption Audit",
        redirect_uris: [redirectUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
    });
  }

  getStatus() {
    return {
      connected: this.connected,
      mcpUrl: this.mcpUrl,
      regionId: this.regionId,
      needsAuth: Boolean(this.authProvider.pendingAuthUrl),
      authUrl: this.authProvider.pendingAuthUrl,
      hasTokens: Boolean(this.authProvider.tokens()),
    };
  }

  async connect() {
    // Reuse an in-flight OAuth redirect. Re-starting auth overwrites the PKCE
    // verifier and invalidates any consent tab the user already has open.
    if (this.authProvider.pendingAuthUrl && !this.authProvider.tokens()) {
      return {
        connected: false,
        needsAuth: true,
        authUrl: this.authProvider.pendingAuthUrl,
      };
    }

    this.authProvider.clearPendingAuthUrl();
    this.client = new Client({ name: "loomi-data-audit", version: "1.0.0" });
    this.transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl), {
      authProvider: this.authProvider,
    });

    try {
      await this.client.connect(this.transport);
      this.connected = true;
      return { connected: true };
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        this.connected = false;
        return {
          connected: false,
          needsAuth: true,
          authUrl: this.authProvider.pendingAuthUrl,
        };
      }
      throw err;
    }
  }

  /**
   * Complete OAuth after browser redirect back to /oauth/callback.
   * @param {string} authorizationCode
   */
  async finishAuth(authorizationCode) {
    if (!this.transport) {
      this.transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl), {
        authProvider: this.authProvider,
      });
    }

    await this.transport.finishAuth(authorizationCode);
    this.authProvider.clearPendingAuthUrl();

    // Transport cannot be restarted; create a fresh one with saved tokens.
    this.client = new Client({ name: "loomi-data-audit", version: "1.0.0" });
    this.transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl), {
      authProvider: this.authProvider,
    });
    await this.client.connect(this.transport);
    this.connected = true;
    return { connected: true };
  }

  async disconnect() {
    try {
      await this.transport?.close?.();
    } catch {
      // ignore
    }
    this.client = null;
    this.transport = null;
    this.connected = false;
    this.authProvider.clearSession();
  }

  async ensureConnected() {
    if (this.connected && this.client) return;
    const result = await this.connect();
    if (!result.connected) {
      const error = new Error("Loomi Connect authentication required");
      error.code = "NEEDS_AUTH";
      error.authUrl = result.authUrl;
      throw error;
    }
  }

  /**
   * Rate-limited tool calls (Loomi enforces ~1 req/sec per user).
   * Glean does not need the same throttle.
   */
  async callTool(name, args = {}) {
    const run = async () => {
      await this.ensureConnected();
      if (this.regionId !== "glean") {
        await sleep(1100);
      }
      const result = await this.client.callTool({ name, arguments: args });
      if (result?.isError) {
        const parsedError = parseToolResult(result);
        const message =
          (typeof parsedError?.error === "string" && parsedError.error) ||
          parsedError?.text ||
          `Tool ${name} failed`;
        throw new Error(message);
      }
      const parsed = parseToolResult(result);
      if (isToolFailure(parsed)) {
        const message =
          typeof parsed.error === "string"
            ? parsed.error
            : parsed.error?.message || parsed.text || `Tool ${name} failed`;
        throw new Error(message);
      }
      return parsed;
    };

    const next = this._callQueue.then(run, run);
    this._callQueue = next.catch(() => {});
    return next;
  }
}
