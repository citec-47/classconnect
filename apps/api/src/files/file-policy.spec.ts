import {
  TEACHER_DOCUMENT_KINDS,
  TEACHER_DOCUMENT_MAX_BYTES,
  SUBMISSION_KINDS,
  checkDeclaredFile,
  kindFor,
  extensionOf,
  magicMatches,
  blockedFormat,
  looksLikeArchive,
} from './file-policy';

/**
 * FR-FIL-002: an allow-list by extension and by content sniffing, rejecting
 * executables and archives.
 * FR-TVR-002: PDF, JPG, PNG or HEIC up to 10 MB per file.
 */

const pdf = { fileName: 'diploma.pdf', mimeType: 'application/pdf', sizeBytes: 120_000 };

describe('file policy — FR-TVR-002: what a teacher may upload', () => {
  it('accepts each permitted credential format', () => {
    const permitted = [
      { fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 1000 },
      { fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 },
      { fileName: 'a.jpeg', mimeType: 'image/jpeg', sizeBytes: 1000 },
      { fileName: 'a.png', mimeType: 'image/png', sizeBytes: 1000 },
      { fileName: 'a.heic', mimeType: 'image/heic', sizeBytes: 1000 },
    ];
    for (const file of permitted) {
      expect(checkDeclaredFile(file, TEACHER_DOCUMENT_KINDS, TEACHER_DOCUMENT_MAX_BYTES)).toBeNull();
    }
  });

  it('enforces the 10 MB limit', () => {
    expect(
      checkDeclaredFile(
        { ...pdf, sizeBytes: TEACHER_DOCUMENT_MAX_BYTES },
        TEACHER_DOCUMENT_KINDS,
        TEACHER_DOCUMENT_MAX_BYTES,
      ),
    ).toBeNull();

    const tooBig = checkDeclaredFile(
      { ...pdf, sizeBytes: TEACHER_DOCUMENT_MAX_BYTES + 1 },
      TEACHER_DOCUMENT_KINDS,
      TEACHER_DOCUMENT_MAX_BYTES,
    );
    expect(tooBig?.messageKey).toBe('errors.file.too_large');
    expect(tooBig?.params?.maxMb).toBe(10);
  });

  it('refuses an empty file', () => {
    expect(
      checkDeclaredFile({ ...pdf, sizeBytes: 0 }, TEACHER_DOCUMENT_KINDS, TEACHER_DOCUMENT_MAX_BYTES)
        ?.messageKey,
    ).toBe('errors.file.empty');
  });

  it('refuses a file with no extension', () => {
    expect(
      checkDeclaredFile(
        { fileName: 'diploma', mimeType: 'application/pdf', sizeBytes: 1000 },
        TEACHER_DOCUMENT_KINDS,
        TEACHER_DOCUMENT_MAX_BYTES,
      )?.messageKey,
    ).toBe('errors.file.no_extension');
  });

  it('refuses a document format the SRS does not list', () => {
    // DOCX is permitted for homework (FR-HWK-003) but not for credentials.
    const docx = {
      fileName: 'cv.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 1000,
    };
    expect(
      checkDeclaredFile(docx, TEACHER_DOCUMENT_KINDS, TEACHER_DOCUMENT_MAX_BYTES)?.messageKey,
    ).toBe('errors.file.type_not_allowed');
    expect(checkDeclaredFile(docx, SUBMISSION_KINDS, TEACHER_DOCUMENT_MAX_BYTES)).toBeNull();
  });
});

