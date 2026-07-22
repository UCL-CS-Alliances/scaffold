# UCL CS Alliances Platform

Self-service Next.js app for UCL Computer Science's Strategic Alliances Team. The app serves industry partners, academic staff, students, and SAT admins through role- and membership-gated product areas.

## Stack

- Next.js App Router
- React
- Prisma
- PostgreSQL, currently using Supabase Postgres for preview/dev
- NextAuth v4 Credentials provider with `PrismaAdapter`

Supabase is used as the PostgreSQL host only. The app does not use Supabase Auth.

## Local Setup

Create a local `.env` file from `.env.example`:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:YOUR_DATABASE_PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-a-long-random-string"
```

Do not commit `.env` or real database credentials.

Install dependencies and prepare the database:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database Commands

```bash
npm run db:generate  # generate Prisma Client
npm run db:migrate   # apply/create development migrations
npm run db:seed      # seed preview/local demo data
npm run db:studio    # inspect data in Prisma Studio
```

Use Prisma migrations as the source of truth for schema changes. For Supabase, use the session-mode pooler or direct connection for local development and migrations.

## Seed Data

The Prisma seed script (`prisma/seed.ts`) creates local/preview demo data only. Do not use these credentials in production.

Seeded baseline roles:

- `ADMIN`
- `MEMBER`
- `STUDENT`
- `MODULE_LEADER`

Seeded demo role accounts:

| Role | Email | Password | Default app |
| --- | --- | --- | --- |
| Admin | `admin@alliances.example.com` | `admin-demo` | Membership Dashboard |
| Student | `student@ucl.example.com` | `student-demo` | Talent Discovery |
| Module Leader | `module.leader@ucl.example.com` | `module-demo` | IXN Workflow Manager |

Seeded partner member accounts:

| Organisation | Email | Password | Tier | Default app |
| --- | --- | --- | --- | --- |
| Chanel | `partnerships@chanel.example.com` | `chanel-demo` | Platinum | Membership Dashboard |
| Microsoft | `engage@microsoft.example.com` | `msft-demo` | Silver | Membership Dashboard |
| Google | `partnerships@google.example.com` | `google-demo` | Gold | Membership Dashboard |
| Amazon | `collab@amazon.example.com` | `amazon-demo` | Silver | Membership Dashboard |
| Meta | `labs@meta.example.com` | `meta-demo` | Silver | Membership Dashboard |
| Apple | `talent@apple.example.com` | `apple-demo` | Bronze | Membership Dashboard |
| Google DeepMind | `ai@deepmind.example.com` | `deepmind-demo` | Platinum | Membership Dashboard |
| Chubb | `innovation@chubb.example.com` | `chubb-demo` | Bronze | Membership Dashboard |
| Siemens | `partners@siemens.example.com` | `siemens-demo` | Gold | Membership Dashboard |
| BBC | `rdi@bbc.example.com` | `bbc-demo` | Silver | Membership Dashboard |

The partner accounts are seeded from `prisma/members.yml`, assigned the `MEMBER` role, and given active memberships plus membership dashboard projection rows.

## Verification

After setup, verify the key local flows:

- admin signs in and reaches the Membership Dashboard admin view
- partner member signs in and reaches the Membership Dashboard member view
- student signs in and reaches the Talent Discovery student view
- module leader signs in and reaches the IXN Workflow Manager
- repeated `npm run db:seed` runs do not duplicate baseline app access rules

There is no automated test suite configured yet. Use `npm run lint` for the current static check, noting that existing lint issues may need separate cleanup.
