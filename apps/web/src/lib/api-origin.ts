/**
 * Where the API lives, as the *server* half of the web app sees it.
 *
 * Distinct from `apiBase()` in `api.ts`, which answers the same question for
 * the browser. This one is read per request by the `/api/v1` bridge to decide
 * whether to forward, and it lives outside `src/pages` deliberately: anything
 * under that directory is a route, so a file there cannot be plain logic with a
 * test beside it.
 */

/**
 * The API's origin, if it is a different deployment from this one.
 *
 * Only the origin is kept. Both variables are commonly written with the
 * `/api/v1` suffix — the fetch helper needs it — and joining that onto a path
 * that already carries the prefix would ask the API for `/api/v1/api/v1/...`.
 * Whether the operator included the suffix should not decide whether sign-in
 * works.
 *
 * `API_ORIGIN` is checked first because it is the runtime setting, and
 * `NEXT_PUBLIC_API_URL` second because it is the documented one: setting either
 * is enough, and setting the public one after the build was made is picked up
 * here even though the client bundle still holds the old value.
 *
 * The four ways a value gets mangled on the way into a hosting dashboard are
 * absorbed rather than rejected: surrounding whitespace, surrounding quotes, the
 * variable name pasted along with its value, and the `/api/v1` suffix. Each has
 * cost this deployment an hour, each is unambiguous about what was meant, and
 * none of them is a reason to refuse to serve sign-in.
 */
export function upstreamOrigin(): string | undefined {
  const raw = (process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_URL ?? '').trim();
  const configured = raw
    // `API_ORIGIN=https://…` — the whole line pasted into the value field.
    .replace(/^(?:API_ORIGIN|NEXT_PUBLIC_API_URL)\s*=\s*/i, '')
    // Quoted the way it would be written in a shell, where quoting is required
    // and here is not.
    .replace(/^["'](.*)["']$/, '$1')
    .trim();

  // Empty means unset; a leading slash means the caller chose this same origin
  // deliberately, which is the in-process mode rather than a target.
  if (!configured || configured.startsWith('/')) return undefined;

  try {
    return new URL(configured).origin;
  } catch {
    // A bare host, written without a scheme. Assume the same TLS the frontend
    // is served over rather than refusing a value whose intent is unambiguous.
    try {
      return new URL(`https://${configured}`).origin;
    } catch {
      return undefined;
    }
  }
}
