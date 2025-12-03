// src/app/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react"; // for the style cast
import { siteMeta } from "@/content/siteMeta";
import {
  getPathwaysSorted,
  getSpotlightServicesForPathway,
} from "@/content/pathways";

export const metadata: Metadata = {
  title: "Home – Alliances (UCL Computer Science)",
  description:
    "A scaffold site for enhancing the Alliances digital experience at UCL Computer Science.",
};

export default function HomePage() {
  const paths = getPathwaysSorted();

  return (
    <>
      <section className="home-intro">
        <h1>{siteMeta.tagline}</h1>
        <p>{siteMeta.mission}</p>
      </section>

      <section className="home-pathways">
        <h2>Collaboration pathways</h2>
        <p>
          Explore ways you can begin collaborateing within the innovation
          ecosystem of UCL Computer Science.
        </p>

        <div className="grid">
          {paths.map((p) => {
            const spotlights = getSpotlightServicesForPathway(p.slug);

            return (
              <div key={p.slug} className="card tile tile--gradient">
                <h3>
                  <Link href={`/pathways/${p.slug}`}>{p.title}</Link>
                </h3>

                {p.description && <p>{p.description}</p>}

                {spotlights.length > 0 && (
                  <div
                    className="spotlight stack"
                    style={{ "--stack-gap": ".5rem" } as CSSProperties}
                  >
                    <h4 className="spotlight-title">Service spotlight</h4>
                    <ul className="list-plain cluster">
                      {spotlights.map((svc) => (
                        <li key={svc.slug}>
                          <Link
                            className="pill"
                            href={`/services/${svc.slug}`}
                          >
                            {svc.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Simple placeholder for News list; you can wire this to a releases/news model later */}
      {/* <section className="home-news">
        <h2>News</h2>
        ...
      </section> */}
    </>
  );
}
