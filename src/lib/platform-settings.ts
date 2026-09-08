// src/lib/platform-settings.ts
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Small admin-editable operational values that belong to no partner and to
 * no catalogue entry — the programme-wide partner satisfaction survey link is
 * the first. One PlatformSetting row per key; a missing row means "not set",
 * the same way a missing BenefitPartnerNote row means "no note", so clearing
 * a value deletes the row rather than storing an empty string.
 *
 * This module owns the key list and the resolution, as membership.ts and
 * benefits.ts own theirs: read a setting through it rather than querying
 * prisma.platformSetting at a call site. Client-first for the usual reason —
 * a caller inside an interactive $transaction must pass its tx, or the read
 * queues behind the open transaction on the pooled connection_limit=1
 * production connection and deadlocks it.
 *
 * Nothing seeds this table. Its migration creates it empty and an admin
 * enters values from the dashboard, so a new setting needs no deploy
 * sequencing — only a sensible "not set" rendering at every read site.
 */
export type PlatformSettingClient = PrismaClient | Prisma.TransactionClient;

/**
 * The programme-wide partner satisfaction survey link — a Microsoft Forms
 * URL in practice, though any https URL is accepted. Benefit.surveyUrl
 * overrides it per benefit; the benefit detail page resolves the override
 * first and only reads this when the benefit has none.
 */
export const PARTNER_SURVEY_URL_KEY = "partnerSurveyUrl";

export type PlatformSettingKey = typeof PARTNER_SURVEY_URL_KEY;

export async function getPlatformSetting(
  client: PlatformSettingClient,
  key: PlatformSettingKey,
): Promise<string | null> {
  const row = await client.platformSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  return row?.value ?? null;
}

/**
 * Write a setting, or delete its row when `value` is null. Validation is the
 * caller's job — this is the storage shape only, kept here so the "missing
 * row means not set" convention has exactly one implementation.
 */
export async function setPlatformSetting(
  client: PlatformSettingClient,
  key: PlatformSettingKey,
  value: string | null,
): Promise<void> {
  if (value === null) {
    // deleteMany rather than delete: clearing an already-unset value is a
    // no-op, not a P2025.
    await client.platformSetting.deleteMany({ where: { key } });
    return;
  }
  await client.platformSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getPartnerSurveyUrl(
  client: PlatformSettingClient,
): Promise<string | null> {
  return getPlatformSetting(client, PARTNER_SURVEY_URL_KEY);
}
