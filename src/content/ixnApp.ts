// src/content/ixnApp.ts
//
// The IXN Workflow Manager is a separate deployment — its own Next.js app and
// its own database — so `/ixn-workflow-manager` gates access and then links
// out to it rather than embedding it: ixn.cs.ucl.ac.uk sends
// `X-Frame-Options: DENY` and a `frame-ancestors 'none'` CSP, so an iframe
// renders nothing. Same reasoning as satHandbook.ts, and the same shape.
//
// The URL itself deliberately is not here. It lives on the App row
// (`App.externalUrl`), which is what makes the registry's `isInternal` flag
// mean anything; this file holds only the copy around it.
//
// The note is load-bearing: until single sign-on between the two apps lands,
// IXN keeps its own accounts and users sign in there separately. Revisit this
// wording when the handoff ships.

export const ixnApp = {
  ctaLabel: "Open the IXN Workflow Manager",
  note: "Opens in a new tab. The IXN Workflow Manager keeps its own accounts, so you will need to sign in again there.",
};
