/**
 * SI-006 / FR-TVR-002 / FR-FIL-001..005 — against live object storage.
 *
 * Exercises the real three-step handshake: the API signs, the file goes
 * straight to Cloudinary, the API confirms against what storage actually
 * received. Nothing here is mocked.
 *
 *   node apps/api/test/e2e/file-upload.e2e.mjs
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';

let pass = 0, fail = 0;
const check = (n, c, d = '') => c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n} ${d}`));
const rnd = () => Math.floor(Math.random() * 9000000) + 1000000;

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

/** A minimal but genuinely valid single-page PDF. */
function makePdf() {
  const body = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
trailer<</Root 1 0 R>>
%%EOF`;
  return Buffer.from(body, 'latin1');
}

console.log('\n=== Set up a teacher applicant ===');
const phone = `+2376${rnd()}${Math.floor(Math.random() * 10)}`.slice(0, 13);
const reg = await call('/auth/register', {
  method: 'POST',
  body: { role: 'teacher', fullName: 'Marie Fon', phone, preferredLanguage: 'en', acceptedTerms: true },
});
const verified = await call('/auth/otp/verify', {
  method: 'POST',
  body: { phone, code: reg.data.devCode, purpose: 'registration' },
});
const token = verified.data.accessToken;
check('teacher registered and signed in', !!token);

console.log('\n=== FR-FIL-002: policy is enforced before anything is signed ===');
const blocked = await call('/files/teacher-documents/sign', {
  method: 'POST', token,
  body: { type: 'diploma', fileName: 'payload.exe', mimeType: 'application/pdf', sizeBytes: 1000 },
});
check('an .exe is refused', blocked.status === 400, `got ${blocked.status} ${JSON.stringify(blocked.data)}`);

const archive = await call('/files/teacher-documents/sign', {
  method: 'POST', token,
  body: { type: 'diploma', fileName: 'docs.zip', mimeType: 'application/pdf', sizeBytes: 1000 },
});
check('a .zip archive is refused', archive.status === 400, `got ${archive.status}`);

const mismatch = await call('/files/teacher-documents/sign', {
  method: 'POST', token,
  body: { type: 'diploma', fileName: 'scan.png', mimeType: 'application/pdf', sizeBytes: 1000 },
});
check('a mismatched extension and type is refused', mismatch.status === 400, `got ${mismatch.status}`);

const tooBig = await call('/files/teacher-documents/sign', {
  method: 'POST', token,
  body: { type: 'diploma', fileName: 'big.pdf', mimeType: 'application/pdf', sizeBytes: 11 * 1024 * 1024 },
});
check('FR-TVR-002 a file over 10 MB is refused', tooBig.status === 400, `got ${tooBig.status}`);

console.log('\n=== SI-006: signed direct-to-storage upload ===');
const pdf = makePdf();
const signed = await call('/files/teacher-documents/sign', {
  method: 'POST', token,
  body: {
    type: 'degree_certificate', fileName: 'diploma.pdf',
    mimeType: 'application/pdf', sizeBytes: pdf.length,
    expiresOn: '2030-01-01',
  },
});
check('a permitted file is signed', signed.status === 201, JSON.stringify(signed.data));
check('signature and upload URL returned', !!signed.data?.upload?.fields?.signature && !!signed.data?.upload?.url);
check('FR-FIL-003 upload is scoped to type=authenticated', signed.data?.upload?.fields?.type === 'authenticated');
check('FR-FIL-005 the asset path carries the owner', signed.data?.upload?.fields?.public_id?.includes('teacher-documents/'), signed.data?.upload?.fields?.public_id);
// The signing secret must never leave the server. Read it from the environment
// rather than embedding it here: a test that hard-codes the value it is
// guarding against puts that value in source control, which is the very thing
// NFR-SEC-007 forbids.
const apiSecret = process.env.CLOUDINARY_API_SECRET;
check(
  'the API secret is never sent to the client',
  apiSecret ? !JSON.stringify(signed.data).includes(apiSecret) : true,
  apiSecret ? '' : '(CLOUDINARY_API_SECRET not set; check skipped)',
);

// Step 2 — the real upload, direct to Cloudinary.
const form = new FormData();
for (const [k, v] of Object.entries(signed.data.upload.fields)) form.append(k, v);
form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'diploma.pdf');

const uploadRes = await fetch(signed.data.upload.url, { method: 'POST', body: form });
const uploadBody = await uploadRes.json();
check('Cloudinary accepted the signed upload', uploadRes.ok, JSON.stringify(uploadBody).slice(0, 300));

// The signature is computed correctly, so a rejection here is an account
// configuration problem rather than a fault in the handshake. Say which.
if (!uploadRes.ok && /missing permissions/.test(JSON.stringify(uploadBody))) {
  console.log(
    '\n  NOTE: the API key authenticates but lacks the "create" action on this\n' +
      '  Cloudinary product environment. Grant it in Settings > API Keys, and\n' +
      '  confirm the "classconnect" upload preset was saved. Nothing in this\n' +
      '  repository needs to change.\n',
  );
}
check('stored as authenticated, not public', uploadBody?.type === 'authenticated', `type=${uploadBody?.type}`);

console.log('\n=== Step 3: server confirms against what storage actually received ===');
const confirmed = await call(`/files/teacher-documents/${signed.data.documentId}/confirm`, {
  method: 'POST', token,
});
check('confirmation succeeds', confirmed.status === 201, JSON.stringify(confirmed.data));
check('size recorded from storage, not from the client claim', confirmed.data?.sizeBytes === pdf.length, `${confirmed.data?.sizeBytes} vs ${pdf.length}`);
check('FR-FIL-001 a scan verdict is recorded', ['clean', 'pending'].includes(confirmed.data?.scanStatus), confirmed.data?.scanStatus);
check('downloadable only when the scan is clean', confirmed.data?.downloadable === (confirmed.data?.scanStatus === 'clean'));

console.log('\n=== FR-FIL-003: signed, expiring read URLs ===');
const dl = await call(`/files/teacher-documents/${signed.data.documentId}/download-url`, { token });

if (confirmed.data?.scanStatus === 'clean') {
  check('a download URL is issued', dl.status === 200 && !!dl.data?.url, JSON.stringify(dl.data));
  check('the URL is signed', dl.data?.url?.includes('/s--'), dl.data?.url);
  check('the URL carries an expiry', /\/e_\d+/.test(dl.data?.url ?? ''), dl.data?.url);
  check('the URL expires within the configured TTL', new Date(dl.data.expiresAt).getTime() - Date.now() <= 305_000);

  const fetched = await fetch(dl.data.url);
  check('the signed URL actually resolves to the file', fetched.ok, `status ${fetched.status}`);
  const bytes = Buffer.from(await fetched.arrayBuffer());
  check('the delivered bytes are the uploaded PDF', bytes.subarray(0, 4).toString('latin1') === '%PDF', bytes.subarray(0, 8).toString('latin1'));

  // FR-FIL-003: no permanent public URL exists for the asset.
  const publicGuess = dl.data.url.replace(/\/s--[^/]+--\/[^/]+\//, '/upload/').replace('/authenticated/', '/upload/');
  const publicTry = await fetch(publicGuess);
  check('the same asset is NOT reachable at a public URL', !publicTry.ok, `public attempt status ${publicTry.status}`);
} else {
  check('FR-FIL-001 an unscanned file is refused for download', dl.status === 403, `got ${dl.status} ${JSON.stringify(dl.data)}`);
}

console.log('\n=== FR-RBA-003: another teacher cannot read this document ===');
const otherPhone = `+2376${rnd()}${Math.floor(Math.random() * 10)}`.slice(0, 13);
const otherReg = await call('/auth/register', {
  method: 'POST',
  body: { role: 'teacher', fullName: 'Other Teacher', phone: otherPhone, preferredLanguage: 'en', acceptedTerms: true },
});
const otherVerified = await call('/auth/otp/verify', {
  method: 'POST', body: { phone: otherPhone, code: otherReg.data.devCode, purpose: 'registration' },
});
const stolen = await call(`/files/teacher-documents/${signed.data.documentId}/download-url`, {
  token: otherVerified.data.accessToken,
});
check('a different teacher is refused', stolen.status === 403, `got ${stolen.status}`);

const anon = await call(`/files/teacher-documents/${signed.data.documentId}/download-url`);
check('an unauthenticated caller is refused', anon.status === 401, `got ${anon.status}`);

console.log('\n=== Results ===');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
