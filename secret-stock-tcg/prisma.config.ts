import path from "node:path";
import "dotenv/config"; // a config file disables Prisma's auto .env loading, so load it ourselves
import { defineConfig } from "prisma/config";

// Replaces the deprecated `package.json#prisma` key (removed in Prisma 7).
// Only declares the schema location + the seed command; the datasource URL
// still comes from env() in prisma/schema.prisma.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
