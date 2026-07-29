import fs from "node:fs";
import path from "node:path";

/**
 * File-backed OAuth client provider for Loomi Connect MCP.
 * Tokens and client registration persist under .data/ so reconnects survive restarts.
 */
export class FileOAuthClientProvider {
  /**
   * @param {object} options
   * @param {string} options.redirectUrl
   * @param {object} options.clientMetadata
   * @param {string} options.storagePath
   * @param {(url: URL) => void} [options.onRedirect]
   */
  constructor({ redirectUrl, clientMetadata, storagePath, onRedirect }) {
    this._redirectUrl = redirectUrl;
    this._clientMetadata = clientMetadata;
    this._storagePath = storagePath;
    this._onRedirect = onRedirect ?? ((url) => console.log(`Authorize at: ${url}`));
    this._pendingAuthUrl = null;
    this._state = this._load();
  }

  get redirectUrl() {
    return this._redirectUrl;
  }

  get clientMetadata() {
    return this._clientMetadata;
  }

  get pendingAuthUrl() {
    return this._pendingAuthUrl;
  }

  clearPendingAuthUrl() {
    this._pendingAuthUrl = null;
  }

  clientInformation() {
    return this._state.clientInformation;
  }

  saveClientInformation(clientInformation) {
    this._state.clientInformation = clientInformation;
    this._save();
  }

  tokens() {
    return this._state.tokens;
  }

  saveTokens(tokens) {
    this._state.tokens = tokens;
    this._save();
  }

  redirectToAuthorization(authorizationUrl) {
    this._pendingAuthUrl = authorizationUrl.toString();
    this._onRedirect(authorizationUrl);
  }

  saveCodeVerifier(codeVerifier) {
    this._state.codeVerifier = codeVerifier;
    this._save();
  }

  codeVerifier() {
    if (!this._state.codeVerifier) {
      throw new Error("No PKCE code verifier saved");
    }
    return this._state.codeVerifier;
  }

  clearSession() {
    this._state = {};
    this._pendingAuthUrl = null;
    if (fs.existsSync(this._storagePath)) {
      fs.unlinkSync(this._storagePath);
    }
  }

  _load() {
    try {
      if (fs.existsSync(this._storagePath)) {
        return JSON.parse(fs.readFileSync(this._storagePath, "utf8"));
      }
    } catch (err) {
      console.warn("Could not load OAuth state:", err.message);
    }
    return {};
  }

  _save() {
    fs.mkdirSync(path.dirname(this._storagePath), { recursive: true });
    fs.writeFileSync(this._storagePath, JSON.stringify(this._state, null, 2));
  }
}
