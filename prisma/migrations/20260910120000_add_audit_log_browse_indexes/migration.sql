-- Indexes for browsing AuditLog by time, for the admin audit log tab.
--
-- Until now AuditLog was only ever read one entity at a time
-- (getAdminBenefitAuditTrail), so [entityType, entityId] was enough. The admin
-- audit tab reads it the other way round — newest first across the whole
-- table, optionally narrowed by entity type, action, or actor — and none of
-- the existing indexes serve that.
--
-- Why [action, timestamp] and not just [timestamp]: with a timestamp-only
-- index, "WHERE action = $1 ORDER BY timestamp DESC LIMIT n" is a backward
-- index scan filtering each row against the heap. For a common action that
-- stops early. For a rare one (PASSWORD_RESET, BENEFIT_REQUEST_STARTED) — and
-- always for a filter matching zero rows — it walks the entire index first.
-- The zero-match case is guaranteed worst case, so it gets its own index.
--
-- Why [timestamp, id] rather than [timestamp]: the column defaults to
-- CURRENT_TIMESTAMP, which in Postgres is transaction_timestamp() and so is
-- identical for every row written in one transaction. Saving benefit step
-- progress routinely writes three rows at the same millisecond (progress,
-- redemption, request-closed). Ties are therefore ordinary, not rare, and the
-- audit tab paginates by keyset on (timestamp, id) — including id here keeps
-- both scan directions as pure ordered index scans with no sort node, and
-- resolves the tie inside the index.
--
-- Why AuditLog_actorId_idx is dropped: [actorId, timestamp] is a strict
-- superset for lookup purposes — actorId remains the leading column, so
-- foreign-key maintenance for the ON DELETE SET NULL relation is unaffected —
-- and the plain index left "this actor, newest first" sorting every row a
-- long-serving admin ever produced.
--
-- Not CREATE INDEX CONCURRENTLY: Prisma runs each migration file in a single
-- transaction and CONCURRENTLY cannot run inside one. Plain CREATE INDEX takes
-- a SHARE lock that blocks writes to AuditLog for the duration, which is
-- milliseconds at this table's current size. If AuditLog ever grows large
-- enough for that to matter, split these into their own file and run them
-- outside a transaction rather than reaching for CONCURRENTLY here.

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_id_idx" ON "AuditLog"("timestamp", "id");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_timestamp_idx" ON "AuditLog"("entityType", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_action_timestamp_idx" ON "AuditLog"("action", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_timestamp_idx" ON "AuditLog"("actorId", "timestamp");

-- DropIndex
DROP INDEX "AuditLog_actorId_idx";
