/**
 * Upcoming Bloomreach enablement events for the hub spotlight.
 * Dates are compared in local time against "today".
 */

const EVENTS = [
  {
    id: "sydney-masterclass-2026",
    kind: "masterclass",
    badge: "You're invited · Next masterclass",
    title: "Sydney Masterclass: Peak Season Success",
    when: "Wed 27 Aug 2026, 12:30–19:00",
    where: "Melba's Rooftop, Sydney",
    detail: "Retail peak-season playbook across email, SMS, and paid.",
    startDate: "2026-08-27",
    ctaLabel: "Save my spot →",
    ctaUrl: "https://visit.bloomreach.com/bloomreach-august-27-sydney-australia-masterclass",
  },
  {
    id: "edge-summit-la-2026",
    kind: "edge",
    badge: "Edge Summit · Los Angeles",
    title: "The Edge Summit 2026 — Los Angeles",
    when: "9–10 Sep 2026",
    where: "Los Angeles, CA",
    detail: "Theme: The Art of AI. Keynotes, breakouts, and practitioner sessions.",
    startDate: "2026-09-09",
    endDate: "2026-09-10",
    ctaLabel: "View Edge →",
    ctaUrl: "https://theedgesummit.com/",
  },
  {
    id: "edge-summit-london-2026",
    kind: "edge",
    badge: "Edge Summit · London",
    title: "The Edge Summit 2026 — London",
    when: "7–8 Oct 2026",
    where: "London, UK",
    detail: "Theme: The Art of AI. Join Bloomreach’s annual Edge conference.",
    startDate: "2026-10-07",
    endDate: "2026-10-08",
    ctaLabel: "View Edge →",
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

/**
 * Next masterclass (if any) plus upcoming Edge events.
 */
export function getEnablementSpotlightEvents(now = new Date()) {
  const upcoming = EVENTS.filter((e) => isUpcoming(e, now));
  const nextMasterclass = upcoming.find((e) => e.kind === "masterclass") || null;
  const edgeEvents = upcoming.filter((e) => e.kind === "edge");
  const featured = nextMasterclass || edgeEvents[0] || null;
  return {
    featured,
    nextMasterclass,
    edgeEvents,
    all: featured
      ? [featured, ...upcoming.filter((e) => e.id !== featured.id)]
      : upcoming,
  };
}
