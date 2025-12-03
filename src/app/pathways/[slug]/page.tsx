// src/app/pathways/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getPathwayBySlug,
  getServicesForPathway,
  pathways,
} from "@/content/pathways";
import { getStoriesForPathway } from "@/content/stories";

type PathwayPageParams = {
  slug: string;
};

type PathwayPageProps = {
  // Next.js 16 app router: params is a Promise
  params: Promise<PathwayPageParams>;
};

export function generateStaticParams() {
  return pathways.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(
  { params }: PathwayPageProps,
): Promise<Metadata> {
  const { slug } = await params;
  const pathway = getPathwayBySlug(slug);

  if (!pathway) {
    return {
      title: "Pathway not found – Alliances (UCL Computer Science)",
    };
  }

  return {
    title: `${pathway.title} – Alliances (UCL Computer Science)`,
    description: pathway.description,
  };
}

export default async function PathwayPage({ params }: PathwayPageProps) {
  const { slug } = await params;
  const pathway = getPathwayBySlug(slug);

  if (!pathway) {
    notFound();
  }

  const services = getServicesForPathway(pathway.slug);
  const stories = getStoriesForPathway(pathway.slug);

  return (
    <article className="pathway">
      <header>
        <h1>{pathway.title}</h1>
        {pathway.description && <p>{pathway.description}</p>}
      </header>

      {/* Services related to this pathway */}
      {services.length > 0 && (
        <section className="stack" style={{ "--stack-gap": ".5rem" } as React.CSSProperties}>
          <h2>Services</h2>
          <ul className="list-plain stack">
            {services.map((svc) => (
              <li key={svc.slug}>
                <a href={`/services/${svc.slug}`}>{svc.title}</a>
                {svc.description ? ` — ${svc.description}` : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Stories related to this pathway */}
      <section className="stack" style={{ "--stack-gap": ".5rem" } as React.CSSProperties}>
        <h2>Stories</h2>

        {stories.length > 0 ? (
          <ul className="list-plain">
            {stories.map((story) => {
              const dateLabel = new Date(story.date).toLocaleDateString(
                "en-GB",
                {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                },
              );
              return (
                <li key={story.slug}>
                  {/* Path for stories can be decided later; for now, use /stories/<slug> as a placeholder */}
                  <a href={`/stories/${story.slug}`}>{story.title}</a>
                  <time dateTime={story.date}> · {dateLabel}</time>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="small">
            This pathway currently has no published stories.
          </p>
        )}
      </section>
    </article>
  );
}
