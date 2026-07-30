/**
 * Account support / escalation contacts for the Success & Support pillar.
 * Demo contacts for now; later these can be filled from Salesforce/Glean.
 */

export function getDemoAccountContacts(project = {}) {
  const account =
    String(project.name || project.workspace || "this account").trim() || "this account";

  return {
    demo: true,
    accountName: account,
    note: "Request types by person, with escalation points.",
    footer: "If an issue is unresolved or urgent, escalate through your CSM first.",
    rows: [
      {
        enquiry: "Contractual Questions",
        detail: "Renewals, upgrades, add-ons, pricing, contract terms",
        firstContact: {
          role: "AM",
          name: "Alex Morgan",
          title: "Account Manager",
          initials: "AM",
        },
        escalation: {
          role: "AE Manager",
          name: "Jordan Blake",
          title: "Account Executive Manager",
          initials: "JB",
        },
      },
      {
        enquiry: "General Engagement Questions",
        detail: "Day-to-day platform questions, use case planning, campaign strategy, training requests",
        firstContact: {
          role: "Engagement CSM",
          name: "Sam Rivera",
          title: "Customer Success Manager",
          initials: "SR",
        },
        escalation: {
          role: "Engagement CSM Manager",
          name: "Priya Shah",
          title: "CSM Manager",
          initials: "PS",
        },
      },
      {
        enquiry: "General Discovery Questions",
        detail: "Day-to-day platform questions, use case planning, campaign strategy, training requests",
        firstContact: {
          role: "Discovery CSM",
          name: "Casey Nguyen",
          title: "Customer Success Manager",
          initials: "CN",
        },
        escalation: {
          role: "Discovery CSM Manager",
          name: "Morgan Ellis",
          title: "CSM Manager",
          initials: "ME",
        },
      },
      {
        enquiry: "Technical Issues",
        detail: "Bug reports, technical issues, platform errors — submit via support@bloomreach.com",
        firstContact: {
          role: "Bloomreach Support",
          name: "Bloomreach Support",
          title: "support.bloomreach.com",
          initials: "b",
          url: "https://support.bloomreach.com/",
          isSupport: true,
        },
        escalation: {
          role: "AM / AE + CSM",
          name: "Alex Morgan · Sam Rivera",
          title: "Account team + Engagement CSM",
          initials: "AS",
        },
      },
    ],
  };
}
