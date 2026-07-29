import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LoomiClient } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

/** Default for new installs when LOOMI_MCP_URLS / LOOMI_MCP_URL are unset. */
const DEFAULT_ENDPOINTS = [
  "https://eu.connect.loomi.ai/mcp",
  "https://uk.connect.loomi.ai/mcp",
];

/**
 * Parse one or more MCP endpoints from env.
 * Prefer LOOMI_MCP_URLS (comma-separated); fall back to LOOMI_MCP_URL.
 */
export function parseMcpEndpoints(env = process.env) {
  const multi = String(env.LOOMI_MCP_URLS || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (multi.length) return [...new Set(multi)];

  const single = String(env.LOOMI_MCP_URL || "").trim();
  if (single) return [single];
  return [...DEFAULT_ENDPOINTS];
}

/** If only legacy `.data/oauth.json` exists, reuse it for the first/EU region. */
function migrateLegacyOAuth(regionId, storagePath) {
  try {
    const legacy = path.join(ROOT, ".data", "oauth.json");
    if (regionId === "eu" && fs.existsSync(legacy) && !fs.existsSync(storagePath)) {
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
      fs.copyFileSync(legacy, storagePath);
    }
  } catch {
    // ignore
  }
}

export function regionIdFromMcpUrl(mcpUrl) {
  try {
    const host = new URL(mcpUrl).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9-]+)\.connect\.loomi\.ai$/i);
    if (match) return match[1].toLowerCase();
    return host.split(".")[0] || "default";
  } catch {
    return "default";
  }
}

/**
 * Manages one LoomiClient per MCP region (separate OAuth token files).
 */
export class MultiRegionLoomi {
  /**
   * @param {{ endpoints: string[], redirectUrl: string, dataDir?: string }} config
   */
  constructor({ endpoints, redirectUrl, dataDir = null }) {
    this.redirectUrl = redirectUrl;
    this.pendingRegionId = null;
    const tokenDir = dataDir || path.join(ROOT, ".data");
    this.regions = endpoints.map((mcpUrl) => {
      const id = regionIdFromMcpUrl(mcpUrl);
      const storagePath = path.join(tokenDir, `oauth-${id}.json`);
      migrateLegacyOAuth(id, storagePath);
      const client = new LoomiClient({
        mcpUrl,
        redirectUrl,
        regionId: id,
        storagePath,
      });
      return { id, label: id.toUpperCase(), mcpUrl, client };
    });
  }

  getRegion(regionId) {
    return this.regions.find((r) => r.id === regionId) || null;
  }

  getClient(regionId) {
    return this.getRegion(regionId)?.client || null;
  }

  /** Client used for the in-flight OAuth redirect (or first region). */
  get pendingClient() {
    return this.getClient(this.pendingRegionId) || this.regions[0]?.client || null;
  }

  getStatus() {
    const regions = this.regions.map((r) => ({
      id: r.id,
      label: r.label,
      mcpUrl: r.mcpUrl,
      ...r.client.getStatus(),
    }));
    const connectedRegions = regions.filter((r) => r.connected);
    const pendingAuth =
      this.pendingClient?.authProvider?.pendingAuthUrl ||
      regions.find((r) => r.authUrl)?.authUrl ||
      null;
    return {
      connected: connectedRegions.length > 0,
      allConnected: connectedRegions.length === regions.length,
      connectedCount: connectedRegions.length,
      regionCount: regions.length,
      regions,
      mcpUrl: connectedRegions.map((r) => r.mcpUrl).join(", ") || regions.map((r) => r.mcpUrl).join(", "),
      needsAuth: Boolean(pendingAuth),
      authUrl: pendingAuth,
      hasTokens: regions.some((r) => r.hasTokens),
      pendingRegionId: this.pendingRegionId,
    };
  }

  /**
   * Connect every region. Stops and returns needsAuth when a region requires login.
   */
  async connect() {
    const results = [];
    for (const region of this.regions) {
      if (region.client.connected) {
        results.push({ id: region.id, connected: true });
        continue;
      }
      this.pendingRegionId = region.id;
      const result = await region.client.connect();
      results.push({ id: region.id, ...result });
      if (result.needsAuth) {
        return {
          connected: results.some((r) => r.connected),
          needsAuth: true,
          authUrl: result.authUrl,
          pendingRegionId: region.id,
          regions: results,
          message: `Authorize ${region.label} Loomi Connect, then return here.`,
        };
      }
    }
    this.pendingRegionId = null;
    return {
      connected: results.every((r) => r.connected),
      allConnected: true,
      regions: results,
      message: `Connected to ${results.map((r) => r.id.toUpperCase()).join(" + ")}.`,
    };
  }

  async finishAuth(authorizationCode, regionId = null) {
    const id = regionId || this.pendingRegionId || this.regions[0]?.id;
    const region = this.getRegion(id);
    if (!region) throw new Error(`Unknown region for OAuth callback: ${id}`);
    const result = await region.client.finishAuth(authorizationCode);
    this.pendingRegionId = null;
    return { ...result, regionId: region.id };
  }

  async disconnect() {
    this.pendingRegionId = null;
    for (const region of this.regions) {
      await region.client.disconnect();
    }
  }

  /**
   * List organizations across all connected regions.
   * Option values use `regionId:orgId` so projects/audits route correctly.
   */
  async listOrganizations() {
    const organizations = [];
    const errors = [];
    for (const region of this.regions) {
      if (!region.client.connected) continue;
      try {
        const result = await region.client.callTool("list_cloud_organizations");
        const orgs = result?.data ?? result ?? [];
        for (const org of Array.isArray(orgs) ? orgs : []) {
          const orgId = org.id || org._id || org.cloud_organization_id;
          organizations.push({
            ...org,
            id: orgId,
            region: region.id,
            regionLabel: region.label,
            optionValue: `${region.id}:${orgId}`,
            displayName: `${org.name || orgId} (${region.label})`,
          });
        }
      } catch (err) {
        errors.push({ region: region.id, error: err.message || String(err) });
      }
    }
    organizations.sort((a, b) =>
      String(a.displayName || a.name).localeCompare(String(b.displayName || b.name))
    );
    return { organizations, errors };
  }

  async listProjects(orgOptionValue) {
    const { regionId, orgId } = splitRegionKey(orgOptionValue);
    const region = this.getRegion(regionId);
    if (!region) throw new Error(`Unknown region: ${regionId}`);
    if (!region.client.connected) {
      const error = new Error(`Region ${region.label} is not connected`);
      error.code = "NEEDS_AUTH";
      throw error;
    }
    const result = await region.client.callTool("list_projects", {
      cloud_organization_id: orgId,
    });
    const projects = result?.data ?? result ?? [];
    const list = (Array.isArray(projects) ? projects : []).map((p) => ({
      ...p,
      region: region.id,
      regionLabel: region.label,
    }));
    return { projects: list, regionId: region.id };
  }

  /**
   * Resolve which client to use for a project audit.
   */
  clientForProject(project) {
    const regionId = project?.region || null;
    if (regionId) {
      const client = this.getClient(regionId);
      if (client?.connected) return client;
    }
    // Prefer first connected region as fallback
    const connected = this.regions.find((r) => r.client.connected);
    return connected?.client || this.regions[0]?.client || null;
  }
}

export function splitRegionKey(value) {
  const raw = String(value || "");
  const idx = raw.indexOf(":");
  if (idx > 0) {
    return { regionId: raw.slice(0, idx), orgId: raw.slice(idx + 1) };
  }
  return { regionId: null, orgId: raw };
}
