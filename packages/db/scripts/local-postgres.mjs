/**
 * Local PostgreSQL for development. No Docker, no system install.
 *
 * §2.4 specifies PostgreSQL 15+. This runs a real PostgreSQL server from the
 * official binaries as a child process of npm, which means a new contributor
 * needs Node and nothing else.
 *
 * Development only, and deliberately so. It is not a deployment mechanism: the
 * deployed platform uses managed PostgreSQL (see docs/deployment.md), and
 * nothing outside a developer machine should be starting a database as a child
 * process. The binaries are optional dependencies in package.json, so on a
 * hosting platform they are skipped and this script simply cannot run.
 *
 * Usage:
 *   npm run db:local        # start and stay in the foreground
 *   npm run db:local:stop   # stop a server started earlier
 */
import EmbeddedPostgres from 'embedded-postgres';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '.pgdata');

/**
 * Port 5433 rather than 5432, so this never collides with a PostgreSQL a
 * developer already has installed and running for something else.
 */
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
