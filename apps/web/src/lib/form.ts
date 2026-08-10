/**
 * Reading a submitted form, rather than trusting React state.
 *
 * A browser or OS autofill — a saved password, an address, an SMS one-time code
 * — writes straight into the DOM. It does not reliably fire the `change` event
 * React listens for, so a controlled input can *show* a value while `useState`
 * still holds an empty string.
 *
 * Everything derived from that state is then wrong. The visible symptom is a
 * submit button disabled on `!identifier || !password`: the user sees a
 * completely filled-in form above a button that will not respond, with nothing
 * to tell them why. NFR-USA-004 asks that a user always know what to do next,
 * and a dead control with no explanation is the opposite of that.
 *
 * At the moment of submit the form element is the authority. State stays for
 * rendering, which is what it is good at.
 *
 * The companion rule: do not disable a submit button because a field looks
 * empty. Mark the field `required` and let the browser refuse and explain. Keep
 * `disabled` for things the user genuinely cannot act on yet — an unticked
 * consent box (NFR-PRV-002), an incomplete verification checklist (FR-TVR-005) —
 * where the reason is visible on the same screen.
 */
export function fieldValue(
  form: HTMLFormElement,
  name: string,
  fallback = '',
): string {
  const value = new FormData(form).get(name);
  const fromDom = typeof value === 'string' ? value.trim() : '';
  return fromDom || fallback;
}
