const els = {
  badge: document.getElementById("connectionBadge"),
  connectBtn: document.getElementById("connectBtn"),
  orgSelect: document.getElementById("orgSelect"),
  projectSelect: document.getElementById("projectSelect"),
  auditBtn: document.getElementById("auditBtn"),
  status: document.getElementById("statusMsg"),
  overviewSection: document.getElementById("resultsSection"),
  resultsSection: document.getElementById("resultsSection"),
  findingsSection: document.getElementById("findingsList"),
  adoptionSection: document.getElementById("adoptionList"),
  projectMeta: document.getElementById("projectMeta"),
  findingsList: document.getElementById("findingsList"),
  adoptionList: document.getElementById("adoptionList"),
  nextBestActionList: document.getElementById("nextBestActionList"),
  verticalAssessment: document.getElementById("verticalAssessment"),
  useCaseCenterList: document.getElementById("useCaseCenterList"),
  dataQualitySummary: document.getElementById("dataQualitySummary"),
  dataQualityList: document.getElementById("dataQualityList"),
  successPlanningBody: document.getElementById("successPlanningBody"),
  serviceRecEmpty: document.getElementById("serviceRecEmpty"),
  kpiData: document.getElementById("kpiData"),
  channelAdoptionSummary: document.getElementById("channelAdoptionSummary"),
  channelAdoptionNote: document.getElementById("channelAdoptionNote"),
  pillarTabs: document.getElementById("pillarTabs"),
  exportHtmlBtn: document.getElementById("exportHtmlBtn"),
  clientBriefCard: document.getElementById("clientBriefCard"),
  clientBriefTitle: document.getElementById("clientBriefTitle"),
  clientBriefVertical: document.getElementById("clientBriefVertical"),
  clientBriefOverview: document.getElementById("clientBriefOverview"),
  clientBriefBody: document.getElementById("clientBriefBody"),
  clientBriefSources: document.getElementById("clientBriefSources"),
  clientBriefAuth: document.getElementById("clientBriefAuth"),
  auditProgress: document.getElementById("auditProgress"),
  auditProgressBar: document.getElementById("auditProgressBar"),
  auditProgressLabel: document.getElementById("auditProgressLabel"),
  auditProgressPct: document.getElementById("auditProgressPct"),
  auditProgressDetail: document.getElementById("auditProgressDetail"),
};

/** @type {any} */
let auditData = null;
/** @type {any[]} */
let projects = [];

function setStatus(message, isError = false) {
  els.status.textContent = message || "";
  els.status.style.color = isError ? "#8a4b12" : "";
}

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString();
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { Accept: "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.needsAuth = data.needsAuth;
    err.authUrl = data.authUrl;
    throw err;
  }
  return data;
}

function setConnected(connected, status = null) {
  const regions = status?.regions || [];
  const connectedRegions = regions.filter((r) => r.connected);
  const loomiReady = Boolean(status?.allConnected ?? connected);
  const loomiPartial = Boolean(connected && !loomiReady && regions.length > 1);
  const gleanReady = Boolean(status?.glean?.connected);
  const allMcps = Boolean(status?.allMcpsConnected ?? (loomiReady && gleanReady));

  let loomiLabel = "Loomi —";
  if (loomiReady) {
    loomiLabel =
      regions.length > 1
        ? `Loomi (${connectedRegions.map((r) => r.label || r.id.toUpperCase()).join("+")})`
        : "Loomi ✓";
  } else if (loomiPartial) {
    loomiLabel = `Loomi ${connectedRegions.length}/${regions.length}`;
  } else if (connected) {
    loomiLabel = "Loomi ✓";
  }

  const gleanLabel = gleanReady ? "Glean ✓" : "Glean —";
  els.badge.textContent = `${loomiLabel} · ${gleanLabel}`;
  els.badge.className = `badge ${allMcps ? "ok" : "warn"}`;
  els.badge.title = allMcps
    ? "Loomi Connect and Glean connected"
    : "Click Connect to authorize remaining MCPs";

  const anyConnected = Boolean(connected || gleanReady);
  if (allMcps) {
    els.connectBtn.textContent = "Disconnect";
  } else if (anyConnected) {
    els.connectBtn.textContent = "Finish connect";
  } else {
    els.connectBtn.textContent = "Connect";
  }

  els.orgSelect.disabled = !connected;
  if (!connected) {
    els.orgSelect.innerHTML = `<option value="">Connect first</option>`;
    els.projectSelect.innerHTML = `<option value="">Select an organization</option>`;
    els.projectSelect.disabled = true;
    els.auditBtn.disabled = true;
  }
}

async function refreshStatus() {
  const status = await api("/api/status");
  setConnected(status.connected, status);
  if (status.connected) {
    await loadOrganizations();
  }
  if (status.allMcpsConnected) {
    // leave existing status unless empty
    if (!els.status.textContent) setStatus("Connected to Loomi Connect and Glean.");
  } else if (status.connected) {
    if (!status.allConnected && status.regionCount > 1) {
      setStatus(
        `Loomi ${status.connectedCount}/${status.regionCount} regions connected. Click Finish connect to continue (Loomi + Glean).`
      );
    } else if (!status.glean?.connected) {
      setStatus("Loomi connected. Click Finish connect to authorize Glean.");
    }
  } else if (status.hasTokens || status.glean?.hasTokens) {
    setStatus("Saved session found. Click Connect to resume Loomi Connect and Glean.");
  }
  return status;
}

async function connect() {
  setStatus("Connecting Loomi Connect & Glean…");
  els.connectBtn.disabled = true;
  try {
    const result = await api("/api/connect", { method: "POST" });
    if (result.needsAuth && result.authUrl) {
      const who = result.provider === "glean" ? "Glean" : "Loomi Connect";
      setStatus(result.message || `Authorize ${who} in the opened window, then return here.`);
      lastOpenedAuthUrl = result.authUrl;
      window.open(result.authUrl, "_blank", "noopener,noreferrer");
      pollUntilConnected();
      return;
    }
    const status = await api("/api/status");
    setConnected(status.connected, status);
    setStatus(result.message || "Connected to Loomi Connect and Glean.");
    if (status.connected) await loadOrganizations();
  } catch (err) {
    if (err.needsAuth && err.authUrl) {
      setStatus("Authentication required. Opening login…");
      lastOpenedAuthUrl = err.authUrl;
      window.open(err.authUrl, "_blank", "noopener,noreferrer");
      pollUntilConnected();
    } else {
      setStatus(err.message, true);
    }
  } finally {
    els.connectBtn.disabled = false;
  }
}

function hideResults() {
  if (els.resultsSection) els.resultsSection.classList.add("hidden");
  if (els.exportHtmlBtn) els.exportHtmlBtn.disabled = true;
}

function showResults() {
  if (!els.resultsSection) return;
  els.resultsSection.classList.remove("hidden");
  if (els.exportHtmlBtn) els.exportHtmlBtn.disabled = false;
  selectPillarTab("onboarding");
}

function selectPillarTab(name) {
  document.querySelectorAll(".pillar-tab").forEach((tab) => {
    const active = tab.dataset.pillar === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".pillar-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `pillar-${name}`);
  });
}

async function disconnect() {
  await api("/api/disconnect", { method: "POST" });
  setConnected(false);
  hideResults();
  setStatus("Disconnected from Loomi Connect and Glean.");
}

let authPollTimer = null;
let lastOpenedAuthUrl = null;

function pollUntilConnected() {
  if (authPollTimer) clearInterval(authPollTimer);
  let tries = 0;
  // Only poll status — do not re-POST /api/connect. Re-starting OAuth mid-login
  // overwrites the PKCE verifier and causes an authorize ↔ callback loop.
  authPollTimer = setInterval(async () => {
    tries += 1;
    try {
      const status = await api("/api/status");
      setConnected(status.connected, status);

      if (status.allMcpsConnected) {
        clearInterval(authPollTimer);
        authPollTimer = null;
        lastOpenedAuthUrl = null;
        setStatus("Connected to Loomi Connect and Glean.");
        if (status.connected) await loadOrganizations();
        return;
      }

      // After a region finishes in the callback tab, status advances. Open the
      // next auth URL at most once (callback page may already have redirected).
      const nextAuthUrl = status.authUrl || status.glean?.authUrl || null;
      if (
        nextAuthUrl &&
        nextAuthUrl !== lastOpenedAuthUrl &&
        (status.connected || status.glean?.connected)
      ) {
        lastOpenedAuthUrl = nextAuthUrl;
        const who = status.allConnected ? "Glean" : "Loomi Connect";
        setStatus(`Authorize ${who} in the opened window, then return here.`);
        window.open(nextAuthUrl, "_blank", "noopener,noreferrer");
      } else if (status.connected && !status.glean?.connected) {
        setStatus("Loomi connected — waiting for Glean authorization…");
      } else if (status.connected && !status.allConnected) {
        setStatus(
          `Loomi ${status.connectedCount}/${status.regionCount} regions — finish the next login window…`
        );
      }

      if (tries > 90) {
        clearInterval(authPollTimer);
        authPollTimer = null;
        setStatus("Still waiting for auth. Click Finish connect after signing in.", true);
      }
    } catch {
      // keep polling
    }
  }, 2000);
}

