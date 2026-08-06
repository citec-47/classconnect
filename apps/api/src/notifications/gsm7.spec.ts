import { encodeSms, isGsm7, toGsm7Friendly } from './gsm7';
import { catalogues, t } from '@classconnect/shared';

/**
 * SI-007: "support both English and French bodies within GSM-7 where possible".
 *
 * The commercial stake: one character outside GSM-7 drops a segment from 160
 * characters to 70, so a message that fitted one segment can suddenly cost
 * three. These tests assert that our real French copy stays on the cheap
 * alphabet without losing its accents.
 */

describe('GSM-7 detection', () => {
  it('accepts plain English', () => {
    expect(isGsm7('Your ClassConnect code is 123456. It expires in 5 minutes.')).toBe(true);
  });

  it('accepts the French accents that GSM-7 actually contains', () => {
    // è é à ù ì ò ö ñ ü are in the basic set.
    expect(isGsm7('Vérifié à Yaoundé, où il était')).toBe(true);
  });

  it('rejects the French letters GSM-7 lacks, which is the surprising part', () => {
    // The alphabet has É but not lowercase ç, and no circumflex or dieresis at
    // all. These three words appear throughout the French copy.
    expect(isGsm7('ça')).toBe(false); // lowercase cedilla
    expect(isGsm7('prêt')).toBe(false); // circumflex
    expect(isGsm7('août')).toBe(false);
    expect(isGsm7('Noël')).toBe(false); // dieresis
  });

  it('rejects typographic punctuation', () => {
    expect(isGsm7('l’application')).toBe(false); // curly apostrophe
    expect(isGsm7('« guillemets »')).toBe(false);
    expect(isGsm7('Chargement…')).toBe(false);
    expect(isGsm7('1ʳᵉ année')).toBe(false);
  });
});

describe('transliteration keeps meaning, drops typography', () => {
  it('replaces punctuation that GSM-7 lacks', () => {
    expect(toGsm7Friendly('l’application')).toBe("l'application");
    expect(toGsm7Friendly('« oui »')).toBe('" oui "');
    expect(toGsm7Friendly('Chargement…')).toBe('Chargement...');
    expect(toGsm7Friendly('1ʳᵉ année')).toBe('1re année');
  });

  it('keeps the accents GSM-7 has and drops only the ones it lacks', () => {
    const out = toGsm7Friendly('Votre diplôme a été vérifié à Buéa où ça compte');

    // Present in GSM-7, so untouched.
    expect(out).toContain('été');
    expect(out).toContain('vérifié');
    expect(out).toContain('à');
    expect(out).toContain('où');

    // Absent from GSM-7. Losing these is the accepted SMS compromise; keeping
    // them would triple the segment count.
    expect(out).toContain('diplome'); // ô
    expect(out).toContain('ca compte'); // ç

    expect(isGsm7(out)).toBe(true);
  });
});

describe('encodeSms', () => {
  it('leaves a clean English message alone', () => {
    const result = encodeSms('Your ClassConnect code is 123456.');
    expect(result.encoding).toBe('GSM-7');
    expect(result.segments).toBe(1);
    expect(result.transliterated).toBe(false);
  });

  it('moves French onto GSM-7 by fixing the typography', () => {
    const result = encodeSms('Votre code ClassConnect est 123456. Ne le partagez pas.');
    expect(result.encoding).toBe('GSM-7');
    expect(result.transliterated).toBe(false);
  });

  it('reports when transliteration saved the message from UCS-2', () => {
    const result = encodeSms('Bonjour, l’équipe vous répond…');
    expect(result.encoding).toBe('GSM-7');
    expect(result.transliterated).toBe(true);
    expect(result.body).toContain("l'équipe");
  });

  it('counts concatenated segments at 153 septets, not 160', () => {
    expect(encodeSms('a'.repeat(160)).segments).toBe(1);
    expect(encodeSms('a'.repeat(161)).segments).toBe(2);
    expect(encodeSms('a'.repeat(306)).segments).toBe(2);
    expect(encodeSms('a'.repeat(307)).segments).toBe(3);
  });

  it('falls back to UCS-2 only when a character genuinely has no equivalent', () => {
    const result = encodeSms('Your code is 123456 🎓');
    expect(result.encoding).toBe('UCS-2');
    // The original typography is kept: we are paying for the wide alphabet anyway.
    expect(result.body).toContain('🎓');
  });

  it('counts UCS-2 segments at 70 units alone and 67 concatenated', () => {
    // An emoji outside the BMP is a surrogate pair and costs two units, which
    // is exactly the sort of thing that makes a "70 character" limit misleading.
    expect(encodeSms('a'.repeat(68) + '🎓').segments).toBe(1); // 68 + 2 = 70
    expect(encodeSms('a'.repeat(69) + '🎓').segments).toBe(2); // 71
  });
});

describe('the real OTP messages fit one segment', () => {
  // The OTP is the message that must never cost more than it has to: it is the
  // highest-volume transactional send in the system (FR-AUT-004 permits up to
  // 10 per number per day).
  it.each(['en', 'fr'] as const)('%s OTP is one GSM-7 segment', (language) => {
    const body = t(language, 'notifications.otp.body', { code: '123456', minutes: 5 });
    const result = encodeSms(body);
    expect(result.encoding).toBe('GSM-7');
    expect(result.segments).toBe(1);
  });
});

describe('every SMS-bound template survives encoding', () => {
  /**
   * Walks the notification strings in both catalogues and asserts none of them
   * silently lands on UCS-2 after transliteration. A regression here is a
   * doubled SMS bill, which nothing else in the suite would catch.
   */
  it.each(['en', 'fr'] as const)('%s notification bodies stay on GSM-7', (language) => {
    const notifications = catalogues[language].notifications as Record<string, unknown>;
    const offenders: string[] = [];

    const walk = (node: unknown, path: string) => {
      if (typeof node === 'string') {
        if (encodeSms(node).encoding !== 'GSM-7') offenders.push(path);
        return;
      }
      if (typeof node !== 'object' || node === null) return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        walk(value, path ? `${path}.${key}` : key);
      }
    };

    walk(notifications, '');
    expect(offenders).toEqual([]);
  });
});
