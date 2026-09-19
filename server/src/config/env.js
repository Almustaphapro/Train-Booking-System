import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export function parseEnvironment(source) {
  const nodeEnv = source.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test or production.');
  }

  const portValue = source.PORT ?? '5000';
  const port = Number(portValue);
  if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const clientUrls = (source.CLIENT_URL ?? 'http://localhost:5173,http://localhost:4173')
    .split(',').map((value) => value.trim());
  for (const origin of clientUrls) {
    let url;
    try { url = new URL(origin); } catch { throw new Error('CLIENT_URL must contain valid HTTP(S) origins.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('CLIENT_URL must contain HTTP(S) origins without paths or trailing slashes.');
    }
  }

  const host = source.HOST ?? 'localhost';
  if (!host.trim()) throw new Error('HOST must not be empty.');

  return Object.freeze({ nodeEnv, port, host, clientUrls });
}

export const env = parseEnvironment(process.env);