async function loadOrganizations() {
  setStatus("Loading organizations across regions…");
  const { organizations, errors } = await api("/api/organizations");
  els.orgSelect.innerHTML =
    `<option value="">Select organization</option>` +
    organizations
      .map(
        (org) =>
          `<option value="${escapeHtml(org.optionValue || org.id)}">${escapeHtml(
            org.displayName || org.name
          )}</option>`
      )
      .join("");
  els.orgSelect.disabled = false;
  let msg = organizations.length
    ? `${organizations.length} organizations loaded.`
    : "No organizations found.";
  if (Array.isArray(errors) && errors.length) {
    msg += ` (${errors.map((e) => `${e.region}: ${e.error}`).join("; ")})`;
  }
  setStatus(msg, Boolean(errors?.length) && !organizations.length);
}

async function loadProjects(orgId) {
  els.projectSelect.disabled = true;
  els.auditBtn.disabled = true;
  if (!orgId) {
    els.projectSelect.innerHTML = `<option value="">Select an organization</option>`;
    return;
  }

  setStatus("Loading projects…");
  const data = await api(`/api/projects?orgId=${encodeURIComponent(orgId)}`);
  projects = data.projects || [];
  els.projectSelect.innerHTML =
    `<option value="">Select project</option>` +
    projects
      .map(
        (p) =>
          `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(
            p.regionLabel || p.region || ""
          )}${p.regionLabel || p.region ? " · " : ""}${escapeHtml(p.category || "n/a")} · ${escapeHtml(
            p.workspace_name || ""
          )})</option>`
      )
      .join("");
  els.projectSelect.disabled = false;
  setStatus(`${projects.length} projects loaded.`);
}

async function runAudit() {
  const projectId = els.projectSelect.value;
  if (!projectId) return;

  els.auditBtn.disabled = true;
  setStatus("Loading project dashboard…");
  hideResults();
  showAuditProgress(true, { detail: "Starting…", percent: 1 });

  try {
    auditData = await runAuditWithProgress(projectId);
    renderAudit(auditData);
    setStatus(`Dashboard ready for ${auditData.project.name}.`);
  } catch (err) {
    if (err.needsAuth && err.authUrl) {
      setStatus("Session expired. Re-authenticating…", true);
      window.open(err.authUrl, "_blank", "noopener,noreferrer");
      pollUntilConnected();
    } else {
      setStatus(err.message, true);
    }
  } finally {
    showAuditProgress(false);
    els.auditBtn.disabled = !els.projectSelect.value;
  }
}

function showAuditProgress(visible, update = null) {
  if (!els.auditProgress) return;
  els.auditProgress.classList.toggle("hidden", !visible);
  if (update) updateAuditProgress(update);
}

function updateAuditProgress({ detail, percent, step } = {}) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  if (els.auditProgressBar) els.auditProgressBar.style.width = `${pct}%`;
  if (els.auditProgressPct) els.auditProgressPct.textContent = `${Math.round(pct)}%`;
  if (els.auditProgressDetail && detail) els.auditProgressDetail.textContent = detail;
  if (els.auditProgressLabel) {
    els.auditProgressLabel.textContent =
      step === "done" ? "Dashboard ready" : "Loading project dashboard…";
  }
}

function runAuditWithProgress(projectId) {
  return new Promise((resolve, reject) => {
    const url = `/api/audit?projectId=${encodeURIComponent(projectId)}&stream=1`;
    const es = new EventSource(url);
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      es.close();
      fn(value);
    };

    es.addEventListener("progress", (event) => {
      try {
        updateAuditProgress(JSON.parse(event.data));
      } catch {
        // ignore malformed progress
      }
    });

    es.addEventListener("complete", (event) => {
      try {
        finish(resolve, JSON.parse(event.data));
      } catch (err) {
        finish(reject, err);
      }
    });

    es.addEventListener("audit_error", (event) => {
      try {
        const payload = JSON.parse(event.data);
        const err = new Error(payload.error || "Audit failed");
        err.needsAuth = payload.needsAuth;
        err.authUrl = payload.authUrl;
        finish(reject, err);
      } catch (err) {
        finish(reject, err);
      }
    });

    es.onerror = () => {
      if (!settled && es.readyState === EventSource.CLOSED) {
        finish(reject, new Error("Audit stream closed unexpectedly"));
      }
    };
  });
}

