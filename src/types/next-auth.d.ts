// src/types/next-auth.d.ts
// Module augmentation so the app's custom identity fields (id + roles + tier)
// are typed on the NextAuth Session, User, and JWT instead of being cast to any.
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    roleKeys?: string[];
    membershipTierKey?: string | null;
    membershipTierRank?: number | null;
  }

  interface Session {
    user: {
      id: string;
      roleKeys: string[];
      membershipTierKey: string | null;
      membershipTierRank: number | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    roleKeys?: string[];
    membershipTierKey?: string | null;
    membershipTierRank?: number | null;
  }
}
