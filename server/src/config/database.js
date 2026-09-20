import './env.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

export function createDatabaseClient() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for database commands.');
  const url = new URL(process.env.DATABASE_URL);
  if (url.protocol !== 'mysql:' || !url.pathname.slice(1)) {
    throw new Error('DATABASE_URL must be a MySQL URL with a database name.');
  }
  let cachingRsaPublicKey;
  if (process.env.DATABASE_RSA_PUBLIC_KEY_PATH) {
    const serverDirectory = fileURLToPath(new URL('../../', import.meta.url));
    cachingRsaPublicKey = readFileSync(resolve(serverDirectory, process.env.DATABASE_RSA_PUBLIC_KEY_PATH), 'utf8');
  }
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    connectionLimit: 5,
    timezone: 'Z',
    cachingRsaPublicKey,
    allowPublicKeyRetrieval: false,
    connectTimeout: 5000,
    acquireTimeout: 10000,
  });
  return new PrismaClient({ adapter });
}
