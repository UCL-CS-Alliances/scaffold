// src/content/pageCopy.ts

export type PageKey =
  | "membershipDashboard"
  | "ixnWorkflowManager"
  | "talentDiscovery";

export type PageCopy = {
  key: PageKey;
  title: string;
  description: string;
  unauthenticatedIntro?: string;
  adminTitle?: string;
  adminIntro?: string;
};

export const pageCopy: Record<PageKey, PageCopy> = {
  membershipDashboard: {
    key: "membershipDashboard",
    title: "Membership Dashboard",
    description:
      "The Membership Dashboard gives you a single place to review your partnership details, membership tier, and access to Alliances apps such as IXN Workflow Manager and Talent Discovery.",
    unauthenticatedIntro:
      "Sign in below with your Alliances account to access your dashboard.",
    adminTitle: "Membership Dashboard – Admin View",
    adminIntro:
      "As an admin, you can see an overview of members across all tiers.",
  },

  ixnWorkflowManager: {
    key: "ixnWorkflowManager",
    title: "IXN Workflow Manager",
    description:
      "The IXN Workflow Manager supports partners, academics, and module leaders to propose, allocate, and track real-world projects integrated into teaching.",
    unauthenticatedIntro:
      "Silver, Gold, and Platinum members can access the full IXN app. Sign in below using your Alliances account.",
  },

  talentDiscovery: {
    key: "talentDiscovery",
    title: "Talent Discovery",
    description:
      "Talent Discovery helps partners find students and graduates with the right skills, interests, and values for internships and early-career roles.",
    unauthenticatedIntro:
      "Gold and Platinum members can access the full Talent Discovery app. Sign in below to view your tailored talent tools.",
  },
};
