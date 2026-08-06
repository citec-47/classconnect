/**
 * File acceptance policy.
 *
 * FR-FIL-002: an allow-list of file types by extension *and* by content
 * sniffing, rejecting executables and archives.
 *
 * The allow-list is expressed as a table rather than scattered checks so that
 * "what may be uploaded" is answerable by reading one file, and so the same
 * rules apply when signing an upload and when confirming it.
 */

export interface FileKind {
  mime: string;
  extensions: readonly string[];
  /** Leading bytes that must be present, in hex. Empty where the format has none. */
  magic: readonly string[];
  /** Cloudinary's resource_type for this kind. */
  resourceType: 'image' | 'raw' | 'video';
}

/**
 * FR-TVR-002: certificates, diplomas, ID and teaching authorisation in PDF,
 * JPG, PNG or HEIC, up to 10 MB per file.
 */
export const TEACHER_DOCUMENT_KINDS: readonly FileKind[] = [
  { mime: 'application/pdf', extensions: ['pdf'], magic: ['25504446'], resourceType: 'raw' },
  { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], magic: ['ffd8ff'], resourceType: 'image' },
  { mime: 'image/png', extensions: ['png'], magic: ['89504e470d0a1a0a'], resourceType: 'image' },
  // HEIC is an ISO-BMFF container: bytes 4..8 are 'ftyp', then a brand.
  { mime: 'image/heic', extensions: ['heic', 'heif'], magic: [], resourceType: 'image' },
];

export const TEACHER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // FR-TVR-002: 10 MB

/**
 * FR-HWK-003: up to 10 files and 25 MB per submission, including photographs of
 * handwritten work.
 */
export const SUBMISSION_KINDS: readonly FileKind[] = [
  ...TEACHER_DOCUMENT_KINDS,
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    // DOCX is a ZIP container. It is allowed by MIME but the magic bytes are
    // ZIP's, so content sniffing alone cannot separate it from an archive —
    // see `looksLikeArchive` below, which treats a bare ZIP as rejected.
    magic: ['504b0304'],
    resourceType: 'raw',
  },
];

export const SUBMISSION_MAX_BYTES = 25 * 1024 * 1024;
export const SUBMISSION_MAX_FILES = 10;

/**
 * FR-FIL-002: executables and archives are rejected outright. Listed by
 * extension because these are what a user might try to attach, and by magic
 * bytes because an extension is trivially renamed.
 */
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'dll', 'com', 'bat', 'cmd', 'msi', 'scr', 'cpl', 'jar', 'apk',
  'sh', 'bash', 'ps1', 'vbs', 'js', 'jse', 'wsf', 'lnk', 'reg',
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg', 'cab',
]);

const BLOCKED_MAGIC: readonly { hex: string; label: string }[] = [
  { hex: '4d5a', label: 'Windows executable' },
  { hex: '7f454c46', label: 'ELF executable' },
  { hex: 'cafebabe', label: 'Java class' },
  { hex: 'feedface', label: 'Mach-O executable' },
  { hex: 'cffaedfe', label: 'Mach-O executable' },
  { hex: '526172211a07', label: 'RAR archive' },
  { hex: '377abcaf271c', label: '7-Zip archive' },
  { hex: '1f8b', label: 'gzip archive' },
];

export function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index === -1 ? '' : fileName.slice(index + 1).toLowerCase();
}

export interface PolicyRejection {
  messageKey: string;
  params?: Record<string, string | number>;
}

/**
 * Checks a declared file against the policy, before an upload is signed.
 *
 * The declared name, type and size come from the client and cannot be trusted;
 * this refuses the obviously disallowed so a bad upload is never signed. The
 * authoritative check happens again on confirmation, against what the storage
 * provider actually received.
 */
export function checkDeclaredFile(
  file: { fileName: string; mimeType: string; sizeBytes: number },
  kinds: readonly FileKind[],
  maxBytes: number,
): PolicyRejection | null {
  const extension = extensionOf(file.fileName);

  if (!extension) {
    return { messageKey: 'errors.file.no_extension' };
  }
  if (BLOCKED_EXTENSIONS.has(extension)) {
    return { messageKey: 'errors.file.type_blocked', params: { extension } };
  }
  if (file.sizeBytes <= 0) {
    return { messageKey: 'errors.file.empty' };
  }
  if (file.sizeBytes > maxBytes) {
    return {
      messageKey: 'errors.file.too_large',
      params: { maxMb: Math.floor(maxBytes / (1024 * 1024)) },
    };
  }

  const kind = kinds.find(
    (candidate) =>
      candidate.mime === file.mimeType.toLowerCase() &&
      candidate.extensions.includes(extension),
  );
  if (!kind) {
    // The extension and the declared type must agree *and* both be allowed —
    // a PDF named .png is as suspicious as a disallowed type.
    return {
      messageKey: 'errors.file.type_not_allowed',
      params: { allowed: kinds.flatMap((k) => k.extensions).join(', ') },
    };
  }

  return null;
}

export function kindFor(
  fileName: string,
  mimeType: string,
  kinds: readonly FileKind[],
): FileKind | undefined {
  const extension = extensionOf(fileName);
  return kinds.find(
    (kind) => kind.mime === mimeType.toLowerCase() && kind.extensions.includes(extension),
  );
}

/**
 * FR-FIL-002, content-sniffing half: verifies the leading bytes match the
 * declared kind. Used where the bytes are available to the API.
 */
export function magicMatches(header: Buffer, kind: FileKind): boolean {
  if (kind.magic.length === 0) {
    // HEIC and other ISO-BMFF containers: bytes 4..8 spell 'ftyp'.
    if (kind.mime === 'image/heic') {
      return header.length >= 12 && header.subarray(4, 8).toString('latin1') === 'ftyp';
    }
    return true;
  }
  const hex = header.toString('hex').toLowerCase();
  return kind.magic.some((prefix) => hex.startsWith(prefix.toLowerCase()));
}

/** Returns the label of a blocked format when the header matches one. */
export function blockedFormat(header: Buffer): string | null {
  const hex = header.toString('hex').toLowerCase();
  for (const blocked of BLOCKED_MAGIC) {
    if (hex.startsWith(blocked.hex)) return blocked.label;
  }
  return null;
}

/**
 * A bare ZIP is rejected (FR-FIL-002), but DOCX is a ZIP. Only a file declared
 * as an Office format may carry ZIP magic bytes.
 */
export function looksLikeArchive(header: Buffer, declaredMime: string): boolean {
  const isZip = header.toString('hex').toLowerCase().startsWith('504b0304');
  if (!isZip) return false;
  return !declaredMime.startsWith('application/vnd.openxmlformats-officedocument');
}
