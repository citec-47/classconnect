/**
 * Makes sure the whole workspace is actually installed before anything is built.
 *
 * ## Why this exists
 *
 * A host may run its own install command, and that command may install only
 * part of this repository. Vercel's inferred one —
 * `npm install --include=dev --workspaces --include-workspace-root` — reported
 * "added 739 packages" against a lockfile holding 1113, and the ones it left
 * out were `apps/api`'s. The build then failed with
 * `TS2307: Cannot find module '@nestjs/common'` on every file in that workspace,
 * while `ws` resolved perfectly well because Next.js happens to depend on it.
 *
 * `vercel.json` sets `installCommand` to `npm ci --include=dev`, which installs
 * the lockfile in full. But a project whose dashboard overrides the install
 * command never reads that file, and the failure it produces is 160 lines of
 * compiler output that names a missing module rather than a missing install —
 * so the cause reads like broken source code.
 *
 * This closes that gap from inside the build itself, which every host runs.
 *
 * ## What it does not do
 *
 * It does not install on every build. Where the install was complete — a
 * developer machine, CI that ran `npm ci`, a host whose install command was
 * honoured — the sentinel check is a handful of `existsSync` calls and this
 * exits in milliseconds, having changed nothing.
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Runtime dependencies of `apps/api`, chosen because they are the ones a
 * partial install drops.
 *
 * Deliberately not devDependencies: those are legitimately absent when a host
 * installs with `--omit=dev`, and reinstalling on that basis would fight a
 * decision the host made on purpose. Every name here is a plain `dependency`,
 * so its absence means the install did not finish, not that it was trimmed.
 */
const SENTINELS = ['@nestjs/common', '@nestjs/core', 'express', 'livekit-server-sdk'];

const missing = SENTINELS.filter(
  (name) => !existsSync(join(root, 'node_modules', ...name.split('/'))),
);

if (missing.length === 0) process.exit(0);

console.log(
  `\n  Workspace dependencies are incomplete: ${missing.join(', ')} ${
    missing.length === 1 ? 'is' : 'are'
  } missing.\n` +
    '  These are runtime dependencies of apps/api, so the install that ran did\n' +
    '  not cover every workspace. Installing the full lockfile before building.\n',
);

try {
  // `npm ci` rather than `npm install`: it materialises the lockfile exactly,
  // for every workspace, and cannot itself install a subset. It removes
  // node_modules first, so the Prisma client goes with it — which is safe here
  // because the very next step of the build regenerates it.
  execSync('npm ci --include=dev --no-audit --no-fund', { cwd: root, stdio: 'inherit' });
} catch {
  console.error(
    '\n  Could not repair the install automatically.\n' +
      '  Set the install command for this deployment to `npm ci --include=dev`.\n',
  );
  process.exit(1);
}

const stillMissing = SENTINELS.filter(
  (name) => !existsSync(join(root, 'node_modules', ...name.split('/'))),
);

if (stillMissing.length > 0) {
  console.error(
    `\n  Still missing after a full install: ${stillMissing.join(', ')}.\n` +
      '  The lockfile and apps/api/package.json disagree; run `npm install` locally\n' +
      '  and commit the updated package-lock.json.\n',
  );
  process.exit(1);
}

console.log('  Workspace dependencies restored. Continuing the build.\n');
