import { defineConfig, env } from 'prisma/config';
import './src/config/env.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.js' },
  datasource: { url: env('DATABASE_URL'), shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL },
});
