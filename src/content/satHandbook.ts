// src/content/satHandbook.ts
//
// The Strategic Alliances Team handbook is maintained in the team's Confluence
// workspace. The admin dashboard's Handbook tab links out to it rather than
// embedding it: Confluence Cloud sends `X-Frame-Options: SAMEORIGIN` on every
// wiki page (and `DENY` on the Atlassian login it redirects to), so an iframe
// renders nothing, and a copy kept in this repo drifts out of date.

export const satHandbook = {
  title: "SAT handbook",
  description:
    "The Strategic Alliances Team's internal documentation is compiled into the SAT handbook in Confluence, where the team can edit it without a deploy.",
  ctaLabel: "Open the SAT handbook in Confluence",
  url: "https://ucl-cs-alliances.atlassian.net/wiki/spaces/SAT/overview",
  note: "Opens in a new tab and requires an Atlassian sign-in.",
};
