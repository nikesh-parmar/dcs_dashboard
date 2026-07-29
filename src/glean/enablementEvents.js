/**
 * Upcoming Bloomreach enablement events for the hub spotlight.
 * Includes masterclasses, Edge Summit, and Academy live sessions.
 * Dates are compared in local time against "today".
 */

const EVENTS = [
  {
    id: "sydney-masterclass-2026",
    kind: "masterclass",
    badge: "Masterclass",
    title: "Sydney Masterclass: Peak Season Success",
    when: "Wed 27 Aug 2026, 12:30–19:00",
    where: "Melba's Rooftop, Sydney",
    detail: "Retail peak-season playbook across email, SMS, and paid.",
    startDate: "2026-08-27",
    ctaLabel: "Save my spot",
    ctaUrl: "https://visit.bloomreach.com/bloomreach-august-27-sydney-australia-masterclass",
  },
  {
    id: "academy-foundations-live",
    kind: "academy_live",
    badge: "Academy live",
    title: "Engagement Foundations — Live Sessions",
    when: "Upcoming classes on the Academy calendar",
    where: "Virtual · Zoom",
    detail: "Instructor-led sessions covering Data, Campaigns, and Reporting.",
    startDate: "2026-07-29",
    endDate: "2026-12-31",
    ctaLabel: "Register for live sessions",
    ctaUrl: "https://academy.bloomreach.com/engagement-foundations-live-sessions",
  },
  {
    id: "academy-calendar",
    kind: "academy_live",
    badge: "Academy live",
    title: "Bloomreach Academy training calendar",
    when: "Browse all upcoming live sessions",
    where: "Virtual",
    detail: "Filter by Engagement Foundations and other live courses.",
    startDate: "2026-07-29",
    endDate: "2026-12-31",
    ctaLabel: "Open calendar",
    ctaUrl: "https://academy.bloomreach.com/calendar",
  },
  {
    id: "edge-summit-la-2026",
    kind: "edge",
    badge: "Edge",
    title: "The Edge Summit 2026 — Los Angeles",
    when: "9–10 Sep 2026",
    where: "Los Angeles, CA",
    detail: "Theme: The Art of AI. Keynotes, breakouts, and practitioner sessions.",
    startDate: "2026-09-09",
    endDate: "2026-09-10",
    ctaLabel: "View Edge",
    ctaUrl: "https://theedgesummit.com/",
  },
  {
    id: "edge-summit-london-2026",
    kind: "edge",
    badge: "Edge",
    title: "The Edge Summit 2026 — London",
    when: "7–8 Oct 2026",
    where: "London, UK",
    detail: "Theme: The Art of AI. Join Bloomreach’s annual Edge conference.",
    startDate: "2026-10-07",
    endDate: "2026-10-08",
    ctaLabel: "View Edge",
    ctaUrl: "https://theedgesummit.com/",
  },
];

function parseDay(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isUpcoming(event, today = new Date()) {
  const end = parseDay(event.endDate || event.startDate);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return end >= startOfToday;
}

function kindRank(kind) {
  if (kind === "masterclass") return 0;
  if (kind === "academy_live") return 1;
  if (kind === "edge") return 2;
  return 3;
}

/**
 * Upcoming enablement events for the hub card.
 */
export function getEnablementSpotlightEvents(now = new Date()) {
  const upcoming = EVENTS.filter((e) => isUpcoming(e, now)).sort((a, b) => {
    const byKind = kindRank(a.kind) - kindRank(b.kind);
    if (byKind !== 0) return byKind;
    return parseDay(a.startDate) - parseDay(b.startDate);
  });

  const nextMasterclass = upcoming.find((e) => e.kind === "masterclass") || null;
  const academyLive = upcoming.filter((e) => e.kind === "academy_live");
  const edgeEvents = upcoming.filter((e) => e.kind === "edge");
  const featured = upcoming[0] || null;

  return {
    featured,
    nextMasterclass,
    academyLive,
    edgeEvents,
    all: upcoming,
  };
}