function renderClientBrief(data) {
  const card = els.clientBriefCard;
  if (!card) return;

  const brief = data.clientBrief;
  const glean = data.glean || {};
  const title = data.project?.name || data.project?.workspace || "Client";

  card.classList.remove("hidden");
  if (els.clientBriefTitle) els.clientBriefTitle.textContent = title;

  // Header Connect is the only MCP auth entry point — never prompt Connect here when Glean is up
  const gleanConnected = Boolean(glean.connected && !glean.needsAuth);

  const hasStructured =
    brief &&
    (brief.summary ||
      brief.overview ||
      brief.vertical ||
      (brief.trackingDocs || []).length ||
      (brief.implementation || []).length ||
      (brief.integrations || []).length ||
      (brief.gaps || []).length);

  if (els.clientBriefAuth) els.clientBriefAuth.classList.add("hidden");

  if (hasStructured || gleanConnected) {
    if (els.clientBriefVertical) {
      if (brief?.vertical) {
        els.clientBriefVertical.textContent = brief.vertical;
        els.clientBriefVertical.classList.remove("hidden");
      } else {
        els.clientBriefVertical.classList.add("hidden");
      }
    }

    if (els.clientBriefOverview) {
      const summary = brief?.summary || brief?.overview || "";
      if (summary) {
        els.clientBriefOverview.innerHTML = linkifyText(summary);
        els.clientBriefOverview.classList.remove("hidden");
      } else if (gleanConnected && !hasStructured) {
        els.clientBriefOverview.textContent =
          "Glean is connected but no documents with this client name in the title were found.";
        els.clientBriefOverview.classList.remove("hidden");
      } else {
        els.clientBriefOverview.innerHTML = "";
        els.clientBriefOverview.classList.add("hidden");
      }
    }

    if (els.clientBriefBody) {
      const blocks = [];
      const docs = brief?.trackingDocs || [];
      if (docs.length) {
        blocks.push(`
          <section class="client-brief-section">
            <h3>Documents</h3>
            <ul>${docs
              .map((doc) => {
                const label = escapeHtml(doc.title || "Document");
                const link = doc.url
                  ? `<a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
                  : label;
                const summary = doc.summary
                  ? `<span class="muted"> — ${linkifyText(doc.summary)}</span>`
                  : "";
                return `<li>${link}${summary}</li>`;
              })
              .join("")}</ul>
          </section>`);
      }

      const impl = brief?.implementation || [];
      if (impl.length) {
        blocks.push(`
          <section class="client-brief-section">
            <h3>Implementation</h3>
            <ul>${impl.map((item) => `<li>${linkifyText(item)}</li>`).join("")}</ul>
          </section>`);
      }

      const integrations = brief?.integrations || [];
      if (integrations.length) {
        blocks.push(`
          <section class="client-brief-section">
            <h3>Integrations</h3>
            <ul>${integrations
              .map((item) => {
                const name = escapeHtml(item.name || "Integration");
                const detail = item.detail
                  ? `<span class="muted"> — ${linkifyText(item.detail)}</span>`
                  : "";
                return `<li><strong>${name}</strong>${detail}</li>`;
              })
              .join("")}</ul>
          </section>`);
      }

      const gaps = brief?.gaps || [];
      if (gaps.length) {
        blocks.push(`
          <section class="client-brief-section">
            <h3>Not confirmed in Glean</h3>
            <ul>${gaps.map((item) => `<li>${linkifyText(item)}</li>`).join("")}</ul>
          </section>`);
      }

      if (blocks.length) {
        els.clientBriefBody.innerHTML = blocks.join("");
        els.clientBriefBody.classList.remove("hidden");
      } else {
        els.clientBriefBody.innerHTML = "";
        els.clientBriefBody.classList.add("hidden");
      }
    }

    if (els.clientBriefSources) {
      const sources = [
        ...(brief?.sources || []),
        ...(brief?.trackingDocs || []),
      ].filter((s, index, arr) => s.url && arr.findIndex((x) => x.url === s.url) === index);
      els.clientBriefSources.innerHTML = sources.length
        ? `Sources: ${sources
            .slice(0, 5)
            .map(
              (s) =>
                `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                  s.title || "Source"
                )}</a>`
            )
            .join(" · ")}`
        : gleanConnected
          ? `<span class="muted">Sourced via Glean</span>`
          : "";
    }
    return;
  }

  if (els.clientBriefOverview) {
    els.clientBriefOverview.textContent = "";
    els.clientBriefOverview.classList.add("hidden");
  }
  if (els.clientBriefBody) {
    els.clientBriefBody.innerHTML = "";
    els.clientBriefBody.classList.add("hidden");
  }
  if (els.clientBriefVertical) els.clientBriefVertical.classList.add("hidden");
  if (els.clientBriefSources) els.clientBriefSources.innerHTML = "";

  // Only show auth CTA when Glean truly needs login — always via header Connect
  if (els.clientBriefAuth) {
    els.clientBriefAuth.classList.remove("hidden");
    const copy = els.clientBriefAuth.querySelector("p");
    if (copy) {
      copy.innerHTML =
        "Glean is not connected. Use <strong>Connect</strong> in the header to authorize Loomi Connect and Glean.";
    }
  }
}

async function connectGlean() {
  // Same header Connect flow — authorizes remaining MCPs (incl. Glean)
  await connect();
  if (auditData?.project?.id) {
    await refreshClientBrief();
  }
}

async function refreshClientBrief() {
  if (!auditData?.project?.id) return;
  const project = auditData.project;
  const qs = new URLSearchParams({
    projectId: project.id,
    name: project.name || "",
    workspace: project.workspace || "",
    category: project.category || "",
  });
  try {
    const data = await api(`/api/client-brief?${qs}`);
    auditData.clientBrief = data.clientBrief;
    auditData.glean = data.glean || { connected: true };
    renderClientBrief(auditData);
    setStatus("Client overview updated from Glean.");
  } catch (err) {
    if (err.needsAuth && err.authUrl) {
      auditData.glean = { needsAuth: true, authUrl: err.authUrl, connected: false };
      renderClientBrief(auditData);
      window.open(err.authUrl, "_blank", "noopener,noreferrer");
      setStatus("Authorize Glean, then click Connect Glean again.");
      return;
    }
    setStatus(err.message || String(err), true);
  }
}

function renderAudit(data) {
  const o = data.overview || {};
  if (els.projectMeta) {
    els.projectMeta.innerHTML = [
      data.project.name,
      data.project.workspace,
      data.project.category,
      data.project.url
        ? `<a href="${escapeHtml(data.project.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.project.url)}</a>`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  renderKpiSection(els.kpiData, [
    ["Customers", o.totalCustomers],
    [
      "Events — all time / 30d",
      `${formatNumber(o.totalEvents)} / ${formatNumber(o.events30d)}`,
    ],
    ["Event types", o.eventTypeCount ?? (data.events || []).length],
    [
      "Attributes",
      `${formatNumber(o.attributeCount)}${o.maxCustomerProperties ? ` / ${formatNumber(o.maxCustomerProperties)}` : ""}`,
    ],
    ["Consent categories", o.consentCategoryCount],
    ["IDs", `${o.hardIdCount ?? 0} hard / ${o.softIdCount ?? 0} soft`],
  ]);

  renderChannelAdoption(o);
  renderFindings(data.findings || []);
  renderAdoptionOpportunities(filterGapAnalysisItems(data.adoptionOpportunities || []));
  renderNextBestActions(data.aiInsights || null, data.adoptionOpportunities || []);
  renderVerticalAssessment(data.verticalAssessment || null);
  renderUseCaseCenter(data.adoptionOpportunities || [], data.scenarios || [], data.verticalAssessment || null);
  renderDataQuality(data.dataQuality || {});
  renderSuccessPlanning(data);

  if (els.serviceRecEmpty && els.useCaseCenterList) {
    const hasCards = els.useCaseCenterList.children.length > 0;
    els.serviceRecEmpty.classList.toggle("hidden", hasCards);
  }

  if (Array.isArray(data.toolErrors) && data.toolErrors.length) {
    setStatus(
      `Dashboard ready for ${data.project.name} (some optional tools failed: ${data.toolErrors.map((e) => e.tool).join(", ")})`,
      true
    );
  }

  showResults();
}

function filterGapAnalysisItems(items = []) {
  return items.filter((item) => {
    const hay = `${item.area || ""} ${item.title || ""} ${item.detail || ""} ${item.action || ""}`.toLowerCase();
    if (/weblayer|web layer|banner/.test(hay)) return false;
    if (/recommendation engine|recommendations\+|recs\+|product recommendations|include product recommendations|power abandon browse with product recommendations|upgrade welcome recommendations/.test(hay)) {
      return false;
    }
    return true;
  });
}

function renderChannelAdoption(overview = {}) {
  const root = els.channelAdoptionSummary;
  if (!root) return;
  const channels = overview.channels || [];
  renderKpiSection(
    root,
    [
      ["Email", channelPill(channels, "Email")],
      ["SMS", channelPill(channels, "SMS")],
      ["WhatsApp", channelPill(channels, "WhatsApp")],
      ["Push", channelPill(channels, "Push")],
      ["Weblayer", channelPill(channels, "Weblayer")],
      ["In App", channelPill(channels, "In App")],
    ],
    { compact: true }
  );

  const used = Array.isArray(overview.channelsUsed)
    ? overview.channelsUsed
    : channels.filter((c) => c.used || c.status === "utilised").map((c) => c.name);
  const unused = Array.isArray(overview.channelsAvailableUnused)
    ? overview.channelsAvailableUnused
    : channels.filter((c) => !(c.used || c.status === "utilised")).map((c) => c.name);

  if (els.channelAdoptionNote) {
    const parts = [];
    if (used.length) parts.push(`Utilised: ${used.join(", ")}`);
    if (unused.length) parts.push(`Not utilised: ${unused.join(", ")}`);
    els.channelAdoptionNote.textContent = parts.join(" · ") || "No channel usage signals returned.";
  }
}

