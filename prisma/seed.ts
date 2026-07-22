// prisma/seed.ts
import { PrismaClient, OrganisationType } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

type RawMember = {
  id: string;
  credentials: {
    email: string;
    password: string;
  };
  company: {
    name: string;
    contact_first: string;
    contact_last: string;
  };
  membership: {
    tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    status: 'active' | 'inactive';
    expiry?: string | Date;
    manager?: string;
  };
  redeemed_benefits?: string[];
};

const passwordHashCache = new Map<string, string>();

async function hashPassword(plain: string): Promise<string> {
  if (passwordHashCache.has(plain)) {
    return passwordHashCache.get(plain)!;
  }
  const hash = await bcrypt.hash(plain, 10);
  passwordHashCache.set(plain, hash);
  return hash;
}

//
// ─────────────────────────────────────────────────────────────
//   1. Seed Membership Tiers
// ─────────────────────────────────────────────────────────────
//
async function seedMembershipTiers() {
  console.log('Seeding membership tiers…');

  const tiers = [
    { yamlTier: 'bronze' as const, key: 'BRONZE', label: 'Bronze Partner', rank: 1 },
    { yamlTier: 'silver' as const, key: 'SILVER', label: 'Silver Partner', rank: 2 },
    { yamlTier: 'gold' as const, key: 'GOLD', label: 'Gold Partner', rank: 3 },
    { yamlTier: 'platinum' as const, key: 'PLATINUM', label: 'Platinum Partner', rank: 4 },
  ];

  const map = new Map<RawMember['membership']['tier'], number>();

  for (const t of tiers) {
    const tier = await prisma.membershipTier.upsert({
      where: { key: t.key },
      create: {
        key: t.key,
        label: t.label,
        rank: t.rank,
      },
      update: {
        label: t.label,
        rank: t.rank,
      },
    });
    console.log(`  - tier ${t.key} -> id=${tier.id}`);
    map.set(t.yamlTier, tier.id);
  }

  return map;
}

//
// ─────────────────────────────────────────────────────────────
//   2. Seed Roles
// ─────────────────────────────────────────────────────────────
//
async function seedRoles() {
  console.log('\nSeeding roles…');

  const roles = [
    { key: 'ADMIN', label: 'Admin' },
    { key: 'MEMBER', label: 'Member' },
    { key: 'STUDENT', label: 'Student' },
    { key: 'MODULE_LEADER', label: 'Module Leader' },
  ];

  for (const r of roles) {
    const role = await prisma.role.upsert({
      where: { key: r.key },
      create: r,
      update: {
        label: r.label,
      },
    });
    console.log(`  - role ${role.key} -> id=${role.id}`);
  }
}

//
// ─────────────────────────────────────────────────────────────
//   3. NEW: Seed Apps
// ─────────────────────────────────────────────────────────────
//
async function seedApps() {
  console.log('\nSeeding Apps…');

  const membershipDashboard = await prisma.app.upsert({
    where: { key: 'MEMBERSHIP_DASHBOARD' },
    update: {},
    create: {
      key: 'MEMBERSHIP_DASHBOARD',
      name: 'Membership Dashboard',
      basePath: '/membership-dashboard',
      description: 'Dashboard for membership information.',
    },
  });
  console.log(`  - App MEMBERSHIP_DASHBOARD (id=${membershipDashboard.id})`);

  const ixn = await prisma.app.upsert({
    where: { key: 'IXN_WORKFLOW_MANAGER' },
    update: {},
    create: {
      key: 'IXN_WORKFLOW_MANAGER',
      name: 'IXN Workflow Manager',
      basePath: '/ixn-workflow-manager',
      description: 'Workflow management system for IXN.',
    },
  });
  console.log(`  - App IXN_WORKFLOW_MANAGER (id=${ixn.id})`);

  const talent = await prisma.app.upsert({
    where: { key: 'TALENT_DISCOVERY' },
    update: {},
    create: {
      key: 'TALENT_DISCOVERY',
      name: 'Talent Discovery',
      basePath: '/talent-discovery',
      description: 'Talent discovery tools for partners.',
    },
  });
  console.log(`  - App TALENT_DISCOVERY (id=${talent.id})`);

  return { membershipDashboard, ixn, talent };
}

