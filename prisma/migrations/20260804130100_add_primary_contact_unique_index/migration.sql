-- "At most one primary contact per organisation" as a real database constraint.
--
-- Prisma cannot express a partial unique index, so this index is hand-written
-- and absent from schema.prisma.
--
-- Verified on Prisma 6.19.3: this does NOT cause migration drift.
-- `prisma migrate dev --create-only` against a database carrying this index
-- produces an empty migration — Prisma's differ ignores partial indexes rather
-- than trying to drop the ones it cannot represent. Re-check after a major
-- Prisma upgrade; if a future version does emit a spurious
-- `DROP INDEX "User_primary_contact_per_organisation_key"`, delete that line
-- from the generated migration.
--
-- It is isolated in its own migration so the whole constraint can be abandoned
-- cheaply if that ever changes. Application-level enforcement in update-user
-- (which demotes the incumbent before promoting a new primary contact) is the
-- primary guard either way; this index only closes the gap left by concurrent
-- saves and direct database edits.
CREATE UNIQUE INDEX "User_primary_contact_per_organisation_key"
  ON "User" ("organisationId")
  WHERE "isPrimaryContact";
