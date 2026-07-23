// prisma.config.ts
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Match the documented local workflow: shared defaults first, then ignored
// machine-local secrets and overrides.
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // tsx runs the TS seed cleanly under Node 24 ESM without the deprecated
    // `--loader` flag. `tsx` is a devDependency.
    seed: "tsx prisma/seed.ts",
  },
  engine: "classic",
  datasource: {
    // Migrations/CLI use a direct (session-mode) connection because the
    // transaction pooler cannot run every operation Prisma Migrate performs.
    // Falls back to DATABASE_URL for local setups that only define one URL.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
