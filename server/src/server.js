import app from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.port, env.host, () => {
  console.info(`RailConnect API listening at http://${env.host}:${env.port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${env.port} is already in use. Stop the other service or change PORT.`);
  } else {
    console.error(`Could not start the API (${error.code ?? 'unknown error'}).`);
  }
  process.exit(1);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
