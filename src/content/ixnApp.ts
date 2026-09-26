// src/content/ixnApp.ts
//
// The IXN Workflow Manager is a separate deployment — its own Next.js app and
// its own database — so `/ixn-workflow-manager` gates access and then links
// out to it rather than embedding it: ixn.uclcomputerscience.org sends
// `X-Frame-Options: DENY` and a `frame-ancestors 'none'` CSP, so an iframe
// renders nothing. Same reasoning as satHandbook.ts, and the same shape.
//
// The URL itself deliberately is not here. It lives on the App row
// (`App.externalUrl`), which is what makes the registry's `isInternal` flag
// mean anything; this file holds only the copy around it.
//
// Two notes because there are two ways in. With the handoff configured
// (`IXN_HANDOFF_SECRET` + `IXN_HANDOFF_CALLBACK_URL`, see lib/ixn-handoff.ts)
// the CTA goes through `/api/handoff/ixn` and the user arrives signed in;
// without it the CTA is the plain external link and IXN asks them to sign in
// with its own account. The page picks the note that matches the link.

export const ixnApp = {
  ctaLabel: "Open the IXN Workflow Manager",
  handoffNote:
    "Opens in a new tab. You will be signed in to the IXN Workflow Manager with your Alliances account.",
  note: "Opens in a new tab. The IXN Workflow Manager keeps its own accounts, so you will need to sign in again there.",
};