//
// ─────────────────────────────────────────────────────────────
//   4. NEW: Seed App Access Rules
// ─────────────────────────────────────────────────────────────
//
// Behaviour required:
//
// - Membership Dashboard: Bronze+
// - IXN: Silver+
// - Talent Discovery: Gold+
//
async function seedAppAccessRules(apps: any, tiers: Map<string, number>) {
  console.log('\nSeeding AppAccessRules…');

  const bronzeId = tiers.get('bronze');
  const silverId = tiers.get('silver');
  const goldId   = tiers.get('gold');

  if (!bronzeId || !silverId || !goldId) {
    throw new Error('Expected Bronze, Silver, Gold tiers to exist.');
  }

  // MEMBERSHIP DASHBOARD: Bronze+
  await prisma.appAccessRule.create({
    data: {
      appId: apps.membershipDashboard.id,
      minMembershipTierId: bronzeId,
      accessType: 'ALLOW',
    },
  });
  console.log('  - MEMBERSHIP_DASHBOARD: ALLOW Bronze+');

  // IXN: Bronze+
  await prisma.appAccessRule.create({
    data: {
      appId: apps.ixn.id,
      minMembershipTierId: bronzeId,
      accessType: 'ALLOW',
    },
  });
  console.log('  - IXN_WORKFLOW_MANAGER: ALLOW Bronze+');

  // Talent Discovery: Silver+
  await prisma.appAccessRule.create({
    data: {
      appId: apps.talent.id,
      minMembershipTierId: silverId,
      accessType: 'ALLOW',
    },
  });
  console.log('  - TALENT_DISCOVERY: ALLOW Silver+');
}

//
// ─────────────────────────────────────────────────────────────
//   MAIN SEED LOGIC (existing, untouched except final calls)
// ─────────────────────────────────────────────────────────────
//
async function main() {
  console.log('DATABASE_URL =', process.env.DATABASE_URL);

  const filePath = path.join(__dirname, 'members.yml');
  console.log('Reading YAML from:', filePath);

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const rawMembers = parse(fileContents) as RawMember[];

  console.log(`Loaded ${rawMembers.length} members from YAML.`);

  if (!Array.isArray(rawMembers) || rawMembers.length === 0) {
    console.warn('No members found in YAML. Exiting seed early.');
    return;
  }

  const tierIdByYaml = await seedMembershipTiers();
  await seedRoles();

  //
  // Existing MEMBER SEEDING LOOP – unchanged
  //
  for (const m of rawMembers) {
    const redeemed = m.redeemed_benefits ?? [];
    console.log(`\nSeeding memberKey="${m.id}"…`);

    const organisation = await prisma.organisation.upsert({
      where: { slug: m.id },
      create: {
        slug: m.id,
        name: m.company.name,
        type: OrganisationType.INDUSTRY,
      },
      update: {
        name: m.company.name,
        type: OrganisationType.INDUSTRY,
      },
    });
    console.log(`  Organisation id=${organisation.id}, name=${organisation.name}`);

    const passwordHash = await hashPassword(m.credentials.password);

    const user = await prisma.user.upsert({
      where: { email: m.credentials.email },
      create: {
        email: m.credentials.email,
        passwordHash,
        firstName: m.company.contact_first,
        lastName: m.company.contact_last,
        organisationId: organisation.id,
      },
      update: {
        firstName: m.company.contact_first,
        lastName: m.company.contact_last,
        organisationId: organisation.id,
        passwordHash,
      },
    });
    console.log(`  User id=${user.id}, email=${user.email}`);

    const tierId = tierIdByYaml.get(m.membership.tier);
    if (!tierId) {
      throw new Error(`No MembershipTier for YAML tier "${m.membership.tier}"`);
    }

    let expiry: Date | null = null;
    if (m.membership.expiry) {
      expiry =
        m.membership.expiry instanceof Date
          ? m.membership.expiry
          : new Date(m.membership.expiry);
    }
    const isActive = m.membership.status === 'active';

    const existingMembership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        organisationId: organisation.id,
      },
    });

    const membership = existingMembership
      ? await prisma.membership.update({
          where: { id: existingMembership.id },
          data: {
            membershipTierId: tierId,
            isActive,
            status: m.membership.status,
            managerName: m.membership.manager ?? null,
            expiry,
          },
        })
      : await prisma.membership.create({
          data: {
            userId: user.id,
            organisationId: organisation.id,
            membershipTierId: tierId,
            isActive,
            status: m.membership.status,
            managerName: m.membership.manager ?? null,
            expiry,
          },
        });

    console.log(`  Membership id=${membership.id}, tierId=${membership.membershipTierId}`);

    const dashboard = await prisma.membershipDashboardMember.upsert({
      where: { memberKey: m.id },
      create: {
        memberKey: m.id,
        userId: user.id,
        membershipId: membership.id,
        redeemedBenefitCodes: redeemed,
      },
      update: {
        userId: user.id,
        membershipId: membership.id,
        redeemedBenefitCodes: redeemed,
      },
    });

    console.log(
      `  Dashboard id=${dashboard.id}, redeemedBenefitCodes=[${dashboard.redeemedBenefitCodes.join(', ')}]`,
    );
  }

  //
  // NEW: Seed Apps + Rules (AFTER tiers and users exist)
  //
  const apps = await seedApps();
  await seedAppAccessRules(apps, tierIdByYaml);

  console.log('\nSeeding complete ✅');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
