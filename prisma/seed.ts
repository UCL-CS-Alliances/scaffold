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
    contact_job_title?: string;
  };
  membership: {
    tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    status: 'active' | 'inactive';
    expiry?: string | Date;
    manager?: string;
  };
  // Further contacts at the same organisation, beyond the main one in
  // `company`. They share the organisation's tier — membership is a property of
  // the organisation, not of the individual.
  additional_users?: {
    email: string;
    password: string;
    first: string;
    last: string;
    job_title?: string;
  }[];
  redeemed_benefits?: string[];
};

type SeedRoleKey = 'ADMIN' | 'MEMBER' | 'STUDENT' | 'MODULE_LEADER';

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

  const roles: { key: SeedRoleKey; label: string }[] = [
    { key: 'ADMIN', label: 'Admin' },
    { key: 'MEMBER', label: 'Member' },
    { key: 'STUDENT', label: 'Student' },
    { key: 'MODULE_LEADER', label: 'Module Leader' },
  ];

  const map = new Map<SeedRoleKey, number>();

  for (const r of roles) {
    const role = await prisma.role.upsert({
      where: { key: r.key },
      create: r,
      update: {
        label: r.label,
      },
    });
    console.log(`  - role ${role.key} -> id=${role.id}`);
    map.set(r.key, role.id);
  }

  return map;
}

async function assignRole(userId: string, roleId: number) {
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId,
        roleId,
      },
    },
    create: {
      userId,
      roleId,
    },
    update: {},
  });
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
// - IXN: Bronze+
// - Talent Discovery: Silver+
//
async function seedAppAccessRules(
  apps: Awaited<ReturnType<typeof seedApps>>,
  tiers: Map<string, number>,
) {
  console.log('\nSeeding AppAccessRules…');

  const bronzeId = tiers.get('bronze');
  const silverId = tiers.get('silver');

  if (!bronzeId || !silverId) {
    throw new Error('Expected Bronze and Silver tiers to exist.');
  }

  const rules = [
    {
      label: 'MEMBERSHIP_DASHBOARD: ALLOW Bronze+',
      appId: apps.membershipDashboard.id,
      minMembershipTierId: bronzeId,
    },
    {
      label: 'IXN_WORKFLOW_MANAGER: ALLOW Bronze+',
      appId: apps.ixn.id,
      minMembershipTierId: bronzeId,
    },
    {
      label: 'TALENT_DISCOVERY: ALLOW Silver+',
      appId: apps.talent.id,
      minMembershipTierId: silverId,
    },
  ];

  for (const rule of rules) {
    await prisma.$transaction([
      prisma.appAccessRule.deleteMany({
        where: {
          appId: rule.appId,
          roleId: null,
          accessType: 'ALLOW',
        },
      }),
      prisma.appAccessRule.create({
        data: {
          appId: rule.appId,
          minMembershipTierId: rule.minMembershipTierId,
          accessType: 'ALLOW',
        },
      }),
    ]);
    console.log(`  - ${rule.label}`);
  }
}

async function seedDemoUsers(
  apps: Awaited<ReturnType<typeof seedApps>>,
  roleIdByKey: Map<SeedRoleKey, number>,
) {
  console.log('\nSeeding demo users…');

  const organisation = await prisma.organisation.upsert({
    where: { slug: 'ucl-computer-science' },
    create: {
      slug: 'ucl-computer-science',
      name: 'UCL Computer Science',
      type: OrganisationType.UNIVERSITY,
    },
    update: {
      name: 'UCL Computer Science',
      type: OrganisationType.UNIVERSITY,
    },
  });

  const demoUsers: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    roleKey: SeedRoleKey;
    organisationId: number;
    defaultAppId: number;
    jobTitle: string;
    // UCL Computer Science carries all three demo users, so it is the
    // organisation that exercises the primary-contact flag out of the box.
    isPrimaryContact: boolean;
  }[] = [
    {
      email: 'admin@alliances.example.com',
      password: 'admin-demo',
      firstName: 'Ada',
      lastName: 'Admin',
      roleKey: 'ADMIN',
      organisationId: organisation.id,
      defaultAppId: apps.membershipDashboard.id,
      jobTitle: 'Strategic Alliances Manager',
      isPrimaryContact: true,
    },
    {
      email: 'student@ucl.example.com',
      password: 'student-demo',
      firstName: 'Sam',
      lastName: 'Student',
      roleKey: 'STUDENT',
      organisationId: organisation.id,
      defaultAppId: apps.talent.id,
      jobTitle: 'MSc Computer Science Student',
      isPrimaryContact: false,
    },
    {
      email: 'module.leader@ucl.example.com',
      password: 'module-demo',
      firstName: 'Morgan',
      lastName: 'Module Leader',
      roleKey: 'MODULE_LEADER',
      organisationId: organisation.id,
      defaultAppId: apps.ixn.id,
      jobTitle: 'Module Leader, Systems Engineering',
      isPrimaryContact: false,
    },
  ];

  // Demote before promoting, for the same reason as the member loop: the
  // partial unique index rejects a second primary contact.
  const primaryDemoUser = demoUsers.find((d) => d.isPrimaryContact);
  if (primaryDemoUser) {
    await prisma.user.updateMany({
      where: {
        organisationId: organisation.id,
        email: { not: primaryDemoUser.email },
        isPrimaryContact: true,
      },
      data: { isPrimaryContact: false },
    });
  }

  for (const demoUser of demoUsers) {
    const roleId = roleIdByKey.get(demoUser.roleKey);
    if (!roleId) {
      throw new Error(`Expected role "${demoUser.roleKey}" to exist.`);
    }

    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      create: {
        email: demoUser.email,
        passwordHash: await hashPassword(demoUser.password),
        firstName: demoUser.firstName,
        lastName: demoUser.lastName,
        jobTitle: demoUser.jobTitle,
        organisationId: demoUser.organisationId,
        defaultAppId: demoUser.defaultAppId,
        isPrimaryContact: demoUser.isPrimaryContact,
      },
      update: {
        passwordHash: await hashPassword(demoUser.password),
        firstName: demoUser.firstName,
        lastName: demoUser.lastName,
        jobTitle: demoUser.jobTitle,
        organisationId: demoUser.organisationId,
        defaultAppId: demoUser.defaultAppId,
        isPrimaryContact: demoUser.isPrimaryContact,
      },
    });

    await assignRole(user.id, roleId);
    console.log(`  - ${demoUser.roleKey}: ${demoUser.email}`);
  }
}

