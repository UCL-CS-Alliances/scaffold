// prisma/seed-benefits.ts
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { pathToFileURL } from 'url';
import { BENEFITS } from './fixtures/benefits';

//
// ─────────────────────────────────────────────────────────────
//   Benefit catalogue seed
// ─────────────────────────────────────────────────────────────
//
// Seeds the Benefit and BenefitAction tables from the fixture in
// fixtures/benefits.ts, which the application no longer reads — the catalogue
// is resolved from the database by src/lib/benefits.ts, and this is only its
// starting set. Deliberately separate from prisma/seed.ts and runnable on its own
// (`npm run db:seed:benefits`), because the main seed also upserts
// organisations, users and memberships from members.yml — running that against
// a live database would rewrite real partner records. This script touches
// reference data only, and never anything partner-scoped.
//
// It is a *hard re-baseline*, not an additive seed: the fixture wins
// completely. Every fixture benefit is overwritten with isActive forced back
// to true, and any benefit the fixture does not define — i.e. one created
// through the admin UI — is retired, never deleted. Deleting would cascade
// its action steps, partner notes and tracker progress rows, and leave any
// redeemed code nothing can resolve. Because that destroys admin catalogue
// edits, the standalone entry point refuses to run without --force
// (`npm run db:seed:benefits -- --force`).
//

/**
 * Reconcile a benefit's steps against the fixture **by position**, rather than
 * deleting and recreating them.
 *
 * BenefitAction.id is a stable handle: the per-partner action tracker will hang
 * progress rows off it with ON DELETE CASCADE. A delete-and-recreate seeder
 * would therefore wipe every partner's recorded progress on every run, even
 * when the steps had not changed at all. Updating in place keeps the ids.
 */
