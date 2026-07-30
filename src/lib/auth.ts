// src/lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit-log";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
  },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

const email = credentials.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({
          where: { email },
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
          },
        });

        if (!user) {
          throw new Error("Invalid email or password");
        }

        const passwordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash,
        );

        if (!passwordValid) {
          throw new Error("Invalid email or password");
        }

        const roleKeys = user.roles.map((ur) => ur.role.key);

        // Choose "highest" membership tier by rank if multiple
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

        // This object is what flows into the jwt callback as `user`
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          roleKeys,
          membershipTierKey,
          membershipTierRank,
        };
      },
    }),
  ],

  pages: {
    signIn: "/sign-in",
  },

  callbacks: {
    // Runs once per successful sign-in for any provider (not on JWT session
    // refreshes). Unlike the mutation call sites, the audit write here is
    // fire-and-forget: a failed write must never block sign-in.
    async signIn({ user }) {
      try {
        await recordAuditLog(prisma, {
          entityType: "User",
          entityId: user.id,
          action: "LOGIN",
          actorId: user.id,
          data: {
            targetUserId: user.id,
            targetEmail: user.email ?? null,
            actorEmail: user.email ?? null,
          },
        });
      } catch (error) {
        console.error("Failed to record LOGIN audit entry:", error);
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        // Basic identity
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;

        // Roles & membership tier
        token.roleKeys = user.roleKeys ?? [];
        token.membershipTierKey = user.membershipTierKey ?? null;
        token.membershipTierRank = user.membershipTierRank ?? null;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id;
        session.user.roleKeys = token.roleKeys ?? [];
        session.user.membershipTierKey = token.membershipTierKey ?? null;
        session.user.membershipTierRank = token.membershipTierRank ?? null;
      }
      return session;
    },
  },

  debug: process.env.NODE_ENV === "development",
};