function renderNextBestActions(ai, adoptionOpportunities = []) {
  const root = els.nextBestActionList;
  if (!root) return;

  const gleanItems = [];
  if (ai?.available) {
    for (const item of ai.adoption || []) {
      gleanItems.push({
        source: "Glean",
        title: item.title || item.basedOn || "Scenario recommendation",
        basedOn: item.basedOn,
        narrative: item.narrative,
        action: item.action,
        scenario: item.scenario,
      });
    }
    for (const item of ai.extras || []) {
      const hay = `${item.area || ""} ${item.title || ""} ${item.detail || ""}`;
      if (/scenario|journey|automation|use case|campaign|abandon|welcome|win.?back|reactivat/i.test(hay)) {
        gleanItems.push({
          source: "Glean",
          title: item.title || "Scenario recommendation",
          basedOn: item.area,
          narrative: item.detail || item.rationale,
          action: item.action,
        });
      }
    }
  }

  const fallback = (adoptionOpportunities || [])
    .filter((item) => {
      const hay = `${item.area || ""} ${item.title || ""}`.toLowerCase();
      return !/weblayer|web layer/.test(hay);
    })
    .map((item) => ({
      source: "Audit",
      title: item.title,
      basedOn: item.scenario || item.area,
      narrative: item.detail,
      action: item.action,
      scenario: item.scenario,
    }));

  const seen = new Set();
  const top = [];
  for (const item of [...gleanItems, ...fallback]) {
    const key = String(item.title || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    top.push(item);
    if (top.length >= 5) break;
  }

  if (!top.length) {
    root.innerHTML = `<p class="muted ai-insights-empty">${escapeHtml(
      ai?.error ||
        (ai?.needsAuth
          ? "Glean authentication required — use Connect in the header."
          : "No high-value scenario recommendations yet. Connect Glean and reload the dashboard.")
    )}</p>`;
    return;
  }

  root.innerHTML = top
    .map(
      (item, index) => `
      <article class="ai-insight-card nba-card">
        <span class="ai-insight-badge">${escapeHtml(item.source)} · #${index + 1}</span>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          ${
            item.scenario || item.basedOn
              ? `<p class="muted ai-insight-based">${escapeHtml(
                  item.scenario
                    ? `Scenario: ${item.scenario}`
                    : `Based on: ${item.basedOn}`
                )}</p>`
              : ""
          }
          ${item.narrative ? `<p>${escapeHtml(item.narrative)}</p>` : ""}
          ${item.action ? `<p><strong>Next:</strong> ${escapeHtml(item.action)}</p>` : ""}
        </div>
      </article>`
    )
    .join("");
}

function renderSuccessPlanning(data) {
  const root = els.successPlanningBody;
  if (!root) return;
  const brief = data.clientBrief || {};
  const vertical = data.verticalAssessment || {};
  const overview = brief.overview || data.overview || {};
  const parts = [];

  if (brief.overview || brief.summary) {
    parts.push(`<p>${escapeHtml(brief.overview || brief.summary)}</p>`);
  }
  if (vertical.summary || vertical.headline) {
    parts.push(`<p><strong>Vertical focus:</strong> ${escapeHtml(vertical.summary || vertical.headline)}</p>`);
  }
  if (overview.totalCustomers != null || overview.events30d != null) {
    parts.push(
      `<p class="muted">${formatNumber(overview.totalCustomers)} customers · ${formatNumber(overview.events30d)} events / 30d</p>`
    );
  }
  if (!parts.length) {
    root.innerHTML = `<p class="muted">No success-planning context yet. Connect Glean and re-run the audit for a client brief.</p>`;
    return;
  }
  root.innerHTML = parts.join("");
}

function renderFindings(findings) {
  if (!els.findingsList) return;
  if (!findings.length) {
    els.findingsList.innerHTML = `<div class="finding"><span class="finding-sev low">ok</span><div><h3>No automatic issues flagged</h3><p>Schema, mapping, and consent look within expected baselines.</p></div></div>`;
    return;
  }

  els.findingsList.innerHTML = findings
    .map(
      (f) => `
      <article class="finding">
        <span class="finding-sev ${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span>
        <div>
          <div class="area-tag">${escapeHtml(f.area)}</div>
          <h3>${escapeHtml(f.title)}</h3>
          ${f.detail ? `<p>${escapeHtml(f.detail)}</p>` : ""}
          ${f.recommendation ? `<p><strong>Next:</strong> ${escapeHtml(f.recommendation)}</p>` : ""}
        </div>
      </article>`
    )
    .join("");
}

function renderAdoptionOpportunities(items) {
  if (!els.adoptionList) return;
  if (!items.length) {
    els.adoptionList.innerHTML = `<article class="adoption-card">
      <div class="adoption-badges">
        <span class="adoption-impact low">ok</span>
      </div>
      <div>
        <h3>No major adoption gaps flagged</h3>
        <p>Live scenarios already look well covered for channels and AI features based on current signals.</p>
      </div>
    </article>`;
    return;
  }

  els.adoptionList.innerHTML = items
    .map((item) => {
      const impact = item.impact || "medium";
      const effort = item.effort || "medium";
      return `
      <article class="adoption-card">
        <div class="adoption-badges">
          <span class="adoption-metric impact-${escapeHtml(impact)}">
            <span class="metric-label">Impact</span>
            <span class="metric-value">${escapeHtml(impact)}</span>
          </span>
          <span class="adoption-metric effort-${escapeHtml(effort)}">
            <span class="metric-label">Effort</span>
            <span class="metric-value">${escapeHtml(effort)}</span>
          </span>
        </div>
        <div>
          <div class="area-tag">${escapeHtml(item.area || "Adoption")}</div>
          <h3>${escapeHtml(item.title)}</h3>
          ${item.scenario ? `<p class="adoption-scenario">Scenario: <strong>${escapeHtml(item.scenario)}</strong></p>` : ""}
          ${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}
          ${item.action ? `<p><strong>Adopt:</strong> ${escapeHtml(item.action)}</p>` : ""}
        </div>
      </article>`;
    })
    .join("");
}

function renderAiInsights(ai) {
  const findingsEl = els.findingsAiList;
  const adoptionEl = els.adoptionAiList;
  if (!findingsEl && !adoptionEl) return;

  const emptyMsg = (reason) =>
    `<p class="muted ai-insights-empty">${escapeHtml(
      reason || "Connect Glean via Connect in the header to generate AI recommendations."
    )}</p>`;

  if (!ai || !ai.available) {
    const reason =
      ai?.error ||
      (ai?.needsAuth
        ? "Glean authentication required — use Connect in the header."
        : null);
    if (findingsEl) findingsEl.innerHTML = emptyMsg(reason);
    if (adoptionEl) adoptionEl.innerHTML = emptyMsg(reason);
    return;
  }

  const summaryHtml = ai.summary
    ? `<p class="ai-insights-summary">${escapeHtml(ai.summary)}</p>`
    : "";

  const sourcesHtml =
    Array.isArray(ai.sources) && ai.sources.length
      ? `<p class="ai-insights-sources muted">Sources: ${ai.sources
          .map((s) =>
            s.url
              ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                  s.title || s.url
                )}</a>`
              : escapeHtml(s.title || "")
          )
          .join(" · ")}</p>`
      : "";

  if (findingsEl) {
    const items = Array.isArray(ai.findings) ? ai.findings : [];
    const extras = (Array.isArray(ai.extras) ? ai.extras : []).filter((e) =>
      /data|schema|mapping|consent|quality|event|propert/i.test(`${e.area} ${e.title}`)
    );
    if (!items.length && !extras.length && !ai.summary) {
      findingsEl.innerHTML = emptyMsg("No AI finding narratives returned for this audit.");
    } else {
      findingsEl.innerHTML =
        summaryHtml +
        items
          .map(
            (item) => `
        <article class="ai-insight-card">
          <span class="ai-insight-badge">Glean</span>
          <div>
            <h3>${escapeHtml(item.title || item.basedOn || "Recommendation")}</h3>
            ${
              item.basedOn && item.basedOn !== item.title
                ? `<p class="muted ai-insight-based">Based on: ${escapeHtml(item.basedOn)}</p>`
                : ""
            }
            ${item.narrative ? `<p>${escapeHtml(item.narrative)}</p>` : ""}
            ${item.action ? `<p><strong>Next:</strong> ${escapeHtml(item.action)}</p>` : ""}
          </div>
        </article>`
          )
          .join("") +
        extras
          .map(
            (item) => `
        <article class="ai-insight-card ai-insight-extra">
          <span class="ai-insight-badge">Extra</span>
          <div>
            <div class="area-tag">${escapeHtml(item.area || "Suggestion")}</div>
            <h3>${escapeHtml(item.title)}</h3>
            ${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}
            ${item.rationale ? `<p class="muted">${escapeHtml(item.rationale)}</p>` : ""}
          </div>
        </article>`
          )
          .join("") +
        sourcesHtml;
    }
  }

  if (adoptionEl) {
    const items = Array.isArray(ai.adoption) ? ai.adoption : [];
    const extras = (Array.isArray(ai.extras) ? ai.extras : []).filter(
      (e) => !/data|schema|mapping|consent|quality|event|propert/i.test(`${e.area} ${e.title}`)
    );
    if (!items.length && !extras.length) {
      adoptionEl.innerHTML = emptyMsg(
        ai.summary
          ? "See the summary under Data findings AI recommendations."
          : "No AI adoption narratives returned for this audit."
      );
    } else {
      adoptionEl.innerHTML =
        items
          .map(
            (item) => `
        <article class="ai-insight-card">
          <span class="ai-insight-badge">Glean</span>
          <div>
            <h3>${escapeHtml(item.title || item.basedOn || "Adoption advice")}</h3>
            ${
              item.basedOn && item.basedOn !== item.title
                ? `<p class="muted ai-insight-based">Based on: ${escapeHtml(item.basedOn)}</p>`
                : ""
            }
            ${item.narrative ? `<p>${escapeHtml(item.narrative)}</p>` : ""}
            ${item.action ? `<p><strong>Adopt:</strong> ${escapeHtml(item.action)}</p>` : ""}
          </div>
        </article>`
          )
          .join("") +
        extras
          .map(
            (item) => `
        <article class="ai-insight-card ai-insight-extra">
          <span class="ai-insight-badge">Extra</span>
          <div>
            <div class="area-tag">${escapeHtml(item.area || "Suggestion")}</div>
            <h3>${escapeHtml(item.title)}</h3>
            ${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}
            ${item.rationale ? `<p class="muted">${escapeHtml(item.rationale)}</p>` : ""}
          </div>
        </article>`
          )
          .join("");
    }
  }
}

function renderWeblayersTable(rows = [], summary = {}) {
  const countEl = els.weblayersCount || document.getElementById("weblayersCount");
  const tbody = document.querySelector("#weblayersTable tbody");
  if (!tbody) return;

  if (countEl) {
    countEl.textContent =
      `${rows.length} active` +
      (summary.total != null ? ` / ${summary.total} total` : "");
  }

  tbody.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td><span class="pill yes">${escapeHtml(row.status || "active")}</span></td>
        <td>${escapeHtml(formatLastUpdated(row.edited))}</td>
      </tr>`
        )
        .join("")
    : emptyTable(3, "No active weblayers found");
}

