import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('../.env', import.meta.url);
let content;
try { content = await readFile(file, 'utf8'); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  content = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
}
const existing = content.match(/^JWT_SECRET=(.*)$/m);
if (existing?.[1].trim()) {
  console.info('Existing JWT_SECRET preserved.');
} else {
  const line = `JWT_SECRET=${randomBytes(32).toString('hex')}`;
  content = existing ? content.replace(/^JWT_SECRET=.*$/m, line) : `${content.trimEnd()}\n${line}\n`;
  await writeFile(file, content);
  console.info('Created a random JWT secret in ignored server/.env without displaying it.');
}
