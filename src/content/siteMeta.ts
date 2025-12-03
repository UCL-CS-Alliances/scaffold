// src/content/siteMeta.ts
import pkg from "../../package.json";

export type Announcement = {
  enabled: boolean;
  text: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export const siteAnnouncement: Announcement = {
  enabled: true,
  text: "This site is released as a closed alpha version. All feedback welcome.",
  ctaLabel: "Share feedback",
  ctaHref: "/feedback",
};

export const siteMeta = {
  // Version from package.json (single source of truth)
  version: pkg.version,
  // Status label you control manually
  status: "closed alpha",

  // From _data/site.yml
  tagline: "We bond the pioneers of our future",
  mission:
    "In alliance with our collaborators, we empower our students to learn from real-world challenges, our academics to apply their research rigour in practice, and our industry partners to innovate with confidence at low risk.",
};