/** Curated Bloomreach Use Case Center templates (docs + in-product UCC). */
const USE_CASE_CENTER = [
  {
    id: "welcome",
    title: "Welcome flow",
    goal: "Onboarding",
    tags: ["welcome", "email"],
    url: "https://documentation.bloomreach.com/engagement/docs/welcome-flow",
  },
  {
    id: "abandon-cart-personalized",
    title: "Personalized abandoned cart email",
    goal: "Cart recovery",
    tags: ["abandon", "cart", "email"],
    url: "https://documentation.bloomreach.com/engagement/docs/personalized-abandoned-cart-email",
  },
  {
    id: "abandon-cart-recs",
    title: "Abandoned cart email with recommendations",
    goal: "Cart recovery",
    tags: ["abandon", "cart", "recommendations"],
    url: "https://documentation.bloomreach.com/engagement/docs/abandoned-cart-email-with-recommendations",
  },
  {
    id: "abandon-cart-omni",
    title: "Omnichannel abandoned cart flow",
    goal: "Cart recovery",
    tags: ["abandon", "cart", "sms", "push", "email"],
    url: "https://documentation.bloomreach.com/engagement/docs/omnichannel-abandoned-cart-flow",
  },
  {
    id: "abandon-cart-banner",
    title: "Abandoned cart banner",
    goal: "On-site recovery",
    tags: ["abandon", "cart", "weblayer", "banner"],
    url: "https://documentation.bloomreach.com/engagement/docs/abandoned-cart-banner",
  },
  {
    id: "abandon-browse-email",
    title: "Abandoned browse email",
    goal: "Browse recovery",
    tags: ["abandon", "browse", "email"],
    url: "https://documentation.bloomreach.com/engagement/docs/abandoned-browse-email",
  },
  {
    id: "abandon-browse-sms",
    title: "Abandoned browse SMS",
    goal: "Browse recovery",
    tags: ["abandon", "browse", "sms"],
    url: "https://documentation.bloomreach.com/engagement/docs/abandoned-browse-sms",
  },
  {
    id: "birthday",
    title: "Birthday campaign",
    goal: "Lifecycle",
    tags: ["birthday", "email"],
    url: "https://documentation.bloomreach.com/engagement/docs/birthday-campaign",
  },
  {
    id: "birthday-banner",
    title: "Birthday reminder banner",
    goal: "On-site",
    tags: ["birthday", "weblayer", "banner"],
    url: "https://documentation.bloomreach.com/engagement/docs/birthday-reminder-banner",
  },
  {
    id: "winback",
    title: "RFM omnichannel winback",
    goal: "Reactivation",
    tags: ["reactivat", "winback", "email", "sms"],
    url: "https://documentation.bloomreach.com/engagement/docs/rfm-omnichannel-winback-campaign",
  },
  {
    id: "reengagement-ai",
    title: "Reengagement with Loomi AI",
    goal: "Reactivation",
    tags: ["reactivat", "ai", "contextual"],
    url: "https://documentation.bloomreach.com/engagement/docs/reengagement-with-loomi-ai",
  },
  {
    id: "social-proof",
    title: "Location-based social proof banner",
    goal: "On-site conversion",
    tags: ["banner", "weblayer", "social"],
    url: "https://documentation.bloomreach.com/engagement/docs/location-based-social-proof-banner",
  },
];

function renderVerticalAssessment(assessment) {
  const el = els.verticalAssessment;
  if (!el) return;
  if (!assessment?.available) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }

  const vertical = assessment.vertical || {};
  const gaps = Array.isArray(assessment.topGaps) ? assessment.topGaps : [];
  const useCases = Array.isArray(assessment.useCases) ? assessment.useCases : [];

  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="vertical-assessment-head">
      <h3>Vertical use-case check</h3>
      <span class="vertical-confidence conf-${escapeHtml(vertical.confidence || "low")}">${escapeHtml(
        vertical.confidence || "low"
      )} confidence</span>
    </div>
    <p class="vertical-assessment-summary">${escapeHtml(assessment.coverageSummary || "")}</p>
    ${
      assessment.aiNarrative
        ? `<p class="vertical-assessment-narrative">${escapeHtml(assessment.aiNarrative)}</p>`
        : ""
    }
    ${
      vertical.rationale
        ? `<p class="muted">Vertical: <strong>${escapeHtml(vertical.label || assessment.packLabel || "")}</strong> — ${escapeHtml(
            vertical.rationale
          )}</p>`
        : ""
    }
    <div class="vertical-usecase-grid">
      ${useCases
        .map(
          (uc) => `
        <article class="vertical-usecase status-${escapeHtml(uc.status)}">
          <span class="vertical-usecase-status">${escapeHtml(uc.status)}</span>
          <strong>${escapeHtml(uc.title)}</strong>
          <span class="muted">${escapeHtml(uc.priority)} priority</span>
        </article>`
        )
        .join("")}
    </div>
    ${
      gaps.length
        ? `<div class="vertical-gaps">
            <h4>Top gaps for feedback</h4>
            <ul>${gaps
              .map(
                (g) => `<li>
                  <strong>${escapeHtml(g.title)}</strong>
                  ${g.whyItMatters ? ` — ${escapeHtml(g.whyItMatters)}` : ""}
                  ${g.adopt ? `<br/><em>Adopt:</em> ${escapeHtml(g.adopt)}` : ""}
                </li>`
              )
              .join("")}</ul>
          </div>`
        : ""
    }
    <p class="muted vertical-assessment-source">Source: ${escapeHtml(assessment.source || "rules")}</p>
  `;
}

function renderUseCaseCenter(adoptionItems = [], scenarios = [], verticalAssessment = null) {
  if (!els.useCaseCenterList) return;

  const haystack = [
    ...adoptionItems.map((i) => `${i.area || ""} ${i.title || ""} ${i.detail || ""} ${i.action || ""}`),
    ...scenarios.map((s) => `${s.name || ""} ${(s.channels || []).join(" ")}`),
    verticalAssessment?.packLabel || "",
    ...(verticalAssessment?.topGaps || []).map((g) => g.title || ""),
  ]
    .join(" ")
    .toLowerCase();

  const scored = USE_CASE_CENTER.map((uc) => {
    let score = 1;
    for (const tag of uc.tags) {
      if (haystack.includes(tag)) score += 2;
    }
    if (/abandon|cart|browse|welcome|winback|reactiv|birthday|sms|push|recommend/i.test(haystack)) {
      if (uc.tags.some((t) => haystack.includes(t))) score += 1;
    }
    // Boost UCC ideas that map to vertical gaps
    for (const gap of verticalAssessment?.topGaps || []) {
      const g = String(gap.title || "").toLowerCase();
      if (uc.tags.some((t) => g.includes(t) || t.includes(g.split(" ")[0]))) score += 3;
    }
    return { ...uc, score };
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  // Show top relevant first, then fill to a stable set of essentials
  const picked = [];
  const seen = new Set();
  for (const uc of scored) {
    if (picked.length >= 8) break;
    if (seen.has(uc.id)) continue;
    seen.add(uc.id);
    picked.push(uc);
  }

  els.useCaseCenterList.innerHTML = picked
    .map(
      (uc) => `
    <a class="usecase-card" href="${escapeHtml(uc.url)}" target="_blank" rel="noopener noreferrer">
      <span class="usecase-goal">${escapeHtml(uc.goal)}</span>
      <strong>${escapeHtml(uc.title)}</strong>
      <span class="usecase-link">Open docs →</span>
    </a>`
    )
    .join("");
}

function pill(yes) {
  return `<span class="pill ${yes ? "yes" : "no"}">${yes ? "yes" : "no"}</span>`;
}

function emptyTable(colspan, message) {
  return `<tr class="empty-row"><td colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
}

function renderIdentifiersTable(rows) {
  els.identifiersCount.textContent = `${rows.length}`;
  document.querySelector("#identifiersTable tbody").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
      <tr>
        <td><code>${escapeHtml(row.id)}</code></td>
        <td>${escapeHtml(row.type)}</td>
        <td>${pill(row.transformLowercase)}</td>
        <td>${pill(row.transformTrim)}</td>
      </tr>`
        )
        .join("")
    : emptyTable(4, "No identifiers returned");
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function renderConsentsTable(rows) {
  els.consentsCount.textContent = `${rows.length}`;
  document.querySelector("#consentsTable tbody").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
      <tr>
        <td><code>${escapeHtml(row.id)}</code></td>
        <td>${escapeHtml(row.name)}</td>
        <td>${pill(row.legitimateInterest)}</td>
        <td>${escapeHtml(row.mappedStandard || "—")}</td>
        <td>${escapeHtml(row.sources || "—")}</td>
      </tr>`
        )
        .join("")
    : emptyTable(5, "No consent categories returned");
}

