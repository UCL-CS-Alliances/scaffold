// src/content/services.ts

export type Audience = "students" | "researchers" | "partners";

export type Service = {
  slug: string;                // e.g. "ixn-workflow"
  title: string;
  description: string;
  audience: Audience[];
  pathways: string[];          // pathway slugs, e.g. "talent"
  actionLabel?: string;
  actionUrl?: string;
  relatedServiceSlugs?: string[];
  showInNav: boolean;
  navActive: boolean;
  navLabel?: string;           // e.g. "CV Library"
  spotlight: boolean;
  // Optional link to an underlying protected app (future use)
  appKey?: string;             // e.g. "IXN_WORKFLOW_MANAGER"
};

export const services: Service[] = [
  // --- Membership Dashboard (from earlier frontmatter) ---
  {
    slug: "dashboard",
    title: "Membership Dashboard",
    description:
      "Track and redeem Friends of UCL Computer Science membership benefits, explore upcoming opportunities, and monitor engagement across projects and events.",
    audience: ["partners"],
    pathways: ["innovation-management"],
    actionLabel: "View your membership dashboard",
    actionUrl: "/membership-dashboard",
    relatedServiceSlugs: ["ixn-workflow", "cv-library"],
    showInNav: true,
    navActive: true,
    spotlight: true,
    appKey: "MEMBERSHIP_DASHBOARD",
  },

  // --- IXN Workflow Manager ---
  {
    slug: "ixn-workflow",
    title: "IXN Workflow Manager",
    description:
      "Manage project data, collaboration details, and student engagement in one place—designed to simplify partnership workflows within the Industry Exchange Network.",
    audience: ["partners"],
    pathways: ["talent", "innovation-management"],
    actionLabel: "Explore the IXN platform",
    actionUrl: "https://ixn.cs.ucl.ac.uk/",
    relatedServiceSlugs: ["ixn-information"],
    showInNav: true,
    navActive: true,
    spotlight: true,
    appKey: "IXN_WORKFLOW_MANAGER",
  },

  // --- CV Library / Talent Discovery (partners) ---
  {
    slug: "cv-library",
    title: "Recruit new talent",
    description:
      "Discover and connect with emerging Computer Science talent by browsing searchable student and graduate CVs.",
    audience: ["partners"],
    pathways: ["talent"],
    actionLabel: "Browse CVs of UCL Computer Science students",
  // Gold+ entry point: CV Library view
  actionUrl: "/talent-discovery?view=cv-library",
    relatedServiceSlugs: ["advertise-a-work-opportunity"],
    showInNav: true,
    navActive: true,
    navLabel: "Recruit talent",
    spotlight: true,
    appKey: "TALENT_DISCOVERY",
  },

  // --- Job board for partners ---
  {
    slug: "advertise-a-work-opportunity",
    title: "Advertise a work opportunity",
    description:
      "Recruit new talent by posting internships, short-term roles, and graduate employment opportunities to the UCL Computer Science jobs board, connecting industry partners with exceptional UCL Computer Science talent.",
    audience: ["partners"],
    pathways: ["talent"],
    actionLabel: "Post to our job board",
  // Silver+ entry point: partner job board
  actionUrl: "/talent-discovery?view=job-board",
    relatedServiceSlugs: ["cv-library"],
    showInNav: true,
    navActive: true,
    spotlight: false,
    appKey: "TALENT_DISCOVERY",
  },

  // --- Job board for students ---
  {
    slug: "find-your-next-job",
    title: "Find your next job",
    description:
      "Browse internships, short-term roles, and graduate employment opportunities on the UCL Computer Science jobs board, connecting industry partners with exceptional Computer Science talent.",
    audience: ["students"],
    pathways: ["talent"],
    actionLabel: "Browse the job board",
  // Student entry point
  actionUrl: "/talent-discovery?view=student",
    relatedServiceSlugs: ["cv-library"],
    showInNav: true,
    navActive: true,
    spotlight: true,
    appKey: "TALENT_DISCOVERY",
  },

  // --- Executive Education & Professional Development ---
  {
    slug: "executive-education",
    title: "Executive Education & Professional Development",
    description:
      "Co-design bespoke executive education experiences with UCL experts, access tailored learning resources, and monitor progress through an interactive dashboard.",
    audience: ["partners"],
    pathways: ["learning-and-development"],
    actionLabel: "Explore our online studio for Executive Education",
    actionUrl: "/404/",
    relatedServiceSlugs: ["learning-hub"],
    showInNav: true,
    navActive: false,
    spotlight: true,
  },

  // --- Knowledge Hub ---
  {
    slug: "knowledge-hub",
    title: "Knowledge Hub",
    description:
      "Explore resources, case studies, and guides, curated by the Alliances team and our knowledge partners, that help researchers and students understand research translation, entrepreneurship, and commercialisation pathways.",
    audience: ["students", "researchers"],
    pathways: ["learning-and-development"],
    actionLabel: "Explore the Knowledge Hub",
    actionUrl: "/404/",
    relatedServiceSlugs: ["learning-hub", "executive-education"],
    showInNav: true,
    navActive: false,
    spotlight: false,
  },

  // --- Learning Hub ---
  {
    slug: "learning-hub",
    title: "Learning Hub",
    description:
      "Develop innovation and entrepreneurship skills through an interactive learning management system offering curated courses, resources, and progress tracking.",
    audience: ["students", "researchers"],
    pathways: ["learning-and-development"],
    actionLabel: "Explore the Learning Hub",
    actionUrl: "/404/",
    relatedServiceSlugs: ["knowledge-hub", "executive-education"],
    showInNav: true,
    navActive: false,
    spotlight: true,
  },

  // --- Innovation Exchange ---
  {
    slug: "innovation-exchange",
    title: "Innovation Exchange",
    description:
      "Offer or request time and expertise within the department to support innovation activities through a time-barter system that values shared contribution.",
    audience: ["students", "researchers"],
    pathways: ["social-innovation"],
    actionLabel: "Experience the innovation culture at UCL Computer Science",
    actionUrl: "/404/",
    showInNav: true,
    navActive: false,
    spotlight: true,
  },

  // --- Meet a Co-Founder ---
  {
    slug: "co-founders",
    title: "Meet a Co-Founder",
    description:
      "Meet potential co-founders, collaborators, and innovators through a series of networking events and a profile-driven matching tool that helps turn ideas into ventures.",
    audience: ["students", "researchers"],
    pathways: ["social-innovation"],
    actionLabel: "Find your business partner",
    actionUrl: "/404/",
    showInNav: true,
    navActive: false,
    spotlight: true,
  },

  // --- Mentoring Hub ---
  {
    slug: "mentoring-hub",
    title: "Mentoring Hub",
    description:
      "We connect mentors and mentees across UCL Computer Science to share knowledge, develop skills, and strengthen the innovation community.",
    audience: ["students", "researchers", "partners"],
    pathways: ["social-innovation"],
    actionLabel: "Explore the Mentoring Hub",
    actionUrl: "/404/",
    showInNav: true,
    navActive: false,
    spotlight: true,
  },
];

export function getServiceBySlug(slug: string): Service | undefined {
  return services.find((s) => s.slug === slug);
}

export function getServicesForAudience(audience: Audience): Service[] {
  return services
    .filter(
      (s) =>
        s.showInNav &&
        s.audience.includes(audience),
    )
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getRelatedServices(service: Service): Service[] {
  if (!service.relatedServiceSlugs?.length) return [];
  return services
    .filter((s) => service.relatedServiceSlugs!.includes(s.slug))
    .sort((a, b) => a.title.localeCompare(b.title));
}
