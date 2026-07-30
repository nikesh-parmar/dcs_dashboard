/**
 * Email deliverability metrics via Loomi execute_analytics_eql.
 * Uses campaign event statuses (enqueued/delivered/bounces/opens/clicks).
 */

const EMAIL_FILTER =
  '(.action_type = "email" or .action_type = "transactional_email")';

const WAIT_MS = 900;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function rate(numerator, denominator) {
  if (numerator == null || denominator == null || !(denominator > 0)) return null;
  return numerator / denominator;
}

function deltaPp(current, previous) {
  if (current == null || previous == null) return null;
  return Number(((current - previous) * 100).toFixed(2));
}

function emptyMetrics(windowDays) {
  return {
    windowDays,
    sends: null,
    delivered: null,
    hardBounces: null,
    softBounces: null,
    complaints: null,
    opens: null,
    clicks: null,
    deliveryRate: null,
    hardBounceRate: null,
    softBounceRate: null,
    complaintRate: null,
    openRate: null,
    clickThroughRate: null,
  };
}

function finalizeMetrics(raw, windowDays) {
  const sends = raw.sends;
  const delivered = raw.delivered;
  const openDenom = delivered > 0 ? delivered : sends;
  return {
    windowDays,
    ...raw,
    deliveryRate: rate(delivered, sends),
    hardBounceRate: rate(raw.hardBounces, sends),
    softBounceRate: rate(raw.softBounces, sends),
    complaintRate: rate(raw.complaints, sends),
    openRate: rate(raw.opens, openDenom),
    clickThroughRate: rate(raw.clicks, openDenom),
  };
}

function parseMetricRow(result) {
  const values = result?.data?.rows?.[0]?.values || [];
  const num = (i) => {
    const v = Number(values[i]);
    return Number.isFinite(v) ? v : null;
  };
  return {
    sends: num(0),
    delivered: num(1),
    hardBounces: num(2),
    softBounces: num(3),
    complaints: num(4),
    opens: num(5),
    clicks: num(6),
  };
}

function aggregateQuery(days) {
  return [
    "select",
    `count(event campaign where ${EMAIL_FILTER} and (.status = "enqueued" or .status = "sent")),`,
    `count(event campaign where ${EMAIL_FILTER} and .status = "delivered"),`,
    `count(event campaign where ${EMAIL_FILTER} and (.status = "hard_bounced" or .status = "bounced")),`,
    `count(event campaign where ${EMAIL_FILTER} and (.status = "soft_bounced" or .status = "dropped")),`,
    `count(event campaign where ${EMAIL_FILTER} and (.status = "complained" or .status = "complaint")),`,
    `count(event campaign where ${EMAIL_FILTER} and .status = "opened"),`,
    `count(event campaign where ${EMAIL_FILTER} and .status = "clicked")`,
    `in last ${days} days`,
  ].join(" ");
}

function seriesQuery(days) {
  return [
    "select",
    `count(event campaign where ${EMAIL_FILTER} and .status = "delivered"),`,
    `count(event campaign where ${EMAIL_FILTER} and (.status = "hard_bounced" or .status = "bounced")),`,
    `count(event campaign where ${EMAIL_FILTER} and (.status = "soft_bounced" or .status = "dropped")),`,
    `count(event campaign where ${EMAIL_FILTER} and (.status = "complained" or .status = "complaint"))`,
    `by timestamp`,
    `in last ${days} days`,
  ].join(" ");
}

async function runEql(loomi, projectId, query, toolErrors, label, extraArgs = {}) {
  try {
    const result = await loomi.callTool("execute_analytics_eql", {
      project_id: projectId,
      query,
      ...extraArgs,
    });
    if (result?.success === false || result?.error) {
      toolErrors.push({
        tool: "execute_analytics_eql",
        error: String(result.error || `${label} failed`),
      });
      return null;
    }
    return result;
  } catch (err) {
    toolErrors.push({
      tool: "execute_analytics_eql",
      error: err.message || String(err),
    });
    return null;
  }
}

