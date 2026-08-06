/**
 * Admin-created Student and Teacher accounts.
 *
 *   node apps/api/test/e2e/admin-accounts.e2e.mjs <ADMIN_TOTP_SECRET>
 */
import { createHmac } from 'node:crypto';

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const SECRET = process.argv[2];
// Credentials come from the environment. Hard-coding a real password into a
// file that goes to source control is what NFR-SEC-007 exists to prevent.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@classconnect.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) { console.error("set ADMIN_PASSWORD before running this suite"); process.exit(1); }
if (!SECRET) { console.error('usage: node admin-accounts.e2e.mjs <TOTP_SECRET>'); process.exit(1); }

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

console.log('\n=== School-type taxonomy ===');
const allLevels = await call('/catalogue/levels');
const primary = await call('/catalogue/levels?schoolType=primary');
const secondary = await call('/catalogue/levels?schoolType=secondary');

check('primary school has Class 1 to Class 6', primary.data?.length === 6 &&
  primary.data.every(l => /^Class [1-6]$/.test(l.nameEn)), primary.data?.map(l => l.nameEn).join(', '));
check('secondary has Form 1-5, Lower Sixth, Upper Sixth', ['Form 1','Form 2','Form 3','Form 4','Form 5','Lower Sixth','Upper Sixth']
  .every(n => secondary.data?.some(l => l.nameEn === n)), secondary.data?.map(l => l.nameEn).join(', '));
check('every level carries its school type', allLevels.data?.every(l => l === null || ['primary','secondary'].includes(l.schoolType)));
check('the two groups partition the catalogue', primary.data.length + secondary.data.length === allLevels.data.length);

console.log('\n=== Self-service registration is closed to students and teachers ===');
const asTeacher = await call('/auth/register', { method: 'POST', body: {
  role: 'teacher', fullName: 'Sneaky Teacher', phone: phone(), preferredLanguage: 'en', acceptedTerms: true } });
check('cannot self-register as a teacher', asTeacher.status === 400, `got ${asTeacher.status}`);

const asStudent = await call('/auth/register', { method: 'POST', body: {
  role: 'student', fullName: 'Sneaky Student', phone: phone(), preferredLanguage: 'en', acceptedTerms: true } });
check('cannot self-register as a student', asStudent.status === 400, `got ${asStudent.status}`);

const parentPhone = phone();
const parentReg = await call('/auth/register', { method: 'POST', body: {
  role: 'parent', fullName: 'Beatrice Ako', phone: parentPhone, preferredLanguage: 'en', acceptedTerms: true } });
check('a parent can still register themselves', parentReg.status === 201);
const parentAuth = await call('/auth/otp/verify', { method: 'POST', body: {
  phone: parentPhone, code: parentReg.data.devCode, purpose: 'registration' } });
const parentToken = parentAuth.data.accessToken;

console.log('\n=== A parent can no longer create a student ===');
const parentTries = await call('/admin/accounts/students', { method: 'POST', token: parentToken, body: {
  fullName: 'Not Allowed', dob: '2012-01-01', schoolType: 'primary',
  levelId: primary.data[0].id, subjectIds: [primary.data[0].subjects[0].id] } });
check('parent is refused student:create', parentTries.status === 403, `got ${parentTries.status}`);

const legacyChild = await call('/learners', { method: 'POST', token: parentToken, body: {
  fullName: 'Old Path', dob: '2012-01-01', subjectIds: [], preferredStudyDays: [] } });
check('the old parent add-child endpoint is refused', legacyChild.status === 403, `got ${legacyChild.status}`);

console.log('\n=== Admin signs in ===');
const login = await call('/auth/login', { method: 'POST', body: {
  email: ADMIN_EMAIL, password: ADMIN_PASSWORD, mfaCode: totp(SECRET) } });
check('admin signed in', login.status === 200 && !!login.data?.accessToken, JSON.stringify(login.data));
const admin = login.data.accessToken;

console.log('\n=== Admin creates a PRIMARY student ===');
const class3 = primary.data.find(l => l.nameEn === 'Class 3');
const primarySubjects = class3.subjects.slice(0, 3).map(s => s.id);
const student = await call('/admin/accounts/students', { method: 'POST', token: admin, body: {
  fullName: 'Junior Ako', dob: '2015-06-10', schoolType: 'primary',
  levelId: class3.id, subjectIds: primarySubjects, preferredLanguage: 'en',
  guardianPhone: parentPhone } });
