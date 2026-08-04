-- "At most one primary contact per organisation" as a real database constraint.
--
-- Prisma cannot express a partial unique index, so this index is hand-written
-- and absent from schema.prisma. The consequence is permanent and worth knowing
-- before you next touch the schema: `prisma migrate dev` builds a shadow
-- database by replaying migrations, sees an index the schema does not declare,
-- and emits a spurious
--
--     DROP INDEX "User_primary_contact_per_organisation_key";
--
-- into every migration it generates from now on. Delete that line each time.
--
-- It is isolated in its own migration so the whole constraint can be abandoned
-- cheaply if that upkeep is judged not to be worth it. Application-level
-- enforcement in update-user (which demotes the incumbent before promoting a
-- new primary contact) is the primary guard either way; this index only closes
-- the gap left by concurrent saves and direct database edits.
CREATE UNIQUE INDEX "User_primary_contact_per_organisation_key"
  ON "User" ("organisationId")
  WHERE "isPrimaryContact";
