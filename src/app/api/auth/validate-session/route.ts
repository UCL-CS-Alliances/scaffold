// src/app/api/auth/validate-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { decode } from "next-auth/jwt";
import prisma from "@/lib/prisma";

// Never cache this route. Every request must hit the database to ensure fresh
// data.
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/validate-session
 * Authorization: Bearer <jwt_token>
 *
 * Validates a JWT token and returns fresh user data.
 * Used by sub-apps (IXN, etc.) to verify Alliances sessions and get up-to-date
 * user information.
 */
export async function GET(req: NextRequest) {
  try {
    // Get authorization header
    const auth_header = req.headers.get("authorization");
    if (!auth_header?.startsWith("Bearer ")) {
      return NextResponse.json(
        { valid: false, error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    // Extract JWT token from authorization header
    const token = auth_header.slice(7);
    if (!token) {
      return NextResponse.json(
        { valid: false, error: "Empty token" },
        { status: 401 }
      );
    }

    // Decode and verify the JWT using the shared secret
    const decoded = await decode({
      token,
      secret: process.env.NEXTAUTH_SECRET!,
    });
    if (!decoded) {
      return NextResponse.json(
        { valid: false, error: "Invalid token" },
        { status: 401 }
      );
    }

    // Check if the token has expired
    const expiration = decoded.exp as number | undefined;
    if (expiration && Date.now() >= expiration * 1000) {
      return NextResponse.json(
        { valid: false, error: "Token expired" },
        { status: 401 }
      );
    }

    // Query database for fresh user data
    const user = await prisma.user.findUnique({
      where: { id: decoded.id as string },
      include: {
        roles: {
          include: { role: true },
        },
        memberships: {
          where: { isActive: true },
          include: {
            membershipTier: true,
          },
        },
        organisation: true,
      },
    });
    if (!user) {
      return NextResponse.json(
        { valid: false, error: "User not found" },
        { status: 401 }
      );
    }

    const roleKeys = user.roles.map((ur) => ur.role.key);

    // Choose "highest" membership tier by rank if multiple
    // TODO: this duplicates logic in src/lib/auth.ts
    const activeMemberships = user.memberships.filter((m) => m.isActive);
    let membershipTierKey: string | null = null;
    let membershipTierRank: number | null = null;

    if (activeMemberships.length > 0) {
      const highest = activeMemberships.reduce((best, current) => {
        if (!best) return current;
        return current.membershipTier.rank > best.membershipTier.rank
          ? current
          : best;
      }, activeMemberships[0]);

      membershipTierKey = highest.membershipTier.key;
      membershipTierRank = highest.membershipTier.rank;
    }

    // Return user object and token expiration time
    return NextResponse.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName,
        lastName: user.lastName,
        roleKeys,
        membershipTierKey,
        membershipTierRank,
        organisationId: user.organisationId,
        organisationName: user.organisation?.name || null,
      },
      expiresAt: expiration
        ? new Date(expiration * 1000).toISOString()
        : null,
    });
  } catch (error) {
    console.error("Token validation error:", error);
    return NextResponse.json(
      { valid: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