function parseSeriesRows(result) {
  const rows = [];
  for (const row of result?.data?.rows || []) {
    const header = row?.headers?.[0];
    if (!header || header.type === "other") continue;
    const raw = header.value ?? header.label ?? header.name;
    if (raw == null) continue;
    const date = normalizeSeriesDate(raw);
    if (!date) continue;
    const values = row.values || [];
    const num = (i) => {
      const v = Number(values[i]);
      return Number.isFinite(v) ? v : 0;
    };
    const delivered = num(0);
    const hardBounces = num(1);
    const softBounces = num(2);
    const complaints = num(3);
    const volumeBase = delivered + hardBounces + softBounces;
    rows.push({
      date,
      delivered,
      hardBounces,
      softBounces,
      complaints,
      hardBounceRate: rate(hardBounces, volumeBase > 0 ? volumeBase : null),
      softBounceRate: rate(softBounces, volumeBase > 0 ? volumeBase : null),
      complaintRate: rate(complaints, volumeBase > 0 ? volumeBase : null),
    });
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return rows;
}

function normalizeSeriesDate(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const text = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

function rangeLabel(windowDays, endMs = Date.now()) {
  const end = new Date(endMs);
  const start = new Date(endMs - (windowDays - 1) * 86400000);
  const fmt = (d) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Temporary demo mode until live Loomi deliverability is enabled in demos. */
const USE_DEMO_DELIVERABILITY = true;

function demoSeed(windowDays) {
  // Stable-ish profiles per window so 7/14/30 look distinct but healthy.
  if (windowDays === 7) {
    return {
      dailyDelivered: 82000,
      deliveryRate: 0.994,
      hardBounceRate: 0.002,
      softBounceRate: 0.003,
      complaintRate: 0.00015,
      openRate: 0.43,
      clickThroughRate: 0.034,
      prior: {
        deliveryRate: 0.991,
        hardBounceRate: 0.0025,
        softBounceRate: 0.0035,
        complaintRate: 0.0002,
        openRate: 0.41,
        clickThroughRate: 0.031,
      },
    };
  }
  if (windowDays === 14) {
    return {
      dailyDelivered: 76000,
      deliveryRate: 0.993,
      hardBounceRate: 0.0025,
      softBounceRate: 0.0035,
      complaintRate: 0.00018,
      openRate: 0.42,
      clickThroughRate: 0.032,
      prior: {
        deliveryRate: 0.989,
        hardBounceRate: 0.003,
        softBounceRate: 0.004,
        complaintRate: 0.00022,
        openRate: 0.405,
        clickThroughRate: 0.029,
      },
    };
  }
  return {
    dailyDelivered: 72000,
    deliveryRate: 0.992,
    hardBounceRate: 0.003,
    softBounceRate: 0.004,
    complaintRate: 0.0002,
    openRate: 0.41,
    clickThroughRate: 0.031,
    prior: {
      deliveryRate: 0.986,
      hardBounceRate: 0.004,
      softBounceRate: 0.005,
      complaintRate: 0.0003,
      openRate: 0.387,
      clickThroughRate: 0.027,
    },
  };
}

function buildDemoSeries(windowDays, seed) {
  const series = [];
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const day = new Date(end);
    day.setDate(end.getDate() - i);
    // Gentle weekly seasonality + small noise for a realistic chart.
    const wave = Math.sin((i / windowDays) * Math.PI * 2) * 0.12;
    const weekend = [0, 6].includes(day.getDay()) ? -0.18 : 0;
    const delivered = Math.round(seed.dailyDelivered * (1 + wave + weekend));
    const hardBounces = Math.max(1, Math.round(delivered * seed.hardBounceRate));
    const softBounces = Math.max(1, Math.round(delivered * seed.softBounceRate));
    const complaints = Math.max(0, Math.round(delivered * seed.complaintRate));
    const volumeBase = delivered + hardBounces + softBounces;
    series.push({
      date: day.toISOString().slice(0, 10),
      delivered,
      hardBounces,
      softBounces,
      complaints,
      hardBounceRate: rate(hardBounces, volumeBase),
      softBounceRate: rate(softBounces, volumeBase),
      complaintRate: rate(complaints, volumeBase),
    });
  }
  return series;
}

function buildDemoMetrics(windowDays, rates, scale) {
  const sends = Math.round(scale);
  const delivered = Math.round(sends * rates.deliveryRate);
  const hardBounces = Math.round(sends * rates.hardBounceRate);
  const softBounces = Math.round(sends * rates.softBounceRate);
  const complaints = Math.round(sends * rates.complaintRate);
  const opens = Math.round(delivered * rates.openRate);
  const clicks = Math.round(delivered * rates.clickThroughRate);
  return finalizeMetrics(
    {
      sends,
      delivered,
      hardBounces,
      softBounces,
      complaints,
      opens,
      clicks,
    },
    windowDays
  );
}

export function buildDemoDeliverability(windowDays = 30) {
  const days = [7, 14, 30].includes(Number(windowDays)) ? Number(windowDays) : 30;
  const seed = demoSeed(days);
  const series = buildDemoSeries(days, seed);
  const scale = series.reduce((sum, row) => sum + row.delivered, 0) / seed.deliveryRate;
  const current = buildDemoMetrics(days, seed, scale);
  const previous = buildDemoMetrics(days, seed.prior, scale * 0.94);

  return {
    ok: true,
    demo: true,
    windowDays: days,
    rangeLabel: rangeLabel(days),
    previousRangeLabel: rangeLabel(days, Date.now() - days * 86400000),
    current,
    previous,
    deltas: {
      deliveryRatePp: deltaPp(current.deliveryRate, previous.deliveryRate),
      hardBounceRatePp: deltaPp(current.hardBounceRate, previous.hardBounceRate),
      softBounceRatePp: deltaPp(current.softBounceRate, previous.softBounceRate),
      complaintRatePp: deltaPp(current.complaintRate, previous.complaintRate),
      openRatePp: deltaPp(current.openRate, previous.openRate),
      clickThroughRatePp: deltaPp(current.clickThroughRate, previous.clickThroughRate),
    },
    series,
    note: "Demo data for presentation — live Loomi metrics can replace this later.",
    source: "demo",
    queriedAt: new Date().toISOString(),
  };
}

/**
 * @param {import('./client.js').LoomiClient} loomi
 * @param {string} projectId
 * @param {array} toolErrors
 * @param {{ windowDays?: number, onProgress?: Function }} options
 */
export async function loadDeliverabilityMetrics(
  loomi,
  projectId,
  toolErrors,
  { windowDays = 30, onProgress } = {}
) {
  const days = [7, 14, 30].includes(Number(windowDays)) ? Number(windowDays) : 30;

  // Demo-first for now so the dashboard always looks presentation-ready.
  if (USE_DEMO_DELIVERABILITY) {
    onProgress?.({
      step: "deliverability",
      detail: `Loading demo deliverability metrics (last ${days} days)…`,
      percent: 62,
    });
    return buildDemoDeliverability(days);
  }

  onProgress?.({
    step: "deliverability",
    detail: `Loading email deliverability metrics (last ${days} days)…`,
    percent: 62,
  });

  const currentResult = await runEql(
    loomi,
    projectId,
    aggregateQuery(days),
    toolErrors,
    `deliverability aggregates ${days}d`
  );
  const current = finalizeMetrics(
    currentResult ? parseMetricRow(currentResult) : emptyMetrics(days),
    days
  );

  await wait(WAIT_MS);
  onProgress?.({
    step: "deliverability",
    detail: "Loading prior-period deliverability comparison…",
    percent: 64,
  });

  const priorExecutionTime = Math.floor(Date.now() / 1000) - days * 86400;
  const priorResult = await runEql(
    loomi,
    projectId,
    aggregateQuery(days),
    toolErrors,
    `deliverability prior ${days}d`,
    { execution_time: priorExecutionTime }
  );
  const previous = finalizeMetrics(
    priorResult ? parseMetricRow(priorResult) : emptyMetrics(days),
    days
  );

  await wait(WAIT_MS);
  onProgress?.({
    step: "deliverability",
    detail: "Loading deliverability trend series…",
    percent: 66,
  });

  let series = [];
  const seriesResult = await runEql(
    loomi,
    projectId,
    seriesQuery(days),
    toolErrors,
    `deliverability series ${days}d`
  );
  if (seriesResult) {
    series = parseSeriesRows(seriesResult);
  }

  // Fallback series query without bare "by timestamp" if empty
  if (!series.length) {
    await wait(WAIT_MS);
    const alt = await runEql(
      loomi,
      projectId,
      seriesQuery(days).replace("by timestamp", "by timestamp day"),
      toolErrors,
      `deliverability series day ${days}d`
    );
    if (alt) series = parseSeriesRows(alt);
  }

  const ok =
    current.sends != null ||
    current.delivered != null ||
    current.hardBounces != null ||
    series.length > 0;

  return {
    ok,
    windowDays: days,
    rangeLabel: rangeLabel(days),
    previousRangeLabel: rangeLabel(days, Date.now() - days * 86400000),
    current,
    previous,
    deltas: {
      deliveryRatePp: deltaPp(current.deliveryRate, previous.deliveryRate),
      hardBounceRatePp: deltaPp(current.hardBounceRate, previous.hardBounceRate),
      softBounceRatePp: deltaPp(current.softBounceRate, previous.softBounceRate),
      complaintRatePp: deltaPp(current.complaintRate, previous.complaintRate),
      openRatePp: deltaPp(current.openRate, previous.openRate),
      clickThroughRatePp: deltaPp(current.clickThroughRate, previous.clickThroughRate),
    },
    series,
    note: ok
      ? null
      : "Email deliverability metrics were not available via Loomi for this range.",
    source: "loomi_eql",
    queriedAt: new Date().toISOString(),
  };
}

export function emptyDeliverability(windowDays = 30) {
  return {
    ok: false,
    windowDays,
    rangeLabel: rangeLabel(windowDays),
    previousRangeLabel: rangeLabel(windowDays, Date.now() - windowDays * 86400000),
    current: emptyMetrics(windowDays),
    previous: emptyMetrics(windowDays),
    deltas: {},
    series: [],
    note: "Deliverability metrics not loaded.",
    source: null,
    queriedAt: null,
  };
}
