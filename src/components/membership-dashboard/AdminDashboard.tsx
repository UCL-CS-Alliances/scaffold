// src/components/membership-dashboard/AdminDashboard.tsx
import AdminDashboardClient from "./AdminDashboardClient";
import type { AdminDashboardSummary } from "@/lib/membership-dashboard";
import type {
  AdminBenefitAuditEntry,
  AdminBenefitRedemptionStat,
  AdminMemberListItem,
  AdminSelectedMember,
} from "@/lib/membership-dashboard-admin";
import type { HandbookRenderResult } from "@/lib/handbook";
import type { CatalogueBenefit } from "@/lib/benefits";

type AdminDashboardProps = AdminDashboardSummary & {
  title?: string;
  intro?: string;

  totalUsers: number;
  payingRevenue: number;
  mostUtilisedBenefitLabel: string;

  members: AdminMemberListItem[];
  selectedUserId?: string | null;
  selectedMember: AdminSelectedMember | null;

  benefits: CatalogueBenefit[];
  benefitStats: AdminBenefitRedemptionStat[];
  benefitAuditTrail: AdminBenefitAuditEntry[];

  initialTab?: string | null;
  handbook: HandbookRenderResult;
};

function gbp(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function AdminDashboard({
  totalMemberOrganisations,
  title = "Membership Dashboard – Admin View",
  intro,
  totalUsers,
  payingRevenue,
  mostUtilisedBenefitLabel,
  members,
  selectedUserId = null,
  selectedMember,
  benefits,
  benefitStats,
  benefitAuditTrail,
  initialTab = null,
  handbook,
}: AdminDashboardProps) {
  return (
    <section className="content-section">
      <header className="content-header">
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </header>

      <div className="admin-dashboard">
        <section className="admin-section">
          <h2 style={{ marginTop: 0 }}>Overview</h2>

          <p>
            The platform has <strong>{totalUsers}</strong> registered users.{" "}
            <strong>{totalMemberOrganisations}</strong> organisations are members
            of the Friends of UCL Computer Science programme, bringing in{" "}
            <strong>{gbp(payingRevenue)}</strong> revenue. The most utilised
            benefit is <strong>{mostUtilisedBenefitLabel}</strong>.
          </p>
        </section>

        <AdminDashboardClient
          members={members}
          selectedUserId={selectedUserId}
          selectedMember={selectedMember}
          benefits={benefits}
          benefitStats={benefitStats}
          benefitAuditTrail={benefitAuditTrail}
          initialTab={initialTab}
          handbook={handbook}
        />
      </div>
    </section>
  );
}
