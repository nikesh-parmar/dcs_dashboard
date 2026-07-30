# Marketing Setup & Adoption Audit

Internal Bloomreach tool that connects to **Loomi Connect** (and optionally **Glean**) via MCP, audits an Engagement project’s data setup and marketing adoption, and surfaces findings in one browser view.

## How it works

1. You run a small **local Express server** that serves the UI and talks to MCP over OAuth.
2. Click **Connect** — the app authorizes **Loomi Connect** (per region) and **Glean** in turn via browser SSO.
3. Pick an **organization** and **Engagement project**, then **Run audit**.
4. Progress streams over Server-Sent Events while the server calls Loomi tools (schemas, mapping, scenarios, EQL, samples) and Glean (client brief) in parallel where possible.
5. Results appear in three primary tabs: **Data**, **Scenarios & AI Adoption**, and **Other Checks**.

The audit is **read-only**: it does not create or edit Engagement assets. OAuth tokens stay on your machine under `.data/` so you usually only authorize once per region / Glean.

### What it uses

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ (ESM), Express 5 |
| MCP | `@modelcontextprotocol/sdk` (Streamable HTTP + OAuth) |
| Engagement data | **Loomi Connect MCP** (`eu` / `uk` / `us` / `ca` / `ap`) |
| Client context | **Bloomreach Glean MCP** (search + chat for docs / overview) |
| UI | Static `public/` (HTML, CSS, vanilla JS) |
| Config | `.env` (`dotenv`) |

Loomi calls are paced (~1 req/s per region) to respect Connect rate limits. Glean is not throttled the same way. Optional tool failures are collected in `toolErrors` without failing the whole audit.

## Prerequisites

- **Node.js 18+** (20+ recommended)
- Bloomreach account with **Loomi Connect** access
- Network access to the regional Connect endpoint(s) you need
- Permission to view the Engagement projects you want to audit
- (Optional) Glean access for client overview / documents

## Install

```bash
git clone <repo-url> loomi-data-audit
cd loomi-data-audit
cp .env.example .env
npm install
npm start
```

