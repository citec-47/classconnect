/**
 * Teacher self-registration through to admin verification.
 *
 *   ADMIN_PASSWORD=... node apps/api/test/e2e/teacher-self-registration.e2e.mjs <ADMIN_TOTP_SECRET>
 *
 * The point of this suite is that opening the intake does not open the gate:
 * a teacher can sign themselves up and say what they teach, but FR-TVR-003
 * still keeps them unlistable and unassignable until an Admin has worked the
 * checklist.
 */
import { createHmac } from 'node:crypto';

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const SECRET = process.argv[2];
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@classconnect.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) { console.error('set ADMIN_PASSWORD before running this suite'); process.exit(1); }
if (!SECRET) { console.error('usage: node teacher-self-registration.e2e.mjs <TOTP_SECRET>'); process.exit(1); }

let pass = 0, fail = 0;
const check = (n, c, d = '') => c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n} ${d}`));
const rnd = () => Math.floor(Math.random() * 9000000) + 1000000;
const phone = () => `+2376${rnd()}${Math.floor(Math.random() * 10)}`.slice(0, 13);

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret) {
  let bits = 0, value = 0; const bytes = [];
  for (const ch of secret) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; } }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const d = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const o = d[d.length - 1] & 0x0f;
  return ((((d[o] & 0x7f) << 24) | ((d[o+1] & 0xff) << 16) | ((d[o+2] & 0xff) << 8) | (d[o+3] & 0xff)) % 1_000_000).toString().padStart(6, '0');
}

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const secondary = (await call('/catalogue/levels?schoolType=secondary')).data;
const primary = (await call('/catalogue/levels?schoolType=primary')).data;
const form3 = secondary.find((l) => l.nameEn === 'Form 3');
const class2 = primary.find((l) => l.nameEn === 'Class 2');
const maths = form3.subjects.find((s) => s.nameEn === 'Mathematics');

console.log('\n=== FR-AUT-001: a teacher can sign themselves up ===');
const teacherPhone = phone();
const reg = await call('/auth/register', { method: 'POST', body: {
  role: 'teacher', fullName: 'Emmanuel Tabe', phone: teacherPhone,
  preferredLanguage: 'en', acceptedTerms: true,
  schoolType: 'secondary',
  subjects: [{ subjectId: maths.id, levelId: form3.id }],
  // Registering in English while teaching in both: the record must reflect
  // what was chosen, not the interface language.
  teachingLanguages: ['en', 'fr'],
} });
check('teacher registration succeeds', reg.status === 201, JSON.stringify(reg.data));
check('FR-AUT-002 phone verification is still required', reg.data?.requiresOtp === true);

const auth = await call('/auth/otp/verify', { method: 'POST', body: {
  phone: teacherPhone, code: reg.data.devCode, purpose: 'registration' } });
check('teacher signs in after verifying', auth.status === 200 && !!auth.data?.accessToken, JSON.stringify(auth.data));
const teacher = auth.data.accessToken;
const teacherId = (await call('/auth/me', { token: teacher })).data.id;

console.log('\n=== FR-TVR-001: subjects are recorded from registration ===');
const mine = await call('/teachers/me/application', { token: teacher });
check('application exists', mine.status === 200, JSON.stringify(mine.data));
check('FR-TVR-003 status is submitted, not approved', mine.data?.status === 'submitted', mine.data?.status);
check('the chosen subject is recorded', mine.data?.subjects?.some((p) => p.subject.nameEn === 'Mathematics'), JSON.stringify(mine.data?.subjects));
check('the chosen class is recorded', mine.data?.subjects?.some((p) => p.level.nameEn === 'Form 3'));
check('FR-TVR-001 teaching languages are taken from the choice, not the UI',
  Array.isArray(mine.data?.languages) && mine.data.languages.includes('fr') && mine.data.languages.includes('en'),
  JSON.stringify(mine.data?.languages));

console.log('\n=== registration validation ===');
const noSubjects = await call('/auth/register', { method: 'POST', body: {
  role: 'teacher', fullName: 'No Subjects', phone: phone(),
  preferredLanguage: 'en', acceptedTerms: true, schoolType: 'secondary', subjects: [] } });
check('a teacher cannot register without subjects', noSubjects.status === 400, `got ${noSubjects.status}`);

const noSchool = await call('/auth/register', { method: 'POST', body: {
  role: 'teacher', fullName: 'No School', phone: phone(),
  preferredLanguage: 'en', acceptedTerms: true,
  subjects: [{ subjectId: maths.id, levelId: form3.id }] } });
check('a teacher cannot register without a school type', noSchool.status === 400, `got ${noSchool.status}`);

const noLanguage = await call('/auth/register', { method: 'POST', body: {
  role: 'teacher', fullName: 'No Language', phone: phone(),
  preferredLanguage: 'en', acceptedTerms: true, schoolType: 'secondary',
  subjects: [{ subjectId: maths.id, levelId: form3.id }], teachingLanguages: [] } });
check('a teacher cannot register without a teaching language', noLanguage.status === 400, `got ${noLanguage.status}`);

const asStudent = await call('/auth/register', { method: 'POST', body: {
  role: 'student', fullName: 'Sneaky', phone: phone(), preferredLanguage: 'en', acceptedTerms: true } });
check('a student still cannot self-register', asStudent.status === 400, `got ${asStudent.status}`);

console.log('\n=== FR-TVR-003: registering is not being verified ===');
const listed = await call('/catalogue/teachers', { token: teacher });
check('the new teacher is not listed in the directory',
  !listed.data?.items?.some((i) => i.id === teacherId), `total ${listed.data?.total}`);

console.log('\n=== FR-TVR-001: the teacher completes their credentials ===');
const applied = await call('/teachers/me/application', { method: 'POST', token: teacher, body: {
  bio: 'Twelve years teaching mathematics.',
  yearsExperience: 12,
  highestQualification: 'DIPES II Mathematics',
  institution: 'ENS Bambili',
  qualificationYear: 2012,
  nationalId: '998877665544',
  languages: ['en'],
  subjects: [{ subjectId: maths.id, levelId: form3.id }],
  payoutMethod: 'mtn_momo',
  payoutWallet: '677998877',
} });
check('the application is accepted while open', applied.status === 201, JSON.stringify(applied.data));
check('FR-PRO-005 payout wallet comes back masked only',
  applied.data?.payoutWalletPreview?.startsWith('****') && !JSON.stringify(applied.data).includes('677998877'),
  applied.data?.payoutWalletPreview);

console.log('\n=== FR-FIL-002: document upload is available to the applicant ===');
const signed = await call('/files/teacher-documents/sign', { method: 'POST', token: teacher, body: {
  type: 'degree_certificate', fileName: 'diploma.pdf', mimeType: 'application/pdf', sizeBytes: 2048 } });
check('the teacher can request a signed upload', signed.status === 201, JSON.stringify(signed.data).slice(0, 160));

const blocked = await call('/files/teacher-documents/sign', { method: 'POST', token: teacher, body: {
  type: 'degree_certificate', fileName: 'payload.exe', mimeType: 'application/pdf', sizeBytes: 2048 } });
check('an executable is still refused', blocked.status === 400, `got ${blocked.status}`);

console.log('\n=== FR-TVR-004: the applicant reaches the admin queue ===');
const login = await call('/auth/login', { method: 'POST', body: {
  email: ADMIN_EMAIL, password: ADMIN_PASSWORD, mfaCode: totp(SECRET) } });
const admin = login.data.accessToken;
check('admin signed in', login.status === 200 && !!admin);

const queue = await call('/admin/verification/queue', { token: admin });
const entry = queue.data?.find((e) => e.teacherId === teacherId);
check('the self-registered teacher appears in the queue', !!entry);
check('their checklist is present', entry?.checklist?.length === 6, `${entry?.checklist?.length}`);
check('their subjects are visible to the admin', entry?.subjects?.some((p) => p.subject.nameEn === 'Mathematics'));

console.log('\n=== FR-TVR-005: approval still needs the full checklist ===');
const premature = await call(`/admin/verification/${teacherId}/decision`, { method: 'POST', token: admin, body: {
  decision: 'approved', checklist: [{ itemKey: 'identity', verified: true }] } });
check('approval is refused with an incomplete checklist',
  premature.status === 400 && premature.data?.messageKey === 'errors.verification.checklist_incomplete',
  JSON.stringify(premature.data));

const full = ['identity','qualification','institution','subjects','payout_name_match']
  .map((k) => ({ itemKey: k, verified: true, findings: 'Checked against the uploaded document.' }));
const approve = await call(`/admin/verification/${teacherId}/decision`, { method: 'POST', token: admin, body: {
  decision: 'approved', checklist: full } });
check('approval succeeds once every mandatory item is recorded',
  approve.status === 201 && approve.data?.status === 'approved', JSON.stringify(approve.data));

const nowListed = await call('/catalogue/teachers', { token: admin });
check('FR-TVR-003 the teacher becomes listable only after approval',
  nowListed.data?.items?.some((i) => i.id === teacherId), `total ${nowListed.data?.total}`);

console.log('\n=== the application closes once decided ===');
const afterApproval = await call('/teachers/me/application', { method: 'POST', token: teacher, body: {
  yearsExperience: 40, highestQualification: 'Rewritten', institution: 'Elsewhere',
  qualificationYear: 2020, nationalId: '111111111111', languages: ['en'],
  subjects: [{ subjectId: maths.id, levelId: form3.id }],
  payoutMethod: 'mtn_momo', payoutWallet: '677000000' } });
check('FR-TVR-010 an approved teacher cannot rewrite verified credentials',
  afterApproval.status === 409, `got ${afterApproval.status} ${JSON.stringify(afterApproval.data)}`);

console.log('\n=== Results ===');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
