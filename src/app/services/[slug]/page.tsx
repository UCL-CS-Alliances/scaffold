// src/app/services/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServiceBySlug, getRelatedServices } from "@/content/services";
import { pathways } from "@/content/pathways";

type ServicePageParams = {
  slug: string;
};

type ServicePageProps = {
  // Next.js 16: params is a Promise
  params: Promise<ServicePageParams>;
};

export function generateStaticParams() {
  // Pre-generate /services/<slug> for all services
  const { services } = require("@/content/services") as typeof import("@/content/services");
  return services.map((svc) => ({ slug: svc.slug }));
}

export async function generateMetadata(
  { params }: ServicePageProps,
): Promise<Metadata> {
  const { slug } = await params;
  const service = getServiceBySlug(slug);

  if (!service) {
    return {
      title: "Service not found – Alliances (UCL Computer Science)",
    };
  }

  return {
    title: `${service.title} – Alliances (UCL Computer Science)`,
    description: service.description,
  };
}

export default async function ServicePage({ params }: ServicePageProps) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);

  if (!service) {
    notFound();
  }

  const related = getRelatedServices(service);

  const audienceLabel = service.audience.join(", ");

  const servicePathways = pathways.filter((p) =>
    service.pathways.includes(p.slug),
  );

  return (
    <article className="service">
      <header>
        <h1>{service.title}</h1>
        {service.description && <p>{service.description}</p>}
      </header>

      {service.actionUrl && (
        <p>
          <a
            className="btn"
            href={service.actionUrl}
            {...(service.actionUrl.startsWith("http")
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {service.actionLabel ?? "Learn more"}
          </a>
        </p>
      )}

      {/* Placeholder for richer body content, if you add it later */}
      {/* <section>More detailed content can go here.</section> */}

      {related.length > 0 && (
        <section className="related-services">
          <h2>Related services</h2>
          <ul className="list-plain cluster">
            {related.map((s) => (
              <li key={s.slug}>
                <a className="pill" href={`/services/${s.slug}`}>
                  {s.navLabel ?? s.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <hr />

      <h3>Service information</h3>

      {service.audience.length > 0 && (
        <p>
          <strong>Audience:</strong> {audienceLabel}
        </p>
      )}

      {servicePathways.length > 0 && (
        <p>
          <strong>Pathway:</strong>{" "}
          {servicePathways.map((p, idx) => (
            <span key={p.slug}>
              {/* For now, link to placeholder /pathways/<slug>, which we can flesh out next step */}
              <a href={`/pathways/${p.slug}`}>{p.title}</a>
              {idx < servicePathways.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
      )}
    </article>
  );
}
