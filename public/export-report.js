/**
 * Build a Google Docs–friendly HTML audit report and trigger download.
 * Upload the .html file in Drive, or open it and copy into a Doc.
 */

function reportEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reportNum(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString();
}

function reportDate(iso) {
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

function reportTable(headers, rows) {
  if (!rows.length) {
    return `<p><em>No rows</em></p>`;
  }
  const head = headers.map((h) => `<th>${reportEscape(h)}</th>`).join("");
  const body = rows
    .map(
      (cols) =>
        `<tr>${cols.map((c) => `<td>${c == null || c === "" ? "—" : c}</td>`).join("")}</tr>`
    )
    .join("");
  return `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:11pt">
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function channelStatus(channels, name) {
  const row = Array.isArray(channels) ? channels.find((c) => c.name === name) : null;
  if (!row) return "—";
  if (row.used || row.status === "utilised") {
    const count = Number(row.campaignEventCount || 0);
    return count > 0 ? `utilised (${reportNum(count)} events / 90d)` : "utilised";
  }
  return "not utilised";
}

function aiStatus(feature) {
  if (!feature) return "no";
  const used = Boolean(feature.used);
  const detail = feature.detail && feature.detail !== "None" && feature.detail !== "Not detected"
    ? ` — ${feature.detail}`
    : "";
  return `${used ? "yes" : "no"}${detail}`;
}

function slugifyFilename(name) {
  return String(name || "project")
    .trim()
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "project";
}

function buildAuditHtmlReport(data) {
  const project = data.project || {};
  const o = data.overview || {};
  const generatedAt = new Date().toLocaleString();
  const title = `Digital Client Services Agent — ${project.name || project.id || "Project"}`;

  const findings = data.findings || [];
  const adoption = data.adoptionOpportunities || [];
  const aiInsights = data.aiInsights || null;
  const events = (data.events || []).slice(0, 80);
  const scenarios = data.scenarios || [];
  const weblayers = data.weblayers || [];
  const perf = data.scenarioPerformance || [];
  const engines = data.personalization?.engines || [];
  const mappingEvents = data.mappingSections?.events || [];
  const identifiers = data.identifiers || [];
  const catalogs = data.catalogs || [];

  const sections = [];

  sections.push(`
    <h1>${reportEscape(title)}</h1>
    <p>
      <strong>Workspace:</strong> ${reportEscape(project.workspace || "—")}<br/>
      <strong>Category:</strong> ${reportEscape(project.category || "—")}<br/>
      <strong>Project URL:</strong> ${
        project.url
          ? `<a href="${reportEscape(project.url)}">${reportEscape(project.url)}</a>`
          : "—"
      }<br/>
      <strong>Generated:</strong> ${reportEscape(generatedAt)}
    </p>
    <p><em>Tip: Upload this HTML file to Google Drive and open with Google Docs, or copy sections into a Doc.</em></p>
  `);

  const brief = data.clientBrief;
  if (brief && (brief.summary || brief.overview || (brief.trackingDocs || []).length)) {
    sections.push(`<h2>Client context (Glean)</h2>`);
    if (brief.vertical) {
      sections.push(`<p><strong>Vertical:</strong> ${reportEscape(brief.vertical)}</p>`);
    }
    if (brief.summary) {
      sections.push(`<p>${reportEscape(brief.summary)}</p>`);
    } else if (brief.overview) {
      sections.push(`<p>${reportEscape(brief.overview)}</p>`);
    }
    if ((brief.trackingDocs || []).length) {
      sections.push(`<h3>Documents</h3><ul>${brief.trackingDocs
        .map((doc) => {
          const label = reportEscape(doc.title || "Document");
          const link = doc.url
            ? `<a href="${reportEscape(doc.url)}">${label}</a>`
            : label;
          const summary = doc.summary ? ` — ${reportEscape(doc.summary)}` : "";
          return `<li>${link}${summary}</li>`;
        })
        .join("")}</ul>`);
    }
    if ((brief.implementation || []).length) {
      sections.push(`<h3>Implementation</h3><ul>${brief.implementation
        .map((item) => `<li>${reportEscape(item)}</li>`)
        .join("")}</ul>`);
    }
    if ((brief.integrations || []).length) {
      sections.push(`<h3>Integrations</h3><ul>${brief.integrations
        .map((item) => {
          const name = reportEscape(item.name || "Integration");
          const detail = item.detail ? ` — ${reportEscape(item.detail)}` : "";
          return `<li><strong>${name}</strong>${detail}</li>`;
        })
        .join("")}</ul>`);
    }
    if ((brief.gaps || []).length) {
      sections.push(`<h3>Not confirmed in Glean</h3><ul>${brief.gaps
        .map((item) => `<li>${reportEscape(item)}</li>`)
        .join("")}</ul>`);
    }
  }

  sections.push(`
    <h2>Data overview</h2>
    <ul>
      <li><strong>Customers:</strong> ${reportNum(o.totalCustomers)}</li>
      <li><strong>Events (all time / 30d):</strong> ${reportNum(o.totalEvents)} / ${reportNum(o.events30d)}</li>
      <li><strong>IDs:</strong> ${reportNum(o.hardIdCount)} hard / ${reportNum(o.softIdCount)} soft</li>
      <li><strong>Consent categories:</strong> ${reportNum(o.consentCategoryCount)}</li>
      <li><strong>Properties:</strong> ${reportNum(o.attributeCount)}${
        o.maxCustomerProperties ? ` / ${reportNum(o.maxCustomerProperties)}` : ""
      }</li>
    </ul>
  `);

  sections.push(`
    <h2>Channels — utilised</h2>
    ${reportTable(
      ["Channel", "Status"],
      ["Email", "SMS", "WhatsApp", "Push", "Weblayer", "In App"].map((name) => [
        reportEscape(name),
        reportEscape(channelStatus(o.channels, name)),
      ])
    )}
  `);

  const ai = o.aiPersonalization || data.personalization?.features || {};
  sections.push(`
    <h2>Personalization &amp; AI</h2>
    ${reportTable(
      ["Feature", "Status"],
      [
        ["Recommendations", aiStatus(ai.recommendations)],
        ["Contextual personalization", aiStatus(ai.contextualPersonalization)],
        ["Predictions", aiStatus(ai.predictions)],
        ["Autosegments", aiStatus(ai.autosegments)],
        ["Recommendations+", aiStatus(ai.recommendationsPlus)],
      ].map(([k, v]) => [reportEscape(k), reportEscape(v)])
    )}
  `);

  sections.push(`
    <h2>Data findings</h2>
    ${
      findings.length
        ? `<ul>${findings
            .map(
              (f) => `<li>
            <strong>[${reportEscape(f.severity)}] ${reportEscape(f.area)} — ${reportEscape(f.title)}</strong>
            ${f.detail ? `<br/>${reportEscape(f.detail)}` : ""}
            ${f.recommendation ? `<br/><em>Next:</em> ${reportEscape(f.recommendation)}` : ""}
          </li>`
            )
            .join("")}</ul>`
        : `<p>No automatic issues flagged.</p>`
    }
    ${
      aiInsights?.available
        ? `<h3>AI recommendations (Glean)</h3>
           ${aiInsights.summary ? `<p>${reportEscape(aiInsights.summary)}</p>` : ""}
           ${
             (aiInsights.findings || []).length
               ? `<ul>${(aiInsights.findings || [])
                   .map(
                     (item) => `<li>
                 <strong>${reportEscape(item.title || item.basedOn || "Recommendation")}</strong>
                 ${item.narrative ? `<br/>${reportEscape(item.narrative)}` : ""}
                 ${item.action ? `<br/><em>Next:</em> ${reportEscape(item.action)}` : ""}
               </li>`
                   )
                   .join("")}</ul>`
               : ""
           }`
        : aiInsights?.error
          ? `<p><em>AI recommendations unavailable: ${reportEscape(aiInsights.error)}</em></p>`
          : ""
    }
  `);

  sections.push(`
    <h2>Adoption opportunities</h2>
    ${
      adoption.length
        ? `<ul>${adoption
            .map(
              (item) => `<li>
            <strong>${reportEscape(item.title)}</strong>
            ${item.scenario ? ` <em>(${reportEscape(item.scenario)})</em>` : ""}
            ${item.detail ? `<br/>${reportEscape(item.detail)}` : ""}
            ${item.action ? `<br/><em>Action:</em> ${reportEscape(item.action)}` : ""}
          </li>`
            )
            .join("")}</ul>`
        : `<p>No major adoption gaps flagged.</p>`
    }
    ${
      aiInsights?.available && (aiInsights.adoption || []).length
        ? `<h3>AI adoption advice (Glean)</h3>
           <ul>${(aiInsights.adoption || [])
             .map(
               (item) => `<li>
             <strong>${reportEscape(item.title || item.basedOn || "Adoption advice")}</strong>
             ${item.narrative ? `<br/>${reportEscape(item.narrative)}` : ""}
             ${item.action ? `<br/><em>Adopt:</em> ${reportEscape(item.action)}` : ""}
           </li>`
             )
             .join("")}</ul>`
        : ""
    }
  `);

  sections.push(`
    <h2>Identifiers</h2>
    ${reportTable(
      ["Identifier", "Type", "Lowercase", "Trim"],
      identifiers.map((row) => [
        `<code>${reportEscape(row.id)}</code>`,
        reportEscape(row.type),
        row.transformLowercase ? "yes" : "no",
        row.transformTrim ? "yes" : "no",
      ])
    )}
  `);

  const consents = data.consents || [];
  sections.push(`
    <h2>Consent categories</h2>
    ${reportTable(
      ["Category", "Name", "Legitimate interest", "Mapped standard", "Sources"],
      consents.map((row) => [
        `<code>${reportEscape(row.id)}</code>`,
        reportEscape(row.name),
        row.legitimateInterest ? "yes" : "no",
        reportEscape(row.mappedStandard || ""),
        reportEscape(row.sources || ""),
      ])
    )}
  `);

  const attributes = (data.attributes || []).slice(0, 60);
  sections.push(`
    <h2>Customer properties</h2>
    ${reportTable(
      ["Property", "Type", "Used", "Private", "Temporary"],
      attributes.map((row) => [
        reportEscape(row.property),
        reportEscape(row.type || ""),
        row.used ? "yes" : "no",
        row.private ? "yes" : "no",
        row.temporary ? "yes" : "no",
      ])
    )}
  `);

  const dq = data.dataQuality?.issues || [];
  if (dq.length) {
    sections.push(`
      <h2>Data quality</h2>
      <p class="muted">${reportEscape(data.dataQuality?.note || "")}</p>
      ${reportTable(
        ["Severity", "Kind", "Property", "Declared", "Observed", "Detail"],
        dq.slice(0, 40).map((row) => [
          reportEscape(row.severity || ""),
          reportEscape(row.kind || ""),
          reportEscape(row.property || ""),
          reportEscape(row.declaredType || ""),
          reportEscape(row.observed || row.suggestedType || ""),
          reportEscape(row.detail || ""),
        ])
      )}
    `);
  }

  sections.push(`
    <h2>Data expiry</h2>
    <p>${reportEscape(
      data.dataExpiry?.note ||
        "Event expiration settings are not available via Loomi Connect."
    )}</p>
  `);

  sections.push(`
    <h2>Events (top by 30d volume)</h2>
    ${reportTable(
      ["Event", "Class", "Status", "Used", "Properties", "30d", "All time"],
      events.map((row) => [
        `<code>${reportEscape(row.type)}</code>`,
        reportEscape(row.classification),
        reportEscape(row.status),
        row.used ? "yes" : "no",
        reportNum(row.propertyCount),
        reportNum(row.eventCount30),
        reportNum(row.eventCount),
      ])
    )}
  `);

  sections.push(`
    <h2>Data mapping — standard events</h2>
    ${reportTable(
      ["Standard event", "Mapped", "Project event"],
      mappingEvents.map((row) => [
        reportEscape(row.label || row.key),
        row.mapped ? "yes" : "no",
        reportEscape(row.mappedEvent || "—"),
      ])
    )}
  `);

  sections.push(`
    <h2>Catalogs</h2>
    ${reportTable(
      ["Catalog", "Type", "Used", "Usages"],
      catalogs.map((row) => [
        reportEscape(row.displayName || row.name || row.id),
        reportEscape(row.type || ""),
        row.used ? "yes" : "no",
        reportEscape(row.usageSummary || "—"),
      ])
    )}
  `);

  sections.push(`
    <h2>Live scenarios</h2>
    ${reportTable(
      ["Scenario", "Kind", "Status", "Last updated", "Channels"],
      scenarios.map((row) => [
        reportEscape(row.name),
        reportEscape(row.kind || (row.oneOff ? "BAU" : "Automation")),
        reportEscape(row.status),
        reportEscape(row.edited ? new Date(row.edited).toLocaleString() : "—"),
        reportEscape((row.channels || []).join(", ")),
      ])
    )}
  `);

  sections.push(`
    <h2>Active weblayers</h2>
    ${reportTable(
      ["Weblayer", "Status", "Last updated"],
      weblayers.map((row) => [
        reportEscape(row.name),
        reportEscape(row.status || "active"),
        reportEscape(row.edited ? new Date(row.edited).toLocaleString() : "—"),
      ])
    )}
  `);

  sections.push(`
    <h2>Top performing automations (last 30 days)</h2>
    ${reportTable(
      ["Rank", "Campaign / scenario", "Delivered", "Opens", "Clicks", "Open rate", "CTR"],
      perf.map((row) => [
        reportNum(row.rank),
        reportEscape(row.campaignName || row.matchedScenarioName),
        reportNum(row.delivered),
        reportNum(row.opens),
        reportNum(row.clicks),
        row.openRate == null ? "—" : `${(Number(row.openRate) * 100).toFixed(1)}%`,
        row.ctr == null ? "—" : `${(Number(row.ctr) * 100).toFixed(1)}%`,
      ])
    )}
  `);

  sections.push(`
    <h2>Recommendations</h2>
    ${reportTable(
      ["Engine", "Status", "Running", "Used in templates"],
      engines.map((row) => [
        reportEscape(row.name),
        reportEscape(row.status || "—"),
        row.running ? "yes" : "no",
        row.usedInTemplates ? reportEscape(row.usedInSummary || "yes") : "not detected",
      ])
    )}
  `);

  if (Array.isArray(data.toolErrors) && data.toolErrors.length) {
    sections.push(`
      <h2>Tool warnings</h2>
      <ul>${data.toolErrors
        .map((e) => `<li><code>${reportEscape(e.tool)}</code>: ${reportEscape(e.error)}</li>`)
        .join("")}</ul>
    `);
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${reportEscape(title)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #222; max-width: 960px; margin: 24px auto; line-height: 1.45; }
    h1 { font-size: 22pt; }
    h2 { font-size: 14pt; margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    table { margin: 12px 0 20px; }
    th { background: #f3f3f3; text-align: left; }
    code { font-family: Consolas, monospace; font-size: 10pt; }
  </style>
</head>
<body>
${sections.join("\n")}
</body>
</html>`;
}

function downloadAuditHtmlReport(data) {
  const html = buildAuditHtmlReport(data);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `audit-${slugifyFilename(data.project?.name || data.project?.id)}-${stamp}.html`;
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return name;
}