describe('file policy — FR-FIL-002: executables and archives are rejected', () => {
  const blocked = ['exe', 'dll', 'msi', 'bat', 'sh', 'ps1', 'jar', 'apk', 'js', 'vbs', 'lnk'];

  it.each(blocked)('refuses a .%s file outright', (extension) => {
    const result = checkDeclaredFile(
      { fileName: `payload.${extension}`, mimeType: 'application/pdf', sizeBytes: 1000 },
      TEACHER_DOCUMENT_KINDS,
      TEACHER_DOCUMENT_MAX_BYTES,
    );
    expect(result?.messageKey).toBe('errors.file.type_blocked');
  });

  it.each(['zip', 'rar', '7z', 'tar', 'gz', 'iso', 'dmg'])(
    'refuses the .%s archive format',
    (extension) => {
      const result = checkDeclaredFile(
        { fileName: `bundle.${extension}`, mimeType: 'application/pdf', sizeBytes: 1000 },
        TEACHER_DOCUMENT_KINDS,
        TEACHER_DOCUMENT_MAX_BYTES,
      );
      expect(result?.messageKey).toBe('errors.file.type_blocked');
    },
  );

  it('refuses an executable renamed to a permitted extension', () => {
    // The declared type and extension agree, so the declaration passes — this
    // is precisely why content sniffing exists as a second gate.
    const declared = { fileName: 'certificate.pdf', mimeType: 'application/pdf', sizeBytes: 5000 };
    expect(
      checkDeclaredFile(declared, TEACHER_DOCUMENT_KINDS, TEACHER_DOCUMENT_MAX_BYTES),
    ).toBeNull();

    // MZ — a Windows executable wearing a .pdf name.
    const header = Buffer.from('4d5a90000300000004000000', 'hex');
    expect(blockedFormat(header)).toBe('Windows executable');
    const kind = kindFor(declared.fileName, declared.mimeType, TEACHER_DOCUMENT_KINDS)!;
    expect(magicMatches(header, kind)).toBe(false);
  });

  it('refuses a mismatched extension and declared type', () => {
    // A PDF named .png, or the reverse, is refused before anything is signed.
    expect(
      checkDeclaredFile(
        { fileName: 'scan.png', mimeType: 'application/pdf', sizeBytes: 1000 },
        TEACHER_DOCUMENT_KINDS,
        TEACHER_DOCUMENT_MAX_BYTES,
      )?.messageKey,
    ).toBe('errors.file.type_not_allowed');
  });
});

describe('file policy — content sniffing', () => {
  it('recognises a genuine PDF header', () => {
    const kind = kindFor('a.pdf', 'application/pdf', TEACHER_DOCUMENT_KINDS)!;
    expect(magicMatches(Buffer.from('255044462d312e34', 'hex'), kind)).toBe(true);
    expect(magicMatches(Buffer.from('68656c6c6f', 'hex'), kind)).toBe(false);
  });

  it('recognises genuine JPEG and PNG headers', () => {
    const jpeg = kindFor('a.jpg', 'image/jpeg', TEACHER_DOCUMENT_KINDS)!;
    expect(magicMatches(Buffer.from('ffd8ffe000104a46', 'hex'), jpeg)).toBe(true);

    const png = kindFor('a.png', 'image/png', TEACHER_DOCUMENT_KINDS)!;
    expect(magicMatches(Buffer.from('89504e470d0a1a0a', 'hex'), png)).toBe(true);
    // A JPEG renamed .png does not match.
    expect(magicMatches(Buffer.from('ffd8ffe000104a46', 'hex'), png)).toBe(false);
  });

  it('recognises HEIC by its ISO-BMFF ftyp box', () => {
    const kind = kindFor('a.heic', 'image/heic', TEACHER_DOCUMENT_KINDS)!;
    // 4 bytes of size, then 'ftyp', then the brand.
    const header = Buffer.concat([
      Buffer.from('00000018', 'hex'),
      Buffer.from('ftypheic', 'latin1'),
      Buffer.from('00000000', 'hex'),
    ]);
    expect(magicMatches(header, kind)).toBe(true);
    expect(magicMatches(Buffer.from('00000018000000000000', 'hex'), kind)).toBe(false);
  });

  it.each([
    ['4d5a9000', 'Windows executable'],
    ['7f454c46', 'ELF executable'],
    ['526172211a07', 'RAR archive'],
    ['377abcaf271c', '7-Zip archive'],
    ['1f8b08', 'gzip archive'],
  ])('flags %s as a blocked format', (hex, label) => {
    expect(blockedFormat(Buffer.from(hex, 'hex'))).toBe(label);
  });

  it('treats a bare ZIP as an archive but allows DOCX, which is also a ZIP', () => {
    const zipHeader = Buffer.from('504b03040a000000', 'hex');
    expect(looksLikeArchive(zipHeader, 'application/pdf')).toBe(true);
    expect(
      looksLikeArchive(
        zipHeader,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(false);
  });
});

describe('extensionOf', () => {
  it('reads the last extension, so double extensions cannot hide one', () => {
    // "invoice.pdf.exe" is an executable, and must be judged as one.
    expect(extensionOf('invoice.pdf.exe')).toBe('exe');
    expect(extensionOf('DIPLOMA.PDF')).toBe('pdf');
    expect(extensionOf('no-extension')).toBe('');
  });

  it('rejects a double-extension executable', () => {
    expect(
      checkDeclaredFile(
        { fileName: 'invoice.pdf.exe', mimeType: 'application/pdf', sizeBytes: 1000 },
        TEACHER_DOCUMENT_KINDS,
        TEACHER_DOCUMENT_MAX_BYTES,
      )?.messageKey,
    ).toBe('errors.file.type_blocked');
  });
});