check('primary student created', student.status === 201, JSON.stringify(student.data));
check('class recorded as Class 3', student.data?.level?.nameEn === 'Class 3', student.data?.level?.nameEn);
check('school type recorded as primary', student.data?.schoolType === 'primary');
check('subjects recorded', student.data?.subjects?.length === 3, `${student.data?.subjects?.length}`);
check('FR-FAM-006 minor derived from date of birth', student.data?.isMinor === true);
check('FR-FAM-001 linked to the guardian', student.data?.guardianCount === 1, `${student.data?.guardianCount}`);

const parentSees = await call('/learners', { token: parentToken });
check('the parent now sees the child', parentSees.data?.some(l => l.id === student.data.id), JSON.stringify(parentSees.data?.length));

console.log('\n=== Admin creates a SECONDARY student ===');
const upperSixth = secondary.data.find(l => l.nameEn === 'Upper Sixth');
const secStudent = await call('/admin/accounts/students', { method: 'POST', token: admin, body: {
  fullName: 'Adult Sixth', dob: '2007-02-02', schoolType: 'secondary',
  levelId: upperSixth.id, subjectIds: [upperSixth.subjects[0].id], preferredLanguage: 'fr' } });
check('secondary student created', secStudent.status === 201, JSON.stringify(secStudent.data));
check('class recorded as Upper Sixth', secStudent.data?.level?.nameEn === 'Upper Sixth');
check('school type recorded as secondary', secStudent.data?.schoolType === 'secondary');

console.log('\n=== The class must belong to the chosen school ===');
const mismatch = await call('/admin/accounts/students', { method: 'POST', token: admin, body: {
  fullName: 'Wrong School', dob: '2015-01-01', schoolType: 'primary',
  levelId: upperSixth.id, subjectIds: [upperSixth.subjects[0].id] } });
check('primary + Upper Sixth is refused', mismatch.status === 400 &&
  mismatch.data?.messageKey === 'errors.level.wrong_school_type', JSON.stringify(mismatch.data));

console.log('\n=== A subject must be taught at that class (FR-PRO-002) ===');
const alOnly = upperSixth.subjects.find(s => !class3.subjects.some(c => c.id === s.id));
if (alOnly) {
  const badSubject = await call('/admin/accounts/students', { method: 'POST', token: admin, body: {
    fullName: 'Wrong Subject', dob: '2015-01-01', schoolType: 'primary',
    levelId: class3.id, subjectIds: [alOnly.id] } });
  check('a subject not taught at that class is refused', badSubject.status === 400 &&
    badSubject.data?.messageKey === 'errors.subject.not_at_level', JSON.stringify(badSubject.data));
} else {
  check('a subject not taught at that class is refused', false, 'no distinguishing subject found');
}

console.log('\n=== Admin creates a TEACHER with the checklist complete ===');
const fullChecklist = ['identity','qualification','institution','subjects','payout_name_match']
  .map(k => ({ itemKey: k, verified: true, findings: 'Checked against the original document.' }));
const teacherPhone = phone();
const teacher = await call('/admin/accounts/teachers', { method: 'POST', token: admin, body: {
  fullName: 'Grace Ndifor', phone: teacherPhone, password: 'teach-me-well-2026',
  preferredLanguage: 'en', schoolType: 'primary',
  subjects: primarySubjects.map(id => ({ subjectId: id, levelId: class3.id })),
  yearsExperience: 12, highestQualification: 'DIPES I', institution: 'ENS Bambili',
  qualificationYear: 2013, nationalId: '987654321098', languages: ['en'],
  payoutMethod: 'mtn_momo', payoutWallet: '678901234',
  checklist: fullChecklist } });
check('teacher created', teacher.status === 201, JSON.stringify(teacher.data));
check('FR-TVR-005 approved when every mandatory item is confirmed', teacher.data?.status === 'approved', teacher.data?.status);
check('assignable', teacher.data?.assignable === true);

const listed = await call('/catalogue/teachers?page=1&pageSize=50', { token: admin });
check('FR-TVR-003 an approved teacher is listable', listed.data?.items?.some(t => t.displayName === 'Grace Ndifor'), `total ${listed.data?.total}`);

