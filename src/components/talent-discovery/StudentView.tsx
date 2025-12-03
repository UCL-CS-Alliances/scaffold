// src/components/talent-discovery/StudentView.tsx
import type { PageCopy } from "@/content/pageCopy";

type Props = {
  copy: PageCopy;
};

export default function StudentView({ copy }: Props) {
  return (
    <section className="content-section">
      <header className="content-header">
        <h1>{copy.title} – Student view</h1>
        <p>
          Browse internships, short-term roles, and graduate opportunities
          curated for UCL Computer Science students.
        </p>
      </header>

      <p>
        This is where the student-facing Talent Discovery interface will appear,
        including the job board tailored to your skills and interests.
      </p>
    </section>
  );
}
