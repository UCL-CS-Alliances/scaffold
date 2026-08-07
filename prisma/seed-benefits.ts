// prisma/seed-benefits.ts
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { pathToFileURL } from 'url';
import { BENEFITS } from '../src/content/benefits';

//
// ─────────────────────────────────────────────────────────────
//   Benefit catalogue seed
// ─────────────────────────────────────────────────────────────
//
// Seeds the Benefit and BenefitAction tables from the content-as-code
// catalogue. Deliberately separate from prisma/seed.ts and runnable on its own
// (`npm run db:seed:benefits`), because the main seed also upserts
// organisations, users and memberships from members.yml — running that against
// a live database would rewrite real partner records. This script touches
// reference data only, and never anything partner-scoped, so it is safe to run
// wherever the catalogue needs populating.
//
// Note it is a *content re-baseline*: the fixture wins for every code it knows
// about. Once benefits are editable through the admin UI, running this reverts
// those edits.
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
    };

    // Upsert rather than replace: a benefit added through the admin UI is not
    // in the fixture and must survive a reseed, so nothing is ever pruned.
    // isActive is absent from `fields` on purpose — it defaults to true on
    // create, and a benefit retired by an admin stays retired.
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

  console.log(`Benefit catalogue seeded (${BENEFITS.length} benefits).`);
}

// Standalone entry point for `npm run db:seed:benefits`. Guarded so that
// importing seedBenefits from prisma/seed.ts does not also run it.
const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  // Run directly under tsx rather than through the Prisma CLI, so the env
  // files prisma.config.ts loads are not loaded for us. Same files, in
  // precedence order: anything already exported wins — which is how you point
  // the seeder at a scratch database without editing .env.local — then
  // .env.local, then .env.
  config({ path: '.env.local', quiet: true });
  config({ path: '.env', quiet: true });

  // Prefer the direct/session connection for bulk writes, as the CLI does.
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

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
