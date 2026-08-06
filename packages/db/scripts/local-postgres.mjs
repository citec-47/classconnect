/**
 * Local PostgreSQL for development, without Docker.
 *
 * §2.4 specifies PostgreSQL 15+, and `docker compose up postgres` is the
 * documented way to get it. This script is the fallback for a workstation where
 * Docker Desktop is unavailable: it runs a real PostgreSQL server from the
 * official binaries as a child process, on the same port and with the same
 * credentials as docker-compose.yml, so DATABASE_URL is identical either way.
 *
 * Development only. It is not a deployment mechanism and is never used by CI or
 * production, which use the managed PostgreSQL described in §2.4.
 *
 * The PostgreSQL binaries are platform-specific, so they are declared as
 * OPTIONAL dependencies in package.json. npm fails a normal dependency outright
 * when the platform does not match — that is what broke the Linux install on
 * Vercel. As optional dependencies they are skipped silently off-platform, and
 * this script simply will not run there, which is correct: nothing outside a
 * developer machine should be starting a database as a child process.
 *
 * Usage:
 *   node scripts/local-postgres.mjs start   # start and stay in the foreground
 *   node scripts/local-postgres.mjs stop    # stop a server started earlier
 */
import EmbeddedPostgres from 'embedded-postgres';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '.pgdata');

// Mirrors docker-compose.yml so DATABASE_URL does not change between the two.
const options = {
  databaseDir: dataDir,
  user: 'classconnect',
  password: 'classconnect_dev',
  port: 5433,
  persistent: true,
  // DAT-003: timestamps are stored in UTC.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
};

const command = process.argv[2] ?? 'start';

async function start() {
  const firstRun = !existsSync(dataDir);
  if (firstRun) mkdirSync(dataDir, { recursive: true });

  const pg = new EmbeddedPostgres(options);

  if (firstRun) {
    console.log('Initialising a new PostgreSQL cluster (first run)…');
    await pg.initialise();
  }

  await pg.start();
  console.log(`PostgreSQL listening on localhost:${options.port}`);

  if (firstRun) {
    await pg.createDatabase('classconnect');
    console.log('Created database "classconnect"');
  }

  console.log('DATABASE_URL=postgresql://classconnect:classconnect_dev@localhost:5433/classconnect');
  console.log('Press Ctrl+C to stop.');

  const shutdown = async () => {
    console.log('\nStopping PostgreSQL…');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep the process alive.
  await new Promise(() => {});
}

async function stop() {
  const pg = new EmbeddedPostgres(options);
  await pg.stop();
  console.log('PostgreSQL stopped.');
}

if (command === 'start') {
  await start();
} else if (command === 'stop') {
  await stop();
} else {
  console.error(`Unknown command "${command}". Use "start" or "stop".`);
  process.exit(1);
}
