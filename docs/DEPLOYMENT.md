# Alliances Platform (scaffold) deployment guide

Shared runbook for developing, reviewing, and releasing the Alliances Platform on Vercel.

## TL;DR

- Every push to a PR branch creates or updates that PR's Vercel **Preview** (unique URL).
- A reviewed merge into `main` updates Vercel **Production**.
- Preview and Production temporarily share one Supabase project containing demo data only. They will be split later (see "Separating the databases").
- Database schema changes are Prisma migrations committed to Git. Never edit the remote schema directly in the Supabase dashboard.
- Env vars are managed centrally in Vercel by the deployment owner. Do not paste secrets into chat, tickets, or `.env` attachments.

Auth is NextAuth v4 (credentials + Prisma adapter, JWT sessions). Hosting the database on Supabase does **not** move auth to Supabase Auth.

## First-time Vercel project setup

Complete this after the deployment configuration has been merged into `main`, so
the first Production build uses the reviewed configuration.

1. In the Strategic Alliances Team Vercel scope, Add New... -> Project and import `UCL-CS-Alliances/scaffold` via the Vercel for GitHub app.
2. Framework preset: **Next.js** (auto-detected; `vercel.json` pins it and region `lhr1`).
3. Settings -> Git -> Production Branch = `main`. All other branches deploy as Preview.
4. Add environment variables (see the table below) in the correct scopes, then deploy.
5. Confirm `GET /api/health` on the deployment returns `{ "status": "ok" }`.

## Environment variables

`.env.example` is the source-of-truth list. Set values in Vercel per scope:

| Variable | Local (`.env.local`) | Preview | Production | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | pooled `:6543` | ✅ same shared DB | ✅ same shared DB | Runtime. Supavisor **transaction** mode, `pgbouncer=true&connection_limit=1&sslmode=require`. |
| `DIRECT_URL` | session `:5432` | — | — | Prisma CLI (migrate/seed) only. Keep it in the deployment owner's ignored `.env.local`; do not add it to Vercel. |
| `NEXTAUTH_SECRET` | random | ✅ (its own) | ✅ (its own) | Server-only. Use **different** secrets per environment. `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | `http://localhost:3000` | **unset** | `https://<prod-host>` | Leave unset on Preview so NextAuth uses the per-deployment URL. |
| `CONTACT_FROM_EMAIL` | optional | optional | optional | Only the From header; email uses Ethereal test accounts until Graph/SMTP is added. |

Set `DATABASE_URL` and `NEXTAUTH_SECRET` as Vercel Sensitive variables. A contributor does not need to see or edit these values for Git-based Preview deployments: the deployment owner can configure them once at project level. On Vercel Pro, a Developer can manage Preview/Development variables but not Production variables; keep Production changes with an Owner or Member. Environment-variable changes apply only to new deployments, so redeploy the affected branch after every change.

## Database connections and TLS

Two connection strings, both against the Supabase Supavisor pooler (`aws-0-eu-west-1.pooler.supabase.com`):

- `DATABASE_URL` — **transaction** mode, port `6543`, with
  `pgbouncer=true&connection_limit=1&sslmode=require`. Serverless functions use this.