Open [http://localhost:3847](http://localhost:3847).

### Environment

```env
LOOMI_MCP_URLS=https://eu.connect.loomi.ai/mcp,https://uk.connect.loomi.ai/mcp
GLEAN_MCP_URL=https://bloomreach-be.glean.com/mcp/default
PORT=3847
HOST=localhost
```

| Variable | Default | Notes |
|----------|---------|-------|
| `LOOMI_MCP_URLS` | EU + UK Connect | Preferred. Comma-separated MCP endpoints |
| `LOOMI_MCP_URL` | — | Legacy single-endpoint fallback (ignored when `LOOMI_MCP_URLS` is set) |
| `GLEAN_MCP_URL` | Bloomreach Glean default | Client brief / documents |
| `PORT` | `3847` | Local app port (Render sets this automatically) |
| `HOST` | `localhost` | Used only when building the local public URL |
| `BIND_HOST` | `localhost` locally / `0.0.0.0` on Render | Listen address |
| `APP_BASE_URL` | `http://localhost:PORT` or `RENDER_EXTERNAL_URL` | Public origin for OAuth callbacks (no trailing slash) |
| `DATA_DIR` | `.data/` | OAuth token directory (use a mounted disk on Render) |

Tokens: `.data/oauth-<region>.json`, `.data/oauth-glean.json` (gitignored), or under `DATA_DIR`.

### Deploy on Render

Works alongside local use. The app auto-detects Render via `RENDER` / `RENDER_EXTERNAL_URL`.

1. Create a **Web Service** from this repo (or use `render.yaml`).
2. Build: `npm install` · Start: `npm start` · Node **20**.
3. Set env:
   - `LOOMI_MCP_URLS` — defaults to EU + UK; override if you need other regions
   - `GLEAN_MCP_URL` — optional, has a default
   - `DATA_DIR=/var/data` if you attach a disk (recommended so Connect survives redeploys)
4. Do **not** set `HOST=localhost` on Render. Leave `APP_BASE_URL` unset unless you use a custom domain (`https://your-domain.com`).
5. Open the Render URL → **Connect** → authorize Loomi (and Glean).

Notes:
- OAuth callbacks become `https://<service>.onrender.com/oauth/callback` (and `/oauth/glean/callback`).
- One service instance shares one login session (same as local). Prefer a private/team service, not a public anonymous URL.
- Long audits need a plan that won’t idle-spin mid-run; free tier may sleep.

### First-time connect

1. Click **Connect** and complete Loomi (each region) then Glean SSO when prompted.
2. Choose an **organization**, then a **project**.
3. Click **Run audit** (large projects can take several minutes — scenarios load node designs; EQL is rate-limited).

If OAuth fails, confirm `HOST`/`PORT` match the URL you opened and that your Loomi URLs match your account regions.

## What the audit covers

### Data tab
- **Overview** — customers, events (all-time / 30d), IDs, consent categories, property count
- **Identifiers** — hard/soft IDs, lowercase/trim
- **Consent** — categories, legitimate interest, mapping, sources (true/false population is not available via Loomi)
- **Customer properties** — type, source, used, PII, temporary
- **Events** — class, used, property count, 30d + all-time volumes, first seen (EQL min timestamp)
- **Data quality** — schema name vs declared type, cross-event type conflicts, sampled customer property values
- **Data expiry** — note only (expiration settings are not exposed via Loomi)
- **Data mapping** — events, customer attributes, catalogs, consents
- **Catalogs** — list catalogs (no per-catalog usage checks)
- **Imports** — placeholder / Engagement link (not listable via Loomi)
- **Findings** — rule-based severity-tagged issues from schema, mapping, and consent
- **AI recommendations (Glean)** — optional narratives that rewrite / prioritize those findings using Glean chat + related docs (does not invent new schema issues)

### Scenarios & AI Adoption tab
- Channel utilisation (live scenarios + campaign events, last 90 days)
- Rule-based adoption opportunities and Use Case Center ideas
- **AI adoption advice (Glean)** — client-specific next steps grounded in those opportunities
- Live scenarios (Automation vs BAU), active weblayers
- Top performing on-event automations (30d)
- Recommendations, predictions, autosegments, Recommendations+ heuristics

### Other Checks tab
Checklist of standard data-audit items **outside** Loomi Connect (SDK/CTD, tracking doc, Data Validation Dashboard, expirations, imports, catalog item QA, project health). Checkboxes persist per project in `localStorage`.

### Client brief (Glean)
Above the overview: short client summary, vertical, and related Documents (tracking sheets, kickoff/handover) when Glean is connected.

### Vertical use-case check
- Vertical is taken from the **Salesforce GTM mapping** via Glean (`GTM Industry`, `GTM Industry Group`, `CSM Segment`) when the account is found; text/LLM inference is only a fallback
- Rule-based vertical verification against a vertical pack (fashion, grocery, restaurants, hospitality, travel, etc.)
- Compares live scenarios / channels / AI features to vertical-expected use cases
- Optional Glean narrative for account feedback
- Glean Skill source: `glean-skills/vertical-use-case-audit/` (upload to Glean Settings → Skills)

## Architecture

| Path | Role |
|------|------|
| `src/server.js` | Express app, static UI, OAuth callbacks, `/api/*` |
| `src/config.js` | Local + Render bind/public URL / data dir |
| `src/loomi/multiClient.js` | Multi-region Loomi Connect |
| `src/loomi/client.js` | MCP client + OAuth token store |
| `src/loomi/audit.js` | Audit orchestration and payload shaping |
| `src/glean/clientBrief.js` | Glean search/chat client brief |
| `src/glean/aiInsights.js` | Glean enrichment of findings & adoption |
| `src/glean/verticalUseCases.js` | Vertical pack + use-case coverage assessment |
| `src/glean/gtmVertical.js` | Salesforce GTM vertical lookup via Glean search |
| `glean-skills/vertical-use-case-audit/` | Uploadable Glean Skill (SKILL.md) |
| `public/` | Browser UI (`index.html`, `app.js`, `styles.css`, `export-report.js`) |

### Loomi MCP tools used

**Bootstrap:** `list_cloud_organizations`, `list_projects`

**Core schema / config:** `get_project_overview`, `get_event_schema`, `get_customer_property_schema`, `get_customer_schema`, `get_mapping`, `get_consent_settings`

**Quality samples:** `list_customers`, `get_customer_properties`

**Catalogs:** `search_catalogs`

**Activation:** `search_scenarios`, `search_banners`, `search_email_campaigns`, `search_sms_campaigns`, `search_in_app_messages`, `search_recommendations`, `search_predictions`, `search_autosegments`

**Analytics:** `execute_analytics_eql` (event volumes, campaign action types, scenario performance)

### Glean MCP tools used

`search`, `chat` — client overview, vertical, and related documents.

## Local development

```bash
npm start
# or hot-reload:
npm run dev
```

Disconnect from the UI or delete `.data/oauth*.json` to force a fresh login.

After an audit, **Export HTML for Google Docs** downloads a report you can upload to Drive or paste into a Doc.

## Limitations

- Read-only — does not create or edit Engagement assets
- **Not available via Loomi:** event expirations, import job inventory, integrations/sender profiles, reliable consent true/false counts, DVD health charts (large profiles, merges, daily spikes)
- **Not automatable here:** live SDK/CTD checks (need the client website), deep catalog item field QA, tracking-doc field-by-field diff (partially assisted by Glean docs)
- Recommendation “used in templates” depends on scenario node designs / weblayer HTML; engines only referenced elsewhere may not be detected
- One-click Google Docs API export is not built yet

## Support

For Loomi Connect access or regional endpoints, use internal Bloomreach Connect / Loomi channels. For app issues, share the project name, region, and any `toolErrors` listed after the audit.
