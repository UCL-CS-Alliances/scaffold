// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Never cache the health check; it must reflect live state.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Lightweight liveness probe for the database connection.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
