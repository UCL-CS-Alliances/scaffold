# Alliances Platform (scaffold) deployment guide

Shared runbook for developing, reviewing, and releasing the Alliances Platform on Vercel.

## TL;DR

- Every push to a PR branch creates or updates that PR's Vercel **Preview** (unique URL).
- A reviewed merge into `main` updates Vercel **Production**.
- Preview and Production use **separate Supabase projects** (Free plan allows two projects per account, so they live in two accounts): Production is `membership-prod` in the original **account A**; Preview is `membership-preview` in the newer **account B**, holding demo data only. See "Preview/Production database split".
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
| `DATABASE_URL` | pooled `:6543` | ✅ `membership-preview` | ✅ `membership-prod` | Runtime. Supavisor **transaction** mode, `pgbouncer=true&connection_limit=1&sslmode=require`. Same name, different value per scope. |
| `DIRECT_URL` | session `:5432` | — | — | Prisma CLI (migrate/seed) only. Keep it in the deployment owner's ignored `.env.local`, switched per database when applying migrations; do not add it to Vercel. |
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

**Deployment owner (apply to each database)**
1. Point `.env.local`'s `DIRECT_URL` at `membership-preview`'s session connection, `npm run db:migrate:deploy`, verify status/constraints, and redeploy/retest the PR Preview if it built before the migration.
2. When the PR is ready to merge, repeat against `membership-prod` (take a backup first if it changes existing data), then restore your original `.env.local`.
3. Apply each migration once **per database**; never let serverless builds run migrations.

Never edit or delete a merged migration, never `prisma db push` against a remote database, and never change schema in Supabase's SQL/Table editor. Do not run migrations automatically on every serverless build — apply each reviewed migration once per database through the workflow above. CI validates the full migration history + seed against an ephemeral Postgres, so this is caught without touching Supabase.

## Release smoke test

- [ ] `npm ci`, `npm run typecheck`, and `npm run build` pass (`prisma generate` runs in `postinstall`). `npm run lint` is informational in CI while pre-existing `no-explicit-any` debt is cleared.
- [ ] Deployment target says **Preview** during PR review, **Production** only after merge to `main`.
- [ ] `GET /api/health` returns HTTP 200 `{ "status": "ok" }`.
- [ ] The Supabase project reference matches the environment: `alliances-platform/preview` during PR review, `alliances-platform/prod` for Production.
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

## Preview/Production database split

Free Supabase caps an account at two projects, so the two production databases (this app and IXN) live in the original **account** and the two preview databases live in the **alliances@uclcomputerscience.org account**. The original shared project became `membership-prod` in place — no data migration — and a fresh empty `membership-preview` was created in account B. Redo this only when provisioning a replacement preview project.

1. In account B create `membership-preview` (same region as `membership-prod`); save its database password in a password manager.
2. From its **Connect** panel take the transaction-pooler string (`:6543`) for `DATABASE_URL` and the session-pooler string (`:5432`) for `DIRECT_URL`. scaffold uses `sslmode=require`, so no CA-cert variable is needed.
3. Apply the schema to the empty project: back up `.env.local` (`cp .env.local .env.local.bak`), point its `DIRECT_URL` at `membership-preview`, run `npm run db:migrate:deploy` (then `npm run db:seed` if you want demo data), and restore with `mv .env.local.bak .env.local`.
4. In Vercel, restrict the existing `DATABASE_URL` to the **Production** scope (value `membership-prod`) and add a second `DATABASE_URL` in the **Preview** scope with the `membership-preview` value.
5. Redeploy `main`, confirm Production reaches `membership-prod` and a PR Preview reaches `membership-preview`, run the smoke test, and record the tested commit + rollback target.

## Official references

- Vercel Git deployments — https://vercel.com/docs/git
- Vercel for GitHub — https://vercel.com/docs/git/vercel-for-github
- Vercel environment variables — https://vercel.com/docs/environment-variables
- Supabase connection pooling (Supavisor) — https://supabase.com/docs/guides/database/connecting-to-postgres
- Prisma + Supabase — https://www.prisma.io/docs/orm/overview/databases/supabase