//
// ─────────────────────────────────────────────────────────────
//   MAIN SEED LOGIC (existing, untouched except final calls)
// ─────────────────────────────────────────────────────────────
//
async function main() {
  console.log('Database connection configured:', Boolean(process.env.DATABASE_URL));

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
  const roleIdByKey = await seedRoles();
  const apps = await seedApps();
  const memberRoleId = roleIdByKey.get('MEMBER');

  if (!memberRoleId) {
    throw new Error('Expected role "MEMBER" to exist.');
  }

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
        jobTitle: m.company.contact_job_title ?? null,
        organisationId: organisation.id,
        defaultAppId: apps.membershipDashboard.id,
      },
      update: {
        firstName: m.company.contact_first,
        lastName: m.company.contact_last,
        jobTitle: m.company.contact_job_title ?? null,
        organisationId: organisation.id,
        passwordHash,
        defaultAppId: apps.membershipDashboard.id,
      },
    });

    // Demote unconditionally before promoting. Setting the new primary first
    // would collide with the partial unique index on any reseed where the
    // fixture's designated contact has changed — a bug that passes run 1 and
    // fails run 2.
    await prisma.user.updateMany({
      where: {
        organisationId: organisation.id,
        id: { not: user.id },
        isPrimaryContact: true,
      },
      data: { isPrimaryContact: false },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { isPrimaryContact: true },
    });
    console.log(`  User id=${user.id}, email=${user.email}`);
    await assignRole(user.id, memberRoleId);
    console.log('  Assigned role MEMBER');

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

    const membershipFields = {
      membershipTierId: tierId,
      isActive,
      status: m.membership.status,
      managerName: m.membership.manager ?? null,
      expiry,
    };

    // One membership per organisation. userId is set only on create: reseeding
    // must not reassign the organisation's membership to a different contact.
    const membership = await prisma.membership.upsert({
      where: { organisationId: organisation.id },
      create: {
        userId: user.id,
        organisationId: organisation.id,
        ...membershipFields,
      },
      update: membershipFields,
    });

    console.log(`  Membership id=${membership.id}, tierId=${membership.membershipTierId}`);

    // Additional contacts get no membership row of their own — they occupy a
    // seat on the organisation's, which is what every read path resolves.
    for (const extra of m.additional_users ?? []) {
      const extraPasswordHash = await hashPassword(extra.password);

      const extraUser = await prisma.user.upsert({
        where: { email: extra.email },
        create: {
          email: extra.email,
          passwordHash: extraPasswordHash,
          firstName: extra.first,
          lastName: extra.last,
          jobTitle: extra.job_title ?? null,
          organisationId: organisation.id,
          defaultAppId: apps.membershipDashboard.id,
        },
        update: {
          firstName: extra.first,
          lastName: extra.last,
          jobTitle: extra.job_title ?? null,
          organisationId: organisation.id,
          passwordHash: extraPasswordHash,
          defaultAppId: apps.membershipDashboard.id,
        },
      });

      await assignRole(extraUser.id, memberRoleId);

      console.log(`  Additional contact id=${extraUser.id}, email=${extraUser.email}`);
    }

    // Keyed on the organisation rather than memberKey: redemption is the
    // organisation's, and memberKey is derived from the same slug anyway.
    const dashboard = await prisma.membershipDashboardMember.upsert({
      where: { organisationId: organisation.id },
      create: {
        memberKey: m.id,
        organisationId: organisation.id,
        userId: user.id,
        membershipId: membership.id,
        redeemedBenefitCodes: redeemed,
      },
      update: {
        memberKey: m.id,
        userId: user.id,
        membershipId: membership.id,
        redeemedBenefitCodes: redeemed,
      },
    });

    console.log(
      `  Dashboard id=${dashboard.id}, redeemedBenefitCodes=[${dashboard.redeemedBenefitCodes.join(', ')}]`,
    );
  }

  await seedAppAccessRules(apps, tierIdByYaml);
  await seedDemoUsers(apps, roleIdByKey);

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
