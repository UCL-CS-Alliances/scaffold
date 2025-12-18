// src/lib/handbook.ts
import fs from "node:fs/promises";
import path from "node:path";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

export type HandbookChapter = {
  slug: string;     // derived from filename
  title: string;    // derived from first H1 or fallback
  filename: string; // actual filename
};

const HANDBOOK_DIR = path.join(process.cwd(), "src", "content", "handbook");

function slugFromFilename(filename: string) {
  return filename
    .replace(/\.md$/, "")
    .replace(/^\d+-/, ""); // allow "01-intro.md" → "intro"
}

function titleFromMarkdown(md: string, fallback: string) {
  const match = md.match(/^#\s+(.+)\s*$/m);
  return match?.[1]?.trim() || fallback;
}

export async function getHandbookChapters(): Promise<HandbookChapter[]> {
  const files = (await fs.readdir(HANDBOOK_DIR))
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .sort((a, b) => a.localeCompare(b, "en"));

  const chapters: HandbookChapter[] = [];
  for (const filename of files) {
    const full = path.join(HANDBOOK_DIR, filename);
    const md = await fs.readFile(full, "utf8");
    const slug = slugFromFilename(filename);
    chapters.push({
      slug,
      filename,
      title: titleFromMarkdown(md, slug),
    });
  }
  return chapters;
}

export async function renderHandbookChapterBySlug(slug: string) {
  const chapters = await getHandbookChapters();
  const idx = Math.max(0, chapters.findIndex((c) => c.slug === slug));
  const active = chapters[idx] ?? chapters[0];

  const md = await fs.readFile(path.join(HANDBOOK_DIR, active.filename), "utf8");
  const html = String(
    await remark().use(remarkGfm).use(remarkHtml).process(md),
  );

  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx < chapters.length - 1 ? chapters[idx + 1] : null;

  return { chapters, active, html, prev, next };
}
