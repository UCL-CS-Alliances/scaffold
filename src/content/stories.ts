// src/content/stories.ts

export type Story = {
  slug: string;          // e.g. "alliance-kickoff-2025"
  title: string;
  date: string;          // ISO, e.g. "2025-10-08"
  pathways: string[];    // pathway slugs it belongs to
};

export const stories: Story[] = [
  // Empty for now – add items as needed
  // {
  //   slug: "example-story",
  //   title: "Example Story",
  //   date: "2025-10-08",
  //   pathways: ["talent"],
  // },
];

export function getStoriesForPathway(pathwaySlug: string): Story[] {
  return stories
    .filter((s) => s.pathways.includes(pathwaySlug))
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
}
