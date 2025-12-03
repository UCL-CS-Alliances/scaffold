// src/components/talent-discovery/MemberFullView.tsx
import type { PageCopy } from "@/content/pageCopy";

type Props = {
  copy: PageCopy;
};

export default function MemberFullView({ copy }: Props) {
  return (
    <section className="content-section">
      <header className="content-header">
        <h1>{copy.title} – Full access</h1>
        <p>
          As a Gold or Platinum member, you can both post work opportunities and
          browse CVs of UCL Computer Science students and graduates.
        </p>
      </header>

      <p>
        This is where the full Talent Discovery interface will appear, combining
        the partner job board with the CV Library tooling.
      </p>
    </section>
  );
}