let eventsSort = { key: "eventCount30", dir: "desc" };

function getSelectedEventClasses() {
  const classes = [];
  if (document.getElementById("eventsClassSystem")?.checked) classes.push("system");
  if (document.getElementById("eventsClassCommerce")?.checked) classes.push("commerce");
  if (document.getElementById("eventsClassCustom")?.checked) classes.push("custom");
  return classes;
}

function compareNullableNumber(a, b, dir) {
  const av = a == null || Number.isNaN(Number(a)) ? null : Number(a);
  const bv = b == null || Number.isNaN(Number(b)) ? null : Number(b);
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return dir === "asc" ? av - bv : bv - av;
}

function compareNullableDate(a, b, dir) {
  const av = a ? Date.parse(a) : NaN;
  const bv = b ? Date.parse(b) : NaN;
  const aOk = Number.isFinite(av);
  const bOk = Number.isFinite(bv);
  if (!aOk && !bOk) return 0;
  if (!aOk) return 1;
  if (!bOk) return -1;
  return dir === "asc" ? av - bv : bv - av;
}

function updateEventsSortIndicators() {
  document.querySelectorAll("[data-events-sort]").forEach((btn) => {
    const ind = btn.querySelector(".sort-ind");
    if (!ind) return;
    if (btn.dataset.eventsSort === eventsSort.key) {
      ind.textContent = eventsSort.dir === "asc" ? "↑" : "↓";
      btn.classList.add("is-active");
    } else {
      ind.textContent = "";
      btn.classList.remove("is-active");
    }
  });
}

function renderEventsTable(rows) {
  if (!els.eventsCount) return;
  const filter = (els.eventsFilter?.value || "").trim().toLowerCase();
  let filtered = rows.filter((row) => {
    if (!filter) return true;
    return `${row.type} ${row.classification} ${row.source} ${row.status}`
      .toLowerCase()
      .includes(filter);
  });

  filtered = [...filtered].sort((a, b) =>
    compareNullableNumber(a.eventCount30, b.eventCount30, "desc")
  );

  els.eventsCount.textContent = `${filtered.length} / ${rows.length}`;
  const tbody = document.querySelector("#eventsTable tbody");
  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = emptyTable(4, "No events match filter");
    return;
  }

  tbody.innerHTML = filtered
    .slice(0, 40)
    .map(
      (row) => `
      <tr>
        <td><code>${escapeHtml(row.type)}</code></td>
        <td>${escapeHtml(row.classification || "")}</td>
        <td>${formatNumber(row.eventCount30)}</td>
        <td>${formatNumber(row.eventCount)}</td>
      </tr>`
    )
    .join("");
}

function bindExpandToggles(root) {
  root.querySelectorAll("[data-expand-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-expand-toggle");
      const panel = root.querySelector(`[data-expand-panel="${id}"]`);
      if (!panel) return;
      const open = panel.classList.toggle("hidden") === false;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.classList.toggle("is-open", open);
    });
  });
}

function renderAttributesTable(rows) {
  const filter = els.attributesFilter.value.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      !filter ||
      `${row.property} ${row.type} ${row.source} ${row.description}`.toLowerCase().includes(filter)
  );
  els.attributesCount.textContent = `${filtered.length} / ${rows.length}`;
  document.querySelector("#attributesTable tbody").innerHTML = filtered.length
    ? filtered
        .map(
          (row) => `
      <tr>
        <td>${escapeHtml(row.property)}</td>
        <td>${escapeHtml(row.type || "")}</td>
        <td>${escapeHtml(row.source || "")}</td>
        <td>${pill(row.used)}</td>
        <td>${pill(row.private)}</td>
        <td>${pill(row.temporary)}</td>
        <td>${escapeHtml(row.description || "—")}</td>
      </tr>`
        )
        .join("")
    : emptyTable(7, "No customer properties match filter");
}

function renderDataQuality(dataQuality) {
  const dq = dataQuality || { issues: [], note: null, sampleSize: 0 };
  const issues = dq.issues || [];
  if (els.dataQualitySummary) {
    els.dataQualitySummary.textContent =
      dq.note ||
      (issues.length
        ? `${issues.length} QA issue(s) from schema heuristics and sample values.`
        : "No QA issues flagged from schema + sample.");
  }
  const root = els.dataQualityList;
  if (!root) return;
  if (!issues.length) {
    root.innerHTML = `<div class="finding"><span class="finding-sev low">ok</span><div><h3>No QA issues flagged</h3><p>Schema and sample checks look clean.</p></div></div>`;
    return;
  }
  root.innerHTML = issues
    .slice(0, 12)
    .map(
      (row) => `
      <article class="finding">
        <span class="finding-sev ${escapeHtml(row.severity || "low")}">${escapeHtml(row.severity || "low")}</span>
        <div>
          <div class="area-tag">${escapeHtml((row.kind || "qa").replaceAll("_", " "))}</div>
          <h3><code>${escapeHtml(row.property || row.scope || "Issue")}</code></h3>
          <p>${escapeHtml(row.detail || row.observed || row.suggestedType || "—")}</p>
        </div>
      </article>`
    )
    .join("");
}

function renderDataExpiry(dataExpiry) {
  const root = document.getElementById("dataExpiryPanel");
  if (!root) return;
  const expiry = dataExpiry || {};
  root.innerHTML = `
    <div class="expiry-card">
      <h4>Not available via Loomi</h4>
      <p>${escapeHtml(
        expiry.note ||
          "Event expiration settings live in Engagement Data Manager and are not exposed through Loomi Connect."
      )}</p>
      <p class="muted">Customer properties are last-value attributes and do not have per-property expiration in Engagement.</p>
    </div>`;
}

const OTHER_CHECKS = [
  {
    group: "Live site & SDK",
    items: [
      {
        id: "sdk-running",
        title: "SDK / pixel is running on the live site",
        where: "Client website · browser console / Tracking Console",
        detail: "Confirm exponea (or equivalent) loads after cookie consent and fires events.",
      },
      {
        id: "sdk-token-target",
        title: "SDK token and target match the project",
        where: "Project Settings → API vs website console",
        detail: "Wrong token/target sends data to the wrong project.",
      },
      {
        id: "ctd",
        title: "Custom Tracking Domain (CTD) configured",
        where: "Project Settings + DNS / SDK snippet",
        detail: "Missing CTD fragments Safari/Firefox profiles (ITP).",
      },
      {
        id: "experiment-sw",
        title: "Experiment sync mode & service worker (if using experiments)",
        where: "Website console / service worker registrations",
        detail: "Check new_experiments.mode === sync and Bloomreach service worker where required.",
      },
    ],
  },
  {
    group: "Tracking document & Data Validation Dashboard",
    items: [
      {
        id: "tracking-doc",
        title: "Compare tracking document vs Data Manager",
        where: "Tracking sheet + Data Manager → Events / Properties",
        detail: "Required events/attributes present, naming aligned, types correct (e.g. price as number).",
      },
      {
        id: "dvd-system",
        title: "System & purchase event daily activity",
        where: "Data Validation Dashboard",
        detail: "session_start/end, page_visit, first_session, purchase, purchase_item — look for gaps and spikes.",
      },
      {
        id: "dvd-custom",
        title: "Custom event daily activity",
        where: "Data Validation Dashboard → Custom Events",
        detail: "cart_update, view_item, checkout, search, consent, etc. — flag events that stopped tracking.",
      },
      {
        id: "consent-population",
        title: "Consent categories have customers (true/false)",
        where: "Data Validation Dashboard → Consent",
        detail: "Categories alone aren’t enough — confirm consent events populate each category.",
      },
    ],
  },
  {
    group: "Data Manager & storage",
    items: [
      {
        id: "event-expiry",
        title: "Event expiration / retention settings",
        where: "Data Manager → ⋮ → Expiration",
        detail: "Compare to best-practice table (e.g. page_visit 1 month; consent/purchase forever).",
      },
      {
        id: "imports",
        title: "Imports & feed jobs",
        where: "Data & Assets → Imports / catalog jobs",
        detail: "Schedules running, no failing imports, no stale catalog feeds.",
      },
      {
        id: "integrations",
        title: "Integrations & sender profiles",
        where: "Project Settings / channel setup",
        detail: "Email/SMS/push senders, ESP integrations, and licensed channels not visible in Loomi.",
      },
    ],
  },
  {
    group: "Catalogs & health",
    items: [
      {
        id: "catalog-items",
        title: "Catalog item quality",
        where: "Catalogs / Item Collections",
        detail: "Required fields populated (id, title, price, image, url, categories); no empty/zero/negative prices.",
      },
      {
        id: "variant-catalog",
        title: "Variant catalog (if site has variants)",
        where: "Catalogs",
        detail: "Variant ↔ parent product_id relationship present when sizes/colors exist on site.",
      },
      {
        id: "health-large",
        title: "Project health — oversized profiles",
        where: "Data Validation Dashboard → Health Check",
        detail: "Customers with >100k events (bots, loops, test accounts).",
      },
      {
        id: "health-merges",
        title: "Project health — merges & event spikes",
        where: "Data Validation Dashboard → Health Check / Incoming Events",
        detail: "Merge % with >5 merges near 0%; investigate sudden event spikes or drop-offs.",
      },
    ],
  },
];

