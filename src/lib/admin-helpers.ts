// src/lib/admin-helpers.ts
import prisma from "@/lib/prisma";

export function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function uniqueOrganisationSlug(base: string) {
  const root = slugify(base) || "org";
  let candidate = root;
  let i = 2;

  while (true) {
    const exists = await prisma.organisation.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    candidate = `${root}-${i++}`.slice(0, 64);
  }
}

export function parseUkDateOrNull(input: string | undefined | null): Date | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error("Date must be in dd/mm/yyyy format.");

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);

  const d = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) {
    throw new Error("Invalid date.");
  }
  return d;
}
