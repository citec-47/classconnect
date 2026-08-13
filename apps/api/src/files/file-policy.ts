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
  /*
   * PDFs are delivered as `image`, not `raw`.
   *
   * Cloudinary treats a PDF as a multi-page image and will happily store it
   * either way — but `raw` is the delivery type most often disabled on an
   * account, and it fails exactly like a permission error: authenticated, then
   * refused. `image` is enabled wherever photos work, which on this platform is
   * everywhere, because ID photographs are the common case.
   *
   * It is also better for the reviewer: as an `image`, Cloudinary can render a
   * page as a thumbnail, so a verification queue can show the certificate
   * rather than a filename.
   *
   * The magic bytes still identify it as a PDF, so nothing is loosened about
   * what may be uploaded — only about how it is stored.
   */
  { mime: 'application/pdf', extensions: ['pdf'], magic: ['25504446'], resourceType: 'image' },
  { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], magic: ['ffd8ff'], resourceType: 'image' },
  { mime: 'image/png', extensions: ['png'], magic: ['89504e470d0a1a0a'], resourceType: 'image' },
  // HEIC is an ISO-BMFF container: bytes 4..8 are 'ftyp', then a brand.
  { mime: 'image/heic', extensions: ['heic', 'heif'], magic: [], resourceType: 'image' },
];

export const TEACHER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // FR-TVR-002: 10 MB

/**
 * The applicant's spoken introduction.
 *
 * Separate from the document kinds because it is the one upload that is
 * deliberately video, and because 10 MB would not hold three minutes of it.
 *
 * The ceiling is 60 MB rather than something larger: the recorder caps the
 * bitrate at roughly 600 kbps, which puts three minutes near 13 MB. The
 * headroom is for a phone that ignores the hint, not an invitation to upload a
 * 4K clip from Cameroon on a metered connection.
 */
export const TEACHER_VIDEO_KINDS: readonly FileKind[] = [
  { mime: 'video/webm', extensions: ['webm'], magic: ['1a45dfa3'], resourceType: 'video' },
  { mime: 'video/mp4', extensions: ['mp4', 'm4v'], magic: [], resourceType: 'video' },
  { mime: 'video/quicktime', extensions: ['mov'], magic: [], resourceType: 'video' },
];

export const TEACHER_VIDEO_MAX_BYTES = 60 * 1024 * 1024;

/** FR-TVR-002 in spirit: long enough to judge, short enough to watch a queue of. */
export const TEACHER_VIDEO_MAX_SECONDS = 180;

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

/**
 * A lesson: what a teacher publishes to a class.
 *
 * The brief asks for "a PDF, Word document, image or video". Video is the
 * reason this is its own list rather than `SUBMISSION_KINDS` — a recorded
 * explanation is a lesson in a way it is never a homework submission, and the
 * ceiling below has to accommodate one.
 */
export const LESSON_KINDS: readonly FileKind[] = [
  ...SUBMISSION_KINDS,
  { mime: 'video/webm', extensions: ['webm'], magic: ['1a45dfa3'], resourceType: 'video' },
  { mime: 'video/mp4', extensions: ['mp4', 'm4v'], magic: [], resourceType: 'video' },
  { mime: 'audio/mpeg', extensions: ['mp3'], magic: ['494433', 'fffb', 'fff3', 'fff2'], resourceType: 'video' },
];

/**
 * 100 MB — larger than any other ceiling here, and deliberately.
 *
 * §6.2's target is a mobile connection, and a teacher who cannot upload a
 * recorded lesson simply does not publish one. The download side is where the
 * bandwidth is actually spent, and the brief explicitly wants a learner to be
 * able to keep a lesson offline rather than stream it repeatedly.
 */
export const LESSON_MAX_BYTES = 100 * 1024 * 1024;

/**
 * What may be attached to a message: photos, video, voice notes and documents.
 *
 * Wider than a submission because a conversation carries different things — a
 * learner photographs their exercise book, a teacher sends a marked-up PDF, and
 * either records a voice note when typing on a shared phone is slower than
 * speaking.
 *
 * Magic bytes are empty for the ISO-BMFF family (MP4, MOV, M4A) for the same
 * reason as HEIC: the identifying `ftyp` box sits at offset 4, not at the
 * start, so a leading-bytes test cannot see it. Cloudinary re-derives the real
 * resource type on confirm, which is the check that actually decides.
 */
export const MESSAGE_ATTACHMENT_KINDS: readonly FileKind[] = [
  ...SUBMISSION_KINDS,

  // Images a phone camera actually produces.
  { mime: 'image/webp', extensions: ['webp'], magic: ['52494646'], resourceType: 'image' },
  { mime: 'image/gif', extensions: ['gif'], magic: ['474946383961', '474946383761'], resourceType: 'image' },

  // Video. MP4 and MOV are ISO-BMFF; WebM is Matroska and does have a signature.
  { mime: 'video/mp4', extensions: ['mp4', 'm4v'], magic: [], resourceType: 'video' },
  { mime: 'video/quicktime', extensions: ['mov'], magic: [], resourceType: 'video' },
  { mime: 'video/webm', extensions: ['webm'], magic: ['1a45dfa3'], resourceType: 'video' },

  /*
   * Voice notes.
   *
   * `audio/webm` and `audio/ogg` are what Chrome and Firefox's MediaRecorder
   * emit; `audio/mp4` is Safari's. All three are needed or in-browser recording
   * works on some phones and not others — and the reference device is whatever
   * the family owns.
   *
   * Cloudinary treats audio as `video`, which is why the resource type below
   * looks wrong and is not.
   */
  { mime: 'audio/webm', extensions: ['webm'], magic: ['1a45dfa3'], resourceType: 'video' },
  { mime: 'audio/ogg', extensions: ['ogg', 'oga'], magic: ['4f676753'], resourceType: 'video' },
  { mime: 'audio/mp4', extensions: ['m4a', 'mp4'], magic: [], resourceType: 'video' },
  { mime: 'audio/mpeg', extensions: ['mp3'], magic: ['494433', 'fffb', 'fff3', 'fff2'], resourceType: 'video' },
];

/** FR-HWK-003's ceiling, applied to attachments too. */
export const MESSAGE_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
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
 * The kind for a stored file, from its MIME type alone.
 *
 * `kindFor` needs the file name because the extension and the declared type must
 * *agree* — that is the check that catches a PDF renamed to `.png`. Once a file
 * is stored, that check has already passed, and some tables here do not keep the
 * original name: `Material` holds a teacher-authored title, which may well end
 * in a full stop rather than `.pdf`.
 *
 * So this is for the later steps — confirming, reading, deleting — where the
 * only thing being decided is which Cloudinary resource type the asset lives
 * under. Where a MIME appears twice in a list (`video/webm` and `audio/webm`),
 * both entries carry the same resource type, so the first match is not a guess.
 */
export function kindForMime(
  mimeType: string,
  kinds: readonly FileKind[],
): FileKind | undefined {
  const mime = mimeType.toLowerCase();
  return kinds.find((kind) => kind.mime === mime);
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
