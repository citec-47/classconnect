import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * COM-002: the web app and the API agree on the route table.
 *
 * Every path the browser calls must exist on a controller. Nothing else checks
 * this. A call to a route that was never written returns 404, and the client
 * cannot tell the difference between "no such endpoint" and "the server said
 * no" — a fire-and-forget write swallows it entirely, so the feature quietly
 * does nothing and every test still passes. That is exactly how the language
 * switcher shipped writing to an endpoint that did not exist: the visible half
 * of the switch worked, and the half that reaches notifications and receipts
 * (NFR-LOC-003) never ran.
 *
 * This is a static check on purpose. The e2e suite exercises the routes that
 * exist; the failure mode here is a route that does not, which no amount of
 * calling the API can reveal.
 */

const API_SRC = join(__dirname);
const WEB_SRC = join(__dirname, '..', '..', 'web', 'src');

function sourceFiles(root: string, extensions: string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path, extensions));
    } else if (extensions.some((extension) => entry.endsWith(extension))) {
      found.push(path);
    }
  }
  return found;
}

/** `/admin/people/teachers/:teacherId` → `['admin','people','teachers',':teacherId']`. */
function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/**
 * Reads the route table out of the Nest decorators.
 *
 * A file can declare more than one controller — `teachers.controller.ts` holds
 * both the teacher's own application and the admin verification queue — so the
 * prefix in force is whichever `@Controller` was seen most recently.
 */
function declaredRoutes(): string[] {
  const routes: string[] = [];
  const decorator = /@(Controller|Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?/g;

  for (const file of sourceFiles(API_SRC, ['.controller.ts'])) {
    let prefix = '';
    for (const [, kind, argument] of readFileSync(file, 'utf8').matchAll(decorator)) {
      if (kind === 'Controller') {
        prefix = argument ?? '';
      } else {
        routes.push([...segments(prefix), ...segments(argument ?? '')].join('/'));
      }
    }
  }
  return routes;
}

/**
 * Reads the paths the browser asks for out of the `api()` calls.
 *
 * Only literals starting with `/` count, which excludes `apiBase()` and the
 * option objects that follow the path. The query string is dropped — routing
 * never sees it — which also disposes of the inline `?a=${b}` filters before
 * they reach the segment comparison.
 *
 * The web app's own tests are skipped. A spec that drives the client calls
 * `api('/a')` with a path chosen to be short rather than real, and no such route
 * should exist — counting those makes this check permanently red, which costs it
 * the only thing it is for: being believed when it names a route that is
 * genuinely missing.
 */
function requestedPaths(): { path: string; file: string }[] {
  const requested: { path: string; file: string }[] = [];
  const call = /\bapi(?:<[^(]*?>)?\(\s*(['"`])(\/[^'"`]*)\1/g;

  const sources = sourceFiles(WEB_SRC, ['.ts', '.tsx']).filter(
    (file) => !/\.spec\.tsx?$/.test(file),
  );
  for (const file of sources) {
    for (const [, , path] of readFileSync(file, 'utf8').matchAll(call)) {
      requested.push({
        path: path!.split('?')[0]!,
        file: file.slice(WEB_SRC.length + 1),
      });
    }
  }
  return requested;
}

/**
 * Whether a requested path is served by a declared route.
 *
 * Both sides carry holes. The route's are `:params`; the client's are
 * interpolations — a segment that is entirely one (`${row.id}`) is an id and
 * matches anything, and one that merely ends in a query variable
 * (`students${query}`) is the literal part before it.
 */
function isServedBy(requested: string, route: string): boolean {
  const wanted = segments(requested);
  const offered = segments(route);
  if (wanted.length !== offered.length) return false;

  return wanted.every((segment, index) => {
    const against = offered[index]!;
    if (against.startsWith(':')) return true;
    if (segment.startsWith('${')) return true;
    return segment.split('${')[0] === against;
  });
}

describe('COM-002 — the web app calls routes the API declares', () => {
  const routes = declaredRoutes();

  it('finds both sides of the contract', () => {
    // A regex that silently matches nothing would make every assertion below
    // vacuous, so the fixtures assert themselves first.
    expect(routes.length).toBeGreaterThan(50);
    expect(requestedPaths().length).toBeGreaterThan(20);
  });

  it('serves every path the browser asks for', () => {
    const unserved = requestedPaths()
      .filter(({ path }) => !routes.some((route) => isServedBy(path, route)))
      .map(({ path, file }) => `${path}  (${file})`);

    expect(unserved).toEqual([]);
  });
});
