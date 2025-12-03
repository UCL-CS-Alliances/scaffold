// src/components/talent-discovery/MemberJobBoardOnlyView.tsx
import type { PageCopy } from "@/content/pageCopy";

type Props = {
  copy: PageCopy;
};

export default function MemberJobBoardOnlyView({ copy }: Props) {
  return (
    <section className="content-section">
      <header className="content-header">
        <h1>{copy.title} – Job board</h1>
        <p>
          As a Bronze or Silver member, you can post work opportunities to reach
          UCL Computer Science students and graduates.
        </p>
      </header>

      <p>
        This is where the partner job board interface will appear, allowing you
        to advertise internships, short-term roles, and graduate opportunities.
      </p>
    </section>
  );
}