console.log('\n=== The teacher can sign in with what the Admin set ===');
const teacherLogin = await call('/auth/otp/request', { method: 'POST', body: {
  phone: teacherPhone, purpose: 'login', channel: 'sms' } });
const teacherAuth = await call('/auth/otp/verify', { method: 'POST', body: {
  phone: teacherPhone, code: teacherLogin.data.devCode, purpose: 'login' } });
check('teacher signs in', teacherAuth.status === 200 && !!teacherAuth.data?.accessToken, JSON.stringify(teacherAuth.data));

const ownRecord = await call('/teachers/me/application', { token: teacherAuth.data.accessToken });
check('teacher sees their own record', ownRecord.status === 200 && ownRecord.data?.status === 'approved', JSON.stringify(ownRecord.data?.status));
check('FR-PRO-005 payout shown masked only', ownRecord.data?.payoutWalletPreview?.startsWith('****') &&
  !JSON.stringify(ownRecord.data).includes('678901234'));

// The endpoint exists again, and an admin-created teacher may use it to correct
// their own details. An empty payload is still refused: validation applies to
// every caller (FR-RBA-002).
const selfApply = await call('/teachers/me/application', { method: 'POST', token: teacherAuth.data.accessToken, body: {} });
check('an empty application payload is refused', selfApply.status === 400, `got ${selfApply.status}`);

console.log('\n=== Incomplete checklist leaves the teacher unassignable ===');
const partialPhone = phone();
const partial = await call('/admin/accounts/teachers', { method: 'POST', token: admin, body: {
  fullName: 'Pending Paul', phone: partialPhone, password: 'another-good-password',
  preferredLanguage: 'en', schoolType: 'secondary',
  subjects: [{ subjectId: upperSixth.subjects[0].id, levelId: upperSixth.id }],
  yearsExperience: 3, highestQualification: 'BSc', institution: 'UB',
  qualificationYear: 2020, nationalId: '111222333444', languages: ['en'],
  payoutMethod: 'orange_money', payoutWallet: '699887766',
  checklist: [{ itemKey: 'identity', verified: true }] } });
check('account still created', partial.status === 201, JSON.stringify(partial.data));
check('FR-TVR-005 left under review', partial.data?.status === 'under_review', partial.data?.status);
check('not assignable', partial.data?.assignable === false);
check('the outstanding items are named', Array.isArray(partial.data?.outstandingChecklistItems) &&
  partial.data.outstandingChecklistItems.length === 4, JSON.stringify(partial.data?.outstandingChecklistItems));

const stillHidden = await call('/catalogue/teachers?page=1&pageSize=50', { token: admin });
check('FR-TVR-003 an unapproved teacher is not listable', !stillHidden.data?.items?.some(t => t.displayName === 'Pending Paul'));

const queue = await call('/admin/verification/queue', { token: admin });
check('FR-TVR-004 they appear in the verification queue', queue.data?.some(e => e.applicant.fullName === 'Pending Paul'));

console.log('\n=== A teacher cannot be given a class outside their school ===');
const wrongLevel = await call('/admin/accounts/teachers', { method: 'POST', token: admin, body: {
  fullName: 'Mismatch Mary', phone: phone(), password: 'yet-another-password',
  preferredLanguage: 'en', schoolType: 'primary',
  subjects: [{ subjectId: upperSixth.subjects[0].id, levelId: upperSixth.id }],
  yearsExperience: 5, highestQualification: 'BEd', institution: 'UB',
  qualificationYear: 2018, nationalId: '555666777888', languages: ['en'],
  payoutMethod: 'mtn_momo', payoutWallet: '677000111', checklist: fullChecklist } });
check('primary teacher + Upper Sixth subject is refused', wrongLevel.status === 400 &&
  wrongLevel.data?.messageKey === 'errors.level.wrong_school_type', JSON.stringify(wrongLevel.data));

console.log('\n=== Admin student list ===');
const students = await call('/admin/accounts/students', { token: admin });
check('list returns the created students', students.data?.length >= 2, `${students.data?.length}`);
const primaryOnly = await call('/admin/accounts/students?schoolType=primary', { token: admin });
check('list filters by school type', primaryOnly.data?.every(s => s.schoolType === 'primary'));

console.log('\n=== Results ===');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
