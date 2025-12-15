// src/lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

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
    async jwt({ token, user }) {
      if (user) {
        // Basic identity
        token.id = (user as any).id;
        token.name = user.name;
        token.email = user.email;

        // Roles & membership tier
        token.roleKeys = (user as any).roleKeys ?? [];
        token.membershipTierKey = (user as any).membershipTierKey ?? null;
        token.membershipTierRank = (user as any).membershipTierRank ?? null;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token) {
        (session.user as any).id = token.id;
        (session.user as any).roleKeys = (token as any).roleKeys ?? [];
        (session.user as any).membershipTierKey =
          (token as any).membershipTierKey ?? null;
        (session.user as any).membershipTierRank =
          (token as any).membershipTierRank ?? null;
      }
      return session;
    },
  },

  debug: process.env.NODE_ENV === "development",
};
