/**
 * Best-effort display name from OAuth JWT claims (Loomi / Glean tokens).
 * Tokens are opaque to the UI; only decoded here server-side for greeting.
 */

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  try {
    const part = token.split(".")[1];
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function pickFromClaims(claims) {
  if (!claims || typeof claims !== "object") return null;
  const email = String(
    claims.email || claims.preferred_username || claims.upn || claims.unique_name || ""
  ).trim();
  const fullName = String(
    claims.name || claims.display_name || claims.displayName || ""
  ).trim();
  const given =
    String(claims.given_name || claims.givenName || claims.first_name || "").trim() ||
    (fullName ? fullName.split(/\s+/)[0] : "") ||
    (email.includes("@") ? email.split("@")[0].split(/[._-]/)[0] : "");
  const firstName = given
    ? given.charAt(0).toUpperCase() + given.slice(1)
    : "";
  if (!firstName && !fullName && !email) return null;
  const initials = (fullName || firstName || email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
  return {
    firstName: firstName || "there",
    name: fullName || firstName || email.split("@")[0] || "there",
    email: email || null,
    initials: initials || "BR",
  };
}

function tokensFromProvider(provider) {
  try {
    return provider?.tokens?.() || null;
  } catch {
    return null;
  }
}

/**
 * @param {{ loomi?: any, glean?: any }} clients
 */
export function resolveUserIdentity({ loomi, glean } = {}) {
  const candidates = [];

  const gleanTokens = tokensFromProvider(glean?.authProvider);
  if (gleanTokens) {
    candidates.push(gleanTokens.id_token, gleanTokens.access_token, gleanTokens.refresh_token);
  }

  const regions = loomi?.regions || [];
  for (const region of regions) {
    const tokens = tokensFromProvider(region?.client?.authProvider);
    if (tokens) {
      candidates.push(tokens.id_token, tokens.access_token);
    }
  }
  if (!regions.length && loomi?.authProvider) {
    const tokens = tokensFromProvider(loomi.authProvider);
    if (tokens) candidates.push(tokens.id_token, tokens.access_token);
  }

  for (const token of candidates) {
    const identity = pickFromClaims(decodeJwtPayload(token));
    if (identity?.firstName && identity.firstName !== "there") return identity;
    if (identity) return identity;
  }

  return {
    firstName: "there",
    name: "there",
    email: null,
    initials: "BR",
  };
}