async function syncBenefitActions(
  prisma: PrismaClient,
  benefitId: number,
  bodies: string[],
): Promise<number> {
  const existing = await prisma.benefitAction.findMany({
    where: { benefitId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });

  for (const [position, body] of bodies.entries()) {
    const current = existing[position];

    if (current) {
      await prisma.benefitAction.update({
        where: { id: current.id },
        data: { position, body },
      });
    } else {
      await prisma.benefitAction.create({
        data: { benefitId, position, body },
      });
    }
  }

  // Steps dropped from the fixture: only the surplus tail goes, so the ids of
  // the steps that remain are untouched.
  const surplus = existing.slice(bodies.length).map((a) => a.id);

  if (surplus.length > 0) {
    await prisma.benefitAction.deleteMany({ where: { id: { in: surplus } } });
  }

  return bodies.length;
}

export async function seedBenefits(prisma: PrismaClient) {
  console.log('Seeding benefit catalogue…');

  // Catalogue tier keys are lowercase ("silver"); MembershipTier.key is
  // uppercase. Resolve the whole set once rather than per benefit.
  const tiers = await prisma.membershipTier.findMany({
    select: { id: true, key: true },
  });
  const tierIdByKey = new Map(tiers.map((t) => [t.key.toLowerCase(), t.id]));

  // Tiers are a precondition, not something this script creates — it stays a
  // catalogue-only seeder. Fail loudly rather than half-seeding.
  const missingTiers = [...new Set(BENEFITS.map((b) => b.tierMin))].filter(
    (key) => !tierIdByKey.has(key),
  );

  if (missingTiers.length > 0) {
    throw new Error(
      `Membership tiers not found: ${missingTiers.join(', ')}. Run \`npm run db:seed\` first.`,
    );
  }

  for (const [index, benefit] of BENEFITS.entries()) {
    const fields = {
      label: benefit.label,
      description: benefit.description,
      category: benefit.category,
      tierMinId: tierIdByKey.get(benefit.tierMin)!,
      trigger: benefit.process?.trigger ?? null,
      outcome: benefit.process?.outcome ?? null,
      terms: benefit.terms ?? [],
      supersedesCodes: benefit.supersedes ?? [],
      sortOrder: index,
      // The re-baseline un-retires: a fixture benefit an admin retired comes
      // back, because the fixture says it exists and is live.
      isActive: true,
    };

    const row = await prisma.benefit.upsert({
      where: { code: benefit.id },
      create: { code: benefit.id, ...fields },
      update: fields,
    });

    const actionCount = await syncBenefitActions(
      prisma,
      row.id,
      benefit.process?.actions ?? [],
    );

    console.log(
      `  - benefit ${row.code} -> id=${row.id}, tierMinId=${row.tierMinId}, actions=${actionCount}, terms=${fields.terms.length}`,
    );
  }

  // The other half of the re-baseline: anything the fixture does not define
  // was created through the admin UI, and gets retired — never deleted, which
  // would cascade steps, notes and progress and dangle redeemed codes. The
  // isActive filter keeps a second consecutive run a no-op.
  const retired = await prisma.benefit.updateMany({
    where: {
      code: { notIn: BENEFITS.map((b) => b.id) },
      isActive: true,
    },
    data: { isActive: false },
  });

  if (retired.count > 0) {
    console.log(`  - retired ${retired.count} benefit(s) not in the fixture`);
  }

  console.log(`Benefit catalogue seeded (${BENEFITS.length} benefits).`);
}

// Standalone entry point for `npm run db:seed:benefits`. Guarded so that
// importing seedBenefits from prisma/seed.ts does not also run it.
const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  // A destructive reset guarded only by documentation is how the wipe
  // happens: this command's name still says "seed" while its semantics are
  // "reset to fixture", and the runbook points it at the shared database. The
  // guard lives here, in the standalone entry, and deliberately not around
  // seedBenefits itself — prisma/seed.ts calls that on databases where the
  // main seed is already forbidden for stronger reasons. A flag rather than a
  // prompt so CI (which runs this twice, non-interactively) exercises the
  // same code path an operator does.
  if (!process.argv.includes('--force')) {
    console.error(
      [
        'db:seed:benefits is a hard re-baseline, not an additive seed.',
        'It resets the catalogue to prisma/fixtures/benefits.ts:',
        '  - every fixture benefit is overwritten, discarding admin edits',
        '  - retired fixture benefits are re-activated',
        '  - benefits created through the admin UI are retired',
        'Nothing partner-scoped is touched (no redemptions, notes or progress).',
        '',
        'To proceed: npm run db:seed:benefits -- --force',
      ].join('\n'),
    );
    process.exit(1);
  }

  // Run directly under tsx rather than through the Prisma CLI, so the env
  // files prisma.config.ts loads are not loaded for us. Same files, in
  // precedence order: anything already exported wins — which is how you point
  // the seeder at a scratch database without editing .env.local — then
  // .env.local, then .env. Note this is the opposite of prisma.config.ts, which
  // loads .env.local with `override: true` and so discards what is exported.
  //
  // The exported pair is captured *before* dotenv fills the gaps, because an
  // exported URL must beat both file URLs, not just the one sharing its name.
  // Without this, exporting DATABASE_URL alone loses to .env.local's
  // DIRECT_URL — which silently sends a "scratch database" run to whatever
  // .env.local points at, i.e. the shared database.
  const exportedUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

  config({ path: '.env.local', quiet: true });
  config({ path: '.env', quiet: true });

  // Prefer the direct/session connection for bulk writes, as the CLI does.
  // `||` rather than `??`: a blank `DIRECT_URL=` in an env file is a string, so
  // `??` would keep it and refuse to run against a perfectly good DATABASE_URL.
  const url = exportedUrl || process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'No database URL: set DIRECT_URL or DATABASE_URL (see .env.example).',
    );
  }

  const prisma = new PrismaClient({ datasourceUrl: url });

  seedBenefits(prisma)
    .catch((e) => {
      console.error('Benefit seed error:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
