// prisma/backfill-benefit-progress.ts
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { pathToFileURL } from 'url';

//
// ─────────────────────────────────────────────────────────────
//   One-off backfill: benefit progress for historical redemptions
// ─────────────────────────────────────────────────────────────
//
// Since 2026-08-12, a stepped benefit's redemption is *equivalent* to all of
// its steps being complete, and saveBenefitActionProgressAction keeps the two
// in sync on every save. Benefits redeemed before step tracking existed have
// the redemption flag but zero progress rows, so they would show as
// out-of-sync in the admin checklist until someone re-saved each one.
//
// This script converges the historical state once: for every organisation and
// every redeemed benefit that has steps, it creates the missing completed
// progress rows. completedAt is the run time (the true completion dates were
// never recorded — an accepted invention), completedById is null, and no
// audit rows are written: this is a data migration, not an admin action.
//
// Idempotent (createMany + skipDuplicates against the composite unique), and
// a DRY RUN by default — pass --apply to write. It never deletes anything and
// never changes redeemedBenefitCodes; fully-ticked-but-unredeemed benefits
// (e.g. from pre-equivalence testing) are only reported, since auto-redeeming
// from test ticks would be wrong. Resolve those by re-saving the benefit in
// the admin checklist.
//
// Run against the shared database AFTER the BenefitActionProgress migration:
//   npx tsx prisma/backfill-benefit-progress.ts            (dry run)
//   npx tsx prisma/backfill-benefit-progress.ts --apply
//

async function backfill(prisma: PrismaClient, apply: boolean) {
  const benefits = await prisma.benefit.findMany({
    select: {
      code: true,
      actions: { select: { id: true }, orderBy: { position: 'asc' } },
    },
  });
  const stepsByCode = new Map(
    benefits.map((b) => [b.code, b.actions.map((a) => a.id)]),
  );

  const members = await prisma.membershipDashboardMember.findMany({
    select: {
      organisationId: true,
      memberKey: true,
      redeemedBenefitCodes: true,
    },
  });

  const existing = await prisma.benefitActionProgress.findMany({
    select: { organisationId: true, benefitActionId: true },
  });
  const existingKeys = new Set(
    existing.map((r) => `${r.organisationId}:${r.benefitActionId}`),
  );

  const now = new Date();
  const creates: {
    organisationId: number;
    benefitActionId: number;
    completedAt: Date;
  }[] = [];

  for (const member of members) {
    for (const code of member.redeemedBenefitCodes) {
      const stepIds = stepsByCode.get(code);
      if (!stepIds || stepIds.length === 0) continue;

      const missing = stepIds.filter(
        (id) => !existingKeys.has(`${member.organisationId}:${id}`),
      );
      if (missing.length === 0) continue;

      console.log(
        `  - ${member.memberKey}: ${code} redeemed, ${missing.length}/${stepIds.length} step(s) missing progress`,
      );
      creates.push(
        ...missing.map((benefitActionId) => ({
          organisationId: member.organisationId,
          benefitActionId,
          completedAt: now,
        })),
      );
    }

    // Reverse divergence: report only (see header comment).
    for (const [code, stepIds] of stepsByCode) {
      if (stepIds.length === 0) continue;
      if (member.redeemedBenefitCodes.includes(code)) continue;
      const ticked = stepIds.filter((id) =>
        existingKeys.has(`${member.organisationId}:${id}`),
      );
      if (ticked.length === stepIds.length) {
        console.log(
          `  ! ${member.memberKey}: ${code} has every step ticked but is NOT redeemed — re-save it in the admin checklist to sync`,
        );
      }
    }
  }

  if (creates.length === 0) {
    console.log('Nothing to backfill — progress already matches redemption.');
    return;
  }

  if (!apply) {
    console.log(
      `DRY RUN: would create ${creates.length} progress row(s). Re-run with --apply to write.`,
    );
    return;
  }

  const result = await prisma.benefitActionProgress.createMany({
    data: creates,
    skipDuplicates: true,
  });
  console.log(`Backfilled ${result.count} progress row(s).`);
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  // Same env handling as prisma/seed-benefits.ts: exported URLs win over both
  // of .env.local's, then .env.local, then .env, preferring DIRECT_URL.
  const exportedUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

  config({ path: '.env.local', quiet: true });
  config({ path: '.env', quiet: true });

  const url = exportedUrl || process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'No database URL: set DIRECT_URL or DATABASE_URL (see .env.example).',
    );
  }

  const apply = process.argv.includes('--apply');
  console.log(
    apply
      ? 'Backfilling benefit progress…'
      : 'Backfilling benefit progress (DRY RUN)…',
  );

  const prisma = new PrismaClient({ datasourceUrl: url });

  backfill(prisma, apply)
    .catch((e) => {
      console.error('Backfill error:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
