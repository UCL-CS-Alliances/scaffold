// src/content/pathways.ts
import { services } from "./services";

export type Pathway = {
  slug: string;
  title: string;
  description: string;
  weight: number;
};

export const pathways: Pathway[] = [
  {
    slug: "talent",
    title: "Shine & Find Your Talent",
    description:
      "Connecting students with opportunities for solving real-world challenges, and helping industry partners discover exceptional talent through collaborative student projects, internships, and research-driven innovation at low-risk.",
    weight: 1,
  },
  {
    slug: "learning-and-development",
    title: "Learning & Development",
    description:
      "We support students and researchers build innovation and entrepreneurship skills through CPD opportunities, tailored resources, and hands-on capacity-building activities; while industry partners will advance their technical insight and leadership potential through CPD and Executive Education programmes focused on the latest developments in computer science.",
    weight: 2,
  },
  {
    slug: "social-innovation",
    title: "Social innovation",
    description:
      "Join a vibrant community of innovators—find co-founders, exchange expertise, and grow ideas through mentoring, collaboration, and peer-to-peer support.",
    weight: 3,
  },
  {
    slug: "innovation-management",
    title: "Innovation Management",
    description:
      "Empower industry partners to manage their innovation portfolio and academic collaborations through tools that track projects, benefits, and engagement with students and researchers. Access tailored digital platforms—like the Member’s Dashboard and IXN Partner Portal—to streamline participation and maximise partnership value.",
    weight: 4,
  },
];

export function getPathwaysSorted(): Pathway[] {
  return [...pathways].sort((a, b) => a.weight - b.weight);
}

export function getPathwayBySlug(slug: string): Pathway | undefined {
  return pathways.find((p) => p.slug === slug);
}

export function getServicesForPathway(pathwaySlug: string) {
  return services
    .filter((s) => s.pathways.includes(pathwaySlug))
    .sort((a, b) => a.title.localeCompare(b.title));
}

// existing helper for home spotlights
export function getSpotlightServicesForPathway(pathwaySlug: string) {
  return services
    .filter(
      (s) => s.spotlight && s.pathways.includes(pathwaySlug),
    )
    .sort((a, b) => a.title.localeCompare(b.title));
}
