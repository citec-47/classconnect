/**
 * Money.
 *
 * CON-02 / DAT-002: XAF is a zero-decimal currency. All monetary values are
 * whole-franc integers held as bigint. Floating-point types are prohibited for
 * monetary values anywhere in the system — this module is the only sanctioned
 * way to do arithmetic on money, and it never produces a float.
 */

export const CURRENCY = 'XAF' as const;

export class MoneyError extends Error {}

/** Guards against a float sneaking in from JSON, a form body, or a provider. */
export function toXaf(value: number | string | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new MoneyError(`XAF amounts must be whole francs, received ${value}`);
    }
    return BigInt(value);
  }
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new MoneyError(`XAF amounts must be whole francs, received "${value}"`);
  }
  return BigInt(trimmed);
}

/**
 * FR-LDG-005: any calculation producing a fraction rounds half-up to the
 * nearest franc. Implemented on integers so no float is involved.
 */
export function applyPercent(amount: bigint, percent: number): bigint {
  if (!Number.isFinite(percent)) throw new MoneyError('percent must be finite');
  // Scale the percentage to an integer so the division stays exact:
  //   amount x percent / 100  ==  amount x (percent x 10_000) / 1_000_000
  const scaledPercent = BigInt(Math.round(percent * 10_000));
  return roundHalfUpDiv(amount * scaledPercent, 1_000_000n);
}

/** Half-up division on integers. Negative numerators round away from zero. */
export function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError('division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * FR-LDG-005: rounding remainders are explicitly allocated so that split
 * amounts always sum exactly to the source amount.
 *
 * Splits `total` across `weights` proportionally. The largest-remainder method
 * distributes the leftover francs, and the result is asserted to sum exactly.
 */
export function splitProportionally(total: bigint, weights: readonly bigint[]): bigint[] {
  if (weights.length === 0) return [];

  const weightSum = weights.reduce((a, b) => a + b, 0n);
  if (weightSum <= 0n) {
    // Nothing to apportion against — the caller must decide what to do with it
    // (FR-ERN-004 sends this to an unallocated account rather than the platform).
    return weights.map(() => 0n);
  }

  const shares: bigint[] = [];
  const remainders: { index: number; remainder: bigint }[] = [];
  let allocated = 0n;

  for (let i = 0; i < weights.length; i++) {
    const weight = weights[i] ?? 0n;
    const exact = total * weight;
    const share = exact / weightSum;
    shares.push(share);
    remainders.push({ index: i, remainder: exact % weightSum });
    allocated += share;
  }

  // Distribute the leftover, largest remainder first; ties break by index so the
  // allocation is deterministic and therefore reproducible in an audit.
  let leftover = total - allocated;
  remainders.sort((a, b) => (b.remainder === a.remainder ? a.index - b.index : b.remainder > a.remainder ? 1 : -1));

  let cursor = 0;
  while (leftover > 0n && remainders.length > 0) {
    const target = remainders[cursor % remainders.length];
    if (target) shares[target.index] = (shares[target.index] ?? 0n) + 1n;
    leftover -= 1n;
    cursor++;
  }

  const check = shares.reduce((a, b) => a + b, 0n);
  if (check !== total) {
    throw new MoneyError(`split did not reconcile: ${check} != ${total}`);
  }
  return shares;
}

/**
 * UI-009: monetary values display as whole XAF with thousands separators and
 * the suffix "FCFA" — e.g. 15 000 FCFA.
 */
export function formatXaf(amount: bigint | number, locale: 'en' | 'fr' = 'en'): string {
  const value = typeof amount === 'bigint' ? amount : BigInt(Math.round(amount));
  const grouped = new Intl.NumberFormat(locale === 'fr' ? 'fr-CM' : 'en-CM', {
    useGrouping: true,
  }).format(value);
  // Normalise whichever grouping separator the locale picked to a thin space so
  // both languages render identically (NFR-LOC-004).
  return `${grouped.replace(/[,  .]/g, ' ')} FCFA`;
}
