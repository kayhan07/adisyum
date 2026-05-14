import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.mjs',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://adisyum:change-me@127.0.0.1:5432/adisyum?schema=public',
  },
});
