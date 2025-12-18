// src/components/membership-dashboard/HandbookPanel.tsx
import Link from "next/link";
import { renderHandbookChapterBySlug } from "@/lib/handbook";

export default async function HandbookPanel(props: { chapterSlug?: string | null }) {
  const slug = props.chapterSlug ?? "toc"; // if you create "00-toc.md" it will become "toc"
  const { chapters, active, html, prev, next } = await renderHandbookChapterBySlug(slug);

  return (
    <div className="handbook">
      <div className="handbook-grid">
        <nav aria-label="Handbook table of contents" className="handbook-toc">
          <h4 style={{ marginTop: 0 }}>Contents</h4>
          <ol>
            {chapters.map((c) => (
              <li key={c.slug}>
                {c.slug === active.slug ? (
                  <strong aria-current="page">{c.title}</strong>
                ) : (
                  <Link href={`/membership-dashboard?chapter=${encodeURIComponent(c.slug)}&tab=handbook`}>
                    {c.title}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <article className="handbook-content">
          <div className="handbook-pager" aria-label="Handbook navigation">
            {prev ? (
              <Link className="button-link button-link--secondary"
                href={`/membership-dashboard?chapter=${encodeURIComponent(prev.slug)}&tab=handbook`}>
                Previous
              </Link>
            ) : (
              <button className="button-link button-link--secondary" disabled aria-disabled="true">
                Previous
              </button>
            )}

            <Link className="button-link button-link--secondary"
              href={`/membership-dashboard?chapter=${encodeURIComponent(chapters[0]?.slug ?? "toc")}&tab=handbook`}>
              Table of contents
            </Link>

            {next ? (
              <Link className="button-link button-link--secondary"
                href={`/membership-dashboard?chapter=${encodeURIComponent(next.slug)}&tab=handbook`}>
                Next
              </Link>
            ) : (
              <button className="button-link button-link--secondary" disabled aria-disabled="true">
                Next
              </button>
            )}
          </div>

          <div className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </div>
    </div>
  );
}
