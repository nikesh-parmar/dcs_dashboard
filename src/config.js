import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

/**
 * Runtime config for local + Render (and similar PaaS).
 *
 * - Bind on 0.0.0.0 in cloud so the proxy can reach the process.
 * - Build OAuth callbacks from a public APP_BASE_URL (https, no port).
 * - Optionally persist tokens on a mounted DATA_DIR (Render disk).
 */
export function loadConfig(env = process.env) {
  const PORT = Number(env.PORT || 3847);
  const onRender = Boolean(env.RENDER || env.RENDER_EXTERNAL_URL);

  const BIND_HOST =
    env.BIND_HOST ||
    (onRender || env.NODE_ENV === "production" ? "0.0.0.0" : env.HOST || "localhost");

  const explicitBase = String(env.APP_BASE_URL || env.RENDER_EXTERNAL_URL || "")
    .trim()
    .replace(/\/$/, "");

  let APP_BASE_URL = explicitBase;
  if (!APP_BASE_URL) {
    const publicHost = env.HOST && env.HOST !== "0.0.0.0" ? env.HOST : "localhost";
    APP_BASE_URL = `http://${publicHost}:${PORT}`;
  }

  const DATA_DIR = path.resolve(env.DATA_DIR || path.join(ROOT, ".data"));

  return {
    PORT,
    BIND_HOST,
    APP_BASE_URL,
    DATA_DIR,
    onRender,
    REDIRECT_URL: `${APP_BASE_URL}/oauth/callback`,
    GLEAN_REDIRECT_URL: `${APP_BASE_URL}/oauth/glean/callback`,
    GLEAN_MCP_URL:
      env.GLEAN_MCP_URL || "https://bloomreach-be.glean.com/mcp/default",
  };
}