function otherChecksStorageKey() {
  const id = auditData?.project?.id || "default";
  return `otherChecks:${id}`;
}

function loadOtherCheckState() {
  try {
    return JSON.parse(localStorage.getItem(otherChecksStorageKey()) || "{}");
  } catch {
    return {};
  }
}

function saveOtherCheckState(state) {
  try {
    localStorage.setItem(otherChecksStorageKey(), JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

function renderOtherChecks() {
  const root = document.getElementById("otherChecksList");
  if (!root) return;
  const state = loadOtherCheckState();
  const total = OTHER_CHECKS.reduce((n, g) => n + g.items.length, 0);
  const done = OTHER_CHECKS.reduce(
    (n, g) => n + g.items.filter((i) => state[i.id]).length,
    0
  );

  root.innerHTML = `
    <p class="muted other-checks-progress">${done} / ${total} checked for this project</p>
    ${OTHER_CHECKS.map(
      (group) => `
      <section class="other-checks-group">
        <h4>${escapeHtml(group.group)}</h4>
        <ul class="other-checks-list">
          ${group.items
            .map((item) => {
              const checked = Boolean(state[item.id]);
              return `
            <li class="other-check${checked ? " is-done" : ""}">
              <label>
                <input type="checkbox" data-other-check="${escapeHtml(item.id)}" ${checked ? "checked" : ""} />
                <span class="other-check-body">
                  <span class="other-check-title">${escapeHtml(item.title)}</span>
                  <span class="other-check-where">${escapeHtml(item.where)}</span>
                  <span class="other-check-detail">${escapeHtml(item.detail)}</span>
                </span>
              </label>
            </li>`;
            })
            .join("")}
        </ul>
      </section>`
    ).join("")}
  `;

  root.querySelectorAll("[data-other-check]").forEach((input) => {
    input.addEventListener("change", () => {
      const next = loadOtherCheckState();
      next[input.getAttribute("data-other-check")] = input.checked;
      saveOtherCheckState(next);
      renderOtherChecks();
    });
  });
}

function renderMappingTable(rows) {
  // Legacy flat table kept unused; mapping now uses renderMappingSections.
  void rows;
}

function renderKpiSection(root, items, { compact = false } = {}) {
  if (!root) return;
  root.innerHTML = items
    .map(([label, value]) => {
      const muted =
        typeof value === "string" &&
        (value.includes("Not available") || value === "None" || value === "Not detected");
      return `
      <div class="kpi${muted ? " kpi-muted" : ""}${compact ? " kpi-compact" : ""}">
        <span class="label">${escapeHtml(label)}</span>
        <span class="value">${typeof value === "number" ? formatNumber(value) : value ?? "—"}</span>
      </div>`;
    })
    .join("");
}

function aiFeatureValue(feature) {
  if (!feature) return `<span class="pill no">no</span>`;
  const used = Boolean(feature.used);
  const detail = feature.detail && feature.detail !== "None" && feature.detail !== "Not detected"
    ? `<span class="kpi-sub">${escapeHtml(feature.detail)}</span>`
    : "";
  return `<span class="pill ${used ? "yes" : "no"}">${used ? "yes" : "no"}</span>${detail}`;
}

function channelPill(channels, name) {
  const row = Array.isArray(channels) ? channels.find((c) => c.name === name) : null;
  const used = Boolean(row?.used || row?.status === "utilised");
  if (used) {
    const count = Number(row?.campaignEventCount || 0);
    const sub =
      count > 0
        ? `<span class="kpi-sub">${formatNumber(count)} events / 90d</span>`
        : row?.sources?.[0]
          ? `<span class="kpi-sub">${escapeHtml(row.sources[0])}</span>`
          : "";
    return `<span class="pill yes">utilised</span>${sub}`;
  }
  return `<span class="pill no">not utilised</span>`;
}

function renderMappingSections(sections, flatRows = []) {
  const filter = (els.mappingFilter?.value || "").trim().toLowerCase();
  const root = els.mappingSections;
  if (!root) return;

  const events = sections.events || [];
  const customerAttributes = sections.customerAttributes || [];
  const catalogs = sections.catalogs || [];
  const consents = sections.consents || [];

  const matchText = (...parts) =>
    !filter || parts.filter(Boolean).join(" ").toLowerCase().includes(filter);

  const filteredEvents = events.filter((e) =>
    matchText(
      e.label,
      e.key,
      e.mappedEvent,
      ...(e.attributes || []).flatMap((a) => [a.field, a.label, a.mappedTo])
    )
  );
  const filteredAttrs = customerAttributes.filter((a) =>
    matchText(a.label, a.key, a.mappedTo)
  );
  const filteredCatalogs = catalogs.filter((c) => matchText(c.label, c.key, c.mappedTo));
  const filteredConsents = consents.filter((c) => matchText(c.label, c.key, c.mappedTo));

  const total =
    filteredEvents.length +
    filteredAttrs.length +
    filteredCatalogs.length +
    filteredConsents.length;
  const allTotal =
    events.length + customerAttributes.length + catalogs.length + consents.length ||
    flatRows.length;
  if (els.mappingCount) els.mappingCount.textContent = `${total} / ${allTotal}`;

  const eventBlocks = filteredEvents
    .map((event) => {
      const attrs = event.attributes || [];
      const attrRows = attrs.length
        ? attrs
            .map(
              (a) => `
          <tr>
            <td>${escapeHtml(a.label || a.field)}</td>
            <td><code>${escapeHtml(a.field)}</code></td>
            <td>${pill(a.mapped)}</td>
            <td>${a.mappedTo ? `<code>${escapeHtml(a.mappedTo)}</code>` : "—"}</td>
          </tr>`
            )
            .join("")
        : `<tr class="empty-row"><td colspan="4">No attribute mappings</td></tr>`;

      return `
      <article class="mapping-card">
        <header class="mapping-card-head">
          <div>
            <h3>${escapeHtml(event.label)}</h3>
            <p class="muted"><code>${escapeHtml(event.key)}</code></p>
          </div>
          <div class="mapping-card-meta">
            ${pill(event.mapped)}
            <span>Event → ${
              event.mappedEvent ? escapeHtml(event.mappedEvent) : "—"
            }</span>
          </div>
        </header>
        <table class="nested-table">
          <thead>
            <tr>
              <th>Attribute</th>
              <th>Standard field</th>
              <th>Mapped</th>
              <th>Mapped to</th>
            </tr>
          </thead>
          <tbody>${attrRows}</tbody>
        </table>
      </article>`;
    })
    .join("");

  const simpleSection = (title, rows) => {
    if (!rows.length) return "";
    return `
      <section class="mapping-section">
        <h3>${escapeHtml(title)}</h3>
        <div class="table-wrap">
          <table class="nested-table mapping-simple-table">
            <thead>
              <tr>
                <th>Standard</th>
                <th>Mapped</th>
                <th>Mapped to</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) => `
                <tr>
                  <td>${escapeHtml(row.label)} <span class="muted">(<code>${escapeHtml(row.key)}</code>)</span></td>
                  <td>${pill(row.mapped)}</td>
                  <td>${row.mappedTo ? `<code>${escapeHtml(row.mappedTo)}</code>` : "—"}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>`;
  };

  root.innerHTML = `
    <section class="mapping-section">
      <h3>Key events</h3>
      <div class="mapping-cards">${
        eventBlocks || `<p class="muted">No event mappings match filter</p>`
      }</div>
    </section>
    ${simpleSection("Customer attributes", filteredAttrs)}
    ${simpleSection("Catalogs", filteredCatalogs)}
    ${simpleSection("Consents", filteredConsents)}
  `;
}

function renderPersonalization(data) {
  const engines = data.engines || [];
  const hits = data.scenarioHits || [];
  const features = data.features || {};
  const predictions = data.predictions || [];
  const autosegments = data.autosegments || [];
  if (els.personalizationCount) {
    els.personalizationCount.textContent = `${data.usedInTemplatesCount ?? 0} used in templates · ${data.runningCount ?? 0} running / ${engines.length} engines`;
  }
  if (els.personalizationSummary) {
    els.personalizationSummary.innerHTML = `
      <div class="ai-feature-row">
        ${[
          ["Recommendations", features.recommendations],
          ["Contextual personalization", features.contextualPersonalization],
          ["Predictions", features.predictions],
          ["Autosegments", features.autosegments],
          ["Recommendations+", features.recommendationsPlus],
        ]
          .map(
            ([label, feature]) => `
          <div class="ai-feature-chip">
            <span class="label">${escapeHtml(label)}</span>
            ${aiFeatureValue(feature)}
          </div>`
          )
          .join("")}
      </div>`;
  }
  renderRecommendationsTable(engines);

  document.querySelector("#personalizationScenariosTable tbody").innerHTML = hits.length
    ? hits
        .map(
          (row) => `
      <tr>
        <td>${escapeHtml(row.scenarioName)}</td>
        <td>${escapeHtml((row.signals || []).map((s) => s.detail).join("; ") || "—")}</td>
      </tr>`
        )
        .join("")
    : emptyTable(2, "No live scenarios with recommendation / content-source signals detected");

  const predBody = document.querySelector("#predictionsTable tbody");
  if (predBody) {
    predBody.innerHTML = predictions.length
      ? predictions
          .map(
            (row) => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.status || "—")}</td>
        </tr>`
          )
          .join("")
      : emptyTable(2, "No predictions found");
  }
  const autoBody = document.querySelector("#autosegmentsTable tbody");
  if (autoBody) {
    autoBody.innerHTML = autosegments.length
      ? autosegments
          .map(
            (row) => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.status || "—")}</td>
        </tr>`
          )
          .join("")
      : emptyTable(2, "No autosegments found");
  }
}

function renderRecommendationsTable(rows) {
  const filter = (els.recommendationsFilter?.value || "").trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      !filter ||
      `${row.name} ${row.status} ${row.usedInSummary || ""}`.toLowerCase().includes(filter)
  );
  document.querySelector("#recommendationsTable tbody").innerHTML = filtered.length
    ? filtered
        .map(
          (row) => `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.status || "—")}</td>
        <td>${pill(row.running)}</td>
        <td>${
          row.usedInTemplates
            ? escapeHtml(row.usedInSummary || "yes")
            : `<span class="pill no">not detected</span>`
        }</td>
      </tr>`
        )
        .join("")
    : emptyTable(4, rows.length ? "No recommendations match filter" : "No recommendation engines found");
}

function formatLastUpdated(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderScenarioPerformance(rows = [], summary = {}) {
  const countEl = els.scenarioPerfCount || document.getElementById("scenarioPerfCount");
  const tbody = document.querySelector("#scenarioPerfTable tbody");
  if (!tbody) return;

  const windowDays = summary.windowDays ?? 30;
  if (countEl) {
    countEl.textContent = rows.length
      ? `Top ${rows.length} automations by clicks · last ${windowDays}d`
      : `No automation engagement in last ${windowDays}d`;
  }

  tbody.innerHTML = rows.length
    ? rows
        .map((row) => {
          const match = row.matchedScenarioName
            ? escapeHtml(row.matchedScenarioName)
            : `<span class="muted">not in live list</span>`;
          const revenue =
            row.revenue != null && Number(row.revenue) > 0
              ? formatNumber(row.revenue)
              : "—";
          const kind = row.kind || "Automation";
          return `
      <tr>
        <td>${formatNumber(row.rank)}</td>
        <td>
          <div>${escapeHtml(row.campaignName)}</div>
          <div><span class="pill yes">${escapeHtml(kind)}</span></div>
        </td>
        <td>${formatNumber(row.delivered)}</td>
        <td>${formatNumber(row.opens)}</td>
        <td>${formatNumber(row.clicks)}</td>
        <td>${formatPercent(row.openRate)}</td>
        <td>${formatPercent(row.ctr)}</td>
        <td>${revenue}</td>
        <td>${match}</td>
      </tr>`;
        })
        .join("")
    : emptyTable(
        9,
        "No Automation (always-on) campaign open/click data for the last 30 days"
      );

  if (!summary.revenueAvailable && rows.length && countEl) {
    countEl.textContent += " · revenue not campaign-attributed";
  }
}

function renderScenariosTable(rows, summary = {}) {
  const filter = (els.scenariosFilter?.value || "").trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (!filter) return true;
    const usages = (row.eventUsages || []).map((u) => `${u.event} ${u.usage}`).join(" ");
    const channels = (row.channels || []).join(" ");
    return `${row.name} ${row.kind || ""} ${row.status} ${(row.eventsUsed || []).join(" ")} ${usages} ${channels}`
      .toLowerCase()
      .includes(filter);
  });

  const bauCount = rows.filter((r) => r.oneOff || r.kind === "BAU").length;
  els.scenariosCount.textContent =
    `${filtered.length}${filter ? ` / ${rows.length}` : ""} live` +
    (bauCount ? ` · ${bauCount} BAU` : "") +
    (summary.total != null ? ` / ${summary.total} total` : "");

  document.querySelector("#scenariosTable tbody").innerHTML = filtered.length
    ? filtered
        .map((row) => {
          const usages = (row.eventUsages || [])
            .map((u) => `${u.event} (${u.usage})`)
            .join(", ");
          const channels = (row.channels || []).join(", ");
          const kind = row.kind || (row.oneOff ? "BAU" : "Automation");
          return `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td><span class="pill ${kind === "BAU" ? "available" : "yes"}">${escapeHtml(kind)}</span></td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(formatLastUpdated(row.edited))}</td>
        <td>${row.eventsUsed?.length ? escapeHtml(row.eventsUsed.join(", ")) : "—"}</td>
        <td>${usages ? escapeHtml(usages) : "—"}</td>
        <td>${channels ? escapeHtml(channels) : "—"}</td>
        <td>${formatNumber(row.nodeCount)}</td>
      </tr>`;
        })
        .join("")
    : emptyTable(
        8,
        rows.length ? "No scenarios match filter" : "No live (active) scenarios found in this project"
      );
}

function renderCatalogsTable(rows) {
  if (els.catalogsCount) els.catalogsCount.textContent = `${rows.length} catalog(s)`;
  const tbody = document.querySelector("#catalogsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
      <tr>
        <td>
          <div>${escapeHtml(row.displayName || row.name || row.id)}</div>
          ${
            row.name && row.displayName && row.name !== row.displayName
              ? `<div class="muted"><code>${escapeHtml(row.name)}</code></div>`
              : row.id
                ? `<div class="muted"><code>${escapeHtml(row.id)}</code></div>`
                : ""
          }
        </td>
        <td>${escapeHtml(row.type || "—")}</td>
        <td>${pill(Boolean(row.used))}</td>
        <td>${escapeHtml(row.usageSummary || "—")}</td>
      </tr>`
        )
        .join("")
    : emptyTable(4, "No catalogs returned for this project");
}