- `DIRECT_URL` — **session** mode, port `5432`. Prisma Migrate uses this outside
  request handling (transaction pooling can't run every migration operation).

`schema.prisma` declares `directUrl = env("DIRECT_URL")`; the running app reads only `DATABASE_URL`. This app connects through Prisma, not the Supabase browser SDK — do not add a Supabase service-role key to client code, and keep the Supabase Data API disabled for the exposed schema unless RLS is designed and tested first.

> TLS note: unlike the IXN app (which uses the Prisma `pg` adapter + a pinned
> `DATABASE_CA_CERT` for `verify-full`), scaffold uses the default Prisma client, so
> `sslmode=require` is the correct, simpler setting. No CA cert variable is needed.

## Database migration workflow

Migrations in `prisma/migrations/` are the schema authority.

**Contributor**
1. Edit `prisma/schema.prisma` locally.
2. `npm run db:migrate:dev -- --name <descriptive-name>`.
3. Test against a disposable local database, update the seed if needed, and commit the schema **plus** the new migration directory.
4. Mark the PR **Database migration required** and tell the deployment owner.

**When a migration needs to move data, not just change shape**, generate it without applying it and hand-edit the result:

1. `npx prisma migrate dev --create-only --name <descriptive-name>` — writes the SQL, applies nothing.
2. Interleave your `UPDATE`/`DELETE` statements among the generated DDL. Let Prisma generate all DDL and copy its constraint names; only the data statements are yours. Order matters — backfill before adding `NOT NULL` or a unique index, so the constraint is only checked once the data can satisfy it.
3. `npx prisma migrate dev` to apply locally and regenerate the client.

Prisma runs each migration file in one transaction and PostgreSQL has transactional DDL, so a failed backfill rolls the whole file back. Point `DATABASE_URL` at a scratch database first: `--create-only` still provisions a shadow database on whatever it points at, which must never be the shared Supabase project.

> **`User_primary_contact_per_organisation_key` is invisible to `schema.prisma`.** Prisma cannot express a partial unique index, so this one lives only in `20260804130100_add_primary_contact_unique_index`. Verified on Prisma 6.19.3 that this causes **no** drift — the differ ignores partial indexes rather than trying to drop what it cannot represent, and `migrate dev --create-only` against a database carrying it produces an empty migration. Worth re-checking after a major Prisma upgrade: if a generated migration ever contains `DROP INDEX "User_primary_contact_per_organisation_key"`, delete that line before applying.

**Deployment owner (apply to the shared DB)**
1. Point `.env.local`'s `DIRECT_URL` at the shared Supabase session connection.
2. `npm run db:migrate:deploy`, then verify status/constraints.
3. Redeploy/retest the PR Preview if it built before the migration.

Never edit or delete a merged migration, never `prisma db push` against the shared DB, and never change schema in Supabase's SQL/Table editor. Do not run migrations automatically on every serverless build — concurrent PR/Production builds share the DB and can race. CI validates the full migration history + seed against an ephemeral Postgres, so this is caught without touching Supabase.

## Reference data (the benefit catalogue)

The `Benefit` and `BenefitAction` tables hold the membership benefit catalogue. A migration creates them **empty** — the content is seeded, not written into the migration SQL, so there is only ever one copy of it.

**Never use `npm run db:seed` to populate them on a shared database.** That seed also upserts organisations, users and memberships from `prisma/members.yml` and will rewrite live partner records — including anything corrected by hand after a data migration. Use the catalogue-only seeder:

```bash
npm run db:seed:benefits
```

It writes `Benefit` and `BenefitAction` and nothing else. It never touches anything partner-scoped: no organisations, no memberships, and no `BenefitPartnerNote` rows. It reads `.env.local` then `.env` the same way the Prisma CLI does, preferring `DIRECT_URL`, but anything already exported wins — so `DATABASE_URL=… npm run db:seed:benefits` can target a scratch database without editing `.env.local`.

Two properties worth relying on:

- **Repeat-safe.** Benefits are upserted on `code` and nothing is ever pruned, so a benefit added through the admin UI survives. Steps are reconciled by position rather than deleted and recreated, so `BenefitAction.id` stays stable — which matters because the planned per-partner action tracker will hang progress rows off those ids with `ON DELETE CASCADE`.
- **It is a content re-baseline, not routine maintenance.** The fixture wins for every code it knows about. Once benefits are editable through the admin UI, running this **reverts every admin edit** to benefit text. A benefit an admin has retired stays retired (`isActive` is not overwritten), but wording is not protected.

**Ordering when the read path changes.** Code that reads these tables must not reach `main` until the rows exist, or every benefit view renders empty. Because Preview and Production share one Supabase database and migrations are applied by hand, this sequencing is not optional: apply the migration, run `npm run db:seed:benefits`, verify the row counts, and only then merge the code that reads them.

## Release smoke test

- [ ] `npm ci`, `npm run typecheck`, and `npm run build` pass (`prisma generate` runs in `postinstall`). `npm run lint` is informational in CI while pre-existing `no-explicit-any` debt is cleared.
- [ ] Deployment target says **Preview** during PR review, **Production** only after merge to `main`.
- [ ] `GET /api/health` returns HTTP 200 `{ "status": "ok" }`.
- [ ] The Supabase project reference matches the shared synthetic-data project.
- [ ] Required migrations applied; constraints/row counts verified.
- [ ] Sign-in and role/route protection work.
- [ ] No secret appears in source, logs, browser bundles, or `NEXT_PUBLIC_*`.
- [ ] URL, tested commit, and result recorded in the team tracker.

## Rollback and recovery

Application-only failure: use the last known-good Preview during review, or roll Production back to its last known-good deployment in Vercel. An app rollback does **not** reverse a database migration.

Database failure: stop writes if necessary and restore a verified backup into a replacement database — do not improvise a destructive down migration. Supabase Free does not offer paid-tier backup guarantees and inactive projects may pause; keep regular encrypted logical backups outside the DB account and test restores.

## Reducing Preview build usage later

To keep `main` automatic while making PR Previews manual, add to `vercel.json`:

```json
"git": {
  "deploymentEnabled": {
    "*": false,
    "main": true
  }
}
```

Then create a Preview on demand from **Deployments -> Create Deployment**.

## Separating the databases later

The shared database is a temporary cost-saving arrangement. To split:

1. Create a separate Supabase project for Production (never reuse the Preview DB for real data).
2. Apply the exact migrations already tested in Preview using the Production `DIRECT_URL`; verify the schema before taking traffic.
3. Replace the Production-scoped `DATABASE_URL` in Vercel with the new Production project value. Keep the Preview value unchanged; retain the new Production `DIRECT_URL` only in the authorised deployment owner's local environment for migrations.
4. Redeploy `main`, run the smoke test, and record the tested commit + rollback target.

## Official references

- Vercel Git deployments — https://vercel.com/docs/git
- Vercel for GitHub — https://vercel.com/docs/git/vercel-for-github
- Vercel environment variables — https://vercel.com/docs/environment-variables
- Supabase connection pooling (Supavisor) — https://supabase.com/docs/guides/database/connecting-to-postgres
- Prisma + Supabase — https://www.prisma.io/docs/orm/overview/databases/supabase