function renderImportsTable(rows) {
  void rows;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Escape text and turn markdown links + bare URLs into anchors. */
function linkifyText(value) {
  let text = escapeHtml(value);
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  );
  text = text.replace(
    /(^|[\s(])(https?:\/\/[^\s)<]+)(?=$|[\s).,;!?])/g,
    (_, lead, url) =>
      `${lead}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
  return text;
}

document.querySelectorAll(".pillar-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    selectPillarTab(tab.dataset.pillar);
  });
});

els.connectBtn.addEventListener("click", async () => {
  const status = await api("/api/status");
  if (status.allMcpsConnected) {
    await disconnect();
  } else {
    await connect();
  }
});

els.orgSelect.addEventListener("change", async () => {
  try {
    await loadProjects(els.orgSelect.value);
  } catch (err) {
    setStatus(err.message, true);
  }
});

els.projectSelect.addEventListener("change", () => {
  els.auditBtn.disabled = !els.projectSelect.value;
});

els.auditBtn.addEventListener("click", runAudit);

els.exportHtmlBtn?.addEventListener("click", () => {
  if (!auditData) {
    setStatus("Show the project dashboard before exporting.", true);
    return;
  }
  try {
    const filename = downloadAuditHtmlReport(auditData);
    setStatus(`Downloaded ${filename}. Upload it to Google Drive and open with Google Docs.`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

refreshStatus().catch((err) => setStatus(err.message, true));

window.addEventListener("focus", () => {
  refreshStatus().catch(() => {});
});
