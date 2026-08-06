// Admin verification path: FR-AUT-009 MFA, FR-TVR-004/005/006/009.
import { createHmac } from 'node:crypto';

const BASE = 'http://localhost:4000/api/v1';
const SECRET = process.argv[2];
// Credentials come from the environment. Hard-coding a real password into a
// file that goes to source control is what NFR-SEC-007 exists to prevent.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@classconnect.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) { console.error("set ADMIN_PASSWORD before running this suite"); process.exit(1); }
if (!SECRET) { console.error('usage: node smoke-admin.mjs <TOTP_SECRET>'); process.exit(1); }

let pass = 0, fail = 0;
const check = (n, c, d = '') => c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n} ${d}`));

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret) {
  let bits = 0, value = 0; const bytes = [];
  for (const ch of secret) { value = (value << 5) | BASE32.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; } }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const d = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const o = d[d.length - 1] & 0x0f;
  const bin = ((d[o] & 0x7f) << 24) | ((d[o+1] & 0xff) << 16) | ((d[o+2] & 0xff) << 8) | (d[o+3] & 0xff);
  return (bin % 1_000_000).toString().padStart(6, '0');
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
const rnd = () => Math.floor(Math.random() * 9000000) + 1000000;

console.log('\n=== FR-AUT-009: staff MFA ===');

/*
 * DEV_DISABLE_STAFF_MFA lifts the requirement on a developer machine. When it
 * is set, the assertions below cannot hold — so the suite says the requirement
 * went unexercised rather than quietly reporting a pass it did not earn.
 */
const mfaEnforced = process.env.DEV_DISABLE_STAFF_MFA !== 'true';
let login;

if (!mfaEnforced) {
  console.log('  SKIP  DEV_DISABLE_STAFF_MFA=true — FR-AUT-009 is NOT exercised by this run.');
  console.log('        Unset it and re-run before trusting this suite as evidence.');

  const passwordOnly = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, deviceLabel: 'Admin desktop' } });
  check('admin signs in with a password alone (MFA disabled)', passwordOnly.status === 200 && !!passwordOnly.data?.accessToken, JSON.stringify(passwordOnly.data));
  login = passwordOnly;
} else {
  const noMfa = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  check('admin sign-in without MFA code is refused', noMfa.status === 401 && noMfa.data?.messageKey === 'errors.mfa.required', JSON.stringify(noMfa.data));

  const badMfa = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, mfaCode: '000000' } });
  check('admin sign-in with wrong MFA code is refused', badMfa.status === 401 && badMfa.data?.messageKey === 'errors.mfa.incorrect', JSON.stringify(badMfa.data));

  login = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, mfaCode: totp(SECRET), deviceLabel: 'Admin desktop' } });
  check('admin signs in with a valid TOTP code', login.status === 200 && !!login.data?.accessToken, JSON.stringify(login.data));
}

const admin = login.data.accessToken;

const wrongPw = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: 'wrong-password', mfaCode: totp(SECRET) } });
check('FR-AUT-003 wrong password refused', wrongPw.status === 401 && wrongPw.data?.messageKey === 'errors.password.incorrect');

console.log('\n=== Admin creates a teacher pending verification ===');
// A teacher no longer applies. The Admin creates the account, and leaving the
// checklist incomplete is what puts it in the verification queue.
const phone = `+2376${rnd()}${Math.floor(Math.random()*10)}`.slice(0, 13);
const levels = await call('/catalogue/levels?schoolType=secondary', { token: admin });
const gce = levels.data.find(l => l.code === 'GCE_OL');
const math = gce.subjects.find(s => s.nameEn === 'Mathematics') ?? gce.subjects[0];

const created = await call('/admin/accounts/teachers', { method: 'POST', token: admin, body: {
  fullName: 'Paul Tabi', phone, password: 'a-long-enough-password', preferredLanguage: 'fr',
  schoolType: 'secondary', subjects: [{ subjectId: math.id, levelId: gce.id }],
  bio: 'Fifteen years teaching mathematics.', yearsExperience: 15,
  highestQualification: 'DIPES II Mathematics', institution: 'ENS Yaoundé', qualificationYear: 2009,
  nationalId: '123456789012', languages: ['en','fr'],
  payoutMethod: 'mtn_momo', payoutWallet: '677123456',
  checklist: [],
}});
check('teacher account created by admin', created.status === 201, JSON.stringify(created.data));
check('with no checklist it is left under review', created.data?.status === 'under_review', created.data?.status);
const teacherId = created.data.teacherId;

// Sign the teacher in so their own view can be checked later.
const otpReq = await call('/auth/otp/request', { method: 'POST', body: { phone, purpose: 'login', channel: 'sms' } });
const tv = await call('/auth/otp/verify', { method: 'POST', body: { phone, code: otpReq.data.devCode, purpose: 'login' } });
const tToken = tv.data.accessToken;

console.log('\n=== FR-TVR-004: verification queue ===');
const queue = await call('/admin/verification/queue', { token: admin });
check('queue is reachable by admin_ops', queue.status === 200, `got ${queue.status}`);
const entry = queue.data?.find(e => e.teacherId === teacherId);
check('applicant appears in the queue', !!entry);
check('FR-TVR-004 documents and checklist presented', Array.isArray(entry?.checklist) && entry.checklist.length === 6, `checklist ${entry?.checklist?.length}`);
check('FR-TVR-004 waiting time shown', typeof entry?.waitingDays === 'number');
check('NFR-SEC-003 national ID shown masked only', entry?.nationalIdPreview?.startsWith('****') && !JSON.stringify(entry).includes('123456789012'), entry?.nationalIdPreview);

console.log('\n=== FR-TVR-005: no approval without the full checklist ===');
const premature = await call(`/admin/verification/${teacherId}/decision`, { method: 'POST', token: admin, body: { decision: 'approved', checklist: [{ itemKey: 'identity', verified: true }] } });
check('approval refused with an incomplete checklist', premature.status === 400 && premature.data?.messageKey === 'errors.verification.checklist_incomplete', JSON.stringify(premature.data));
check('refusal names the missing items', typeof premature.data?.params?.missing === 'string', JSON.stringify(premature.data?.params));

const stillNotListed = await call('/catalogue/teachers?page=1&pageSize=50', { token: admin });
check('FR-TVR-003 teacher still not listed after failed approval', !stillNotListed?.data?.items?.some(t => t.displayName === 'Paul Tabi'));

console.log('\n=== FR-TVR-006: more information required ===');
const moreInfo = await call(`/admin/verification/${teacherId}/decision`, { method: 'POST', token: admin, body: { decision: 'more_info_required', checklist: [{ itemKey: 'identity', verified: true, findings: 'ID legible and matches.' }], reason: 'Please upload a clearer copy of your DIPES II certificate.' } });
check('more_info_required accepted', moreInfo.status === 201 && moreInfo.data?.status === 'more_info_required', JSON.stringify(moreInfo.data));

const noReason = await call(`/admin/verification/${teacherId}/decision`, { method: 'POST', token: admin, body: { decision: 'rejected', checklist: [] } });
check('FR-TVR-006 rejection without a reason is refused', noReason.status === 400, `got ${noReason.status}`);

const applicantView = await call('/teachers/me/application', { token: tToken });
check('applicant sees the status and the reason', applicantView.data?.status === 'more_info_required' && applicantView.data?.rejectionReason?.includes('clearer copy'), JSON.stringify(applicantView.data?.rejectionReason));

console.log('\n=== FR-TVR-005: approval with every mandatory item ===');
const full = ['identity','qualification','institution','subjects','payout_name_match'].map(k => ({ itemKey: k, verified: true, findings: 'Checked against the uploaded document.' }));
const approve = await call(`/admin/verification/${teacherId}/decision`, { method: 'POST', token: admin, body: { decision: 'approved', checklist: full } });
check('approval succeeds when all mandatory items are recorded', approve.status === 201 && approve.data?.status === 'approved', JSON.stringify(approve.data));

const listed = await call('/catalogue/teachers?page=1&pageSize=50', { token: admin });
check('FR-TVR-003 approved teacher becomes listable', listed?.data?.items?.some(t => t.displayName === 'Paul Tabi'));
const profile = listed.data?.items?.find(t => t.displayName === 'Paul Tabi');
check('FR-PRO-004 public profile shows the verification badge', profile?.verified === true);
check('FR-RAT-002 rating withheld below the minimum count', profile?.rating === null && profile?.ratingWithheldBelow === 5, JSON.stringify({ r: profile?.rating, m: profile?.ratingWithheldBelow }));
check('FR-PRO-005 no contact or payout detail in the public profile', !JSON.stringify(profile).match(/677123456|123456789012|payoutWallet|nationalId|phone/i), JSON.stringify(profile).slice(0, 200));

console.log('\n=== FR-TVR-009: suspension ===');
const suspend = await call(`/admin/verification/${teacherId}/suspend`, { method: 'POST', token: admin, body: { reason: 'Safeguarding concern raised; pending investigation.' } });
check('suspension succeeds', suspend.status === 201, JSON.stringify(suspend.data));
const afterSuspend = await call('/catalogue/teachers?page=1&pageSize=50', { token: admin });
check('suspended teacher is delisted immediately', !afterSuspend?.data?.items?.some(t => t.displayName === 'Paul Tabi'));

console.log('\n=== FR-RBA-005: impersonation is read-only ===');
// The admin token has no impersonation claim, so this checks the ordinary path
// is unaffected; the read-only rule is unit-tested in permissions.guard.spec.ts.
const adminRead = await call('/admin/verification/queue', { token: admin });
check('admin GET still permitted', adminRead.status === 200);

console.log('\n=== Results ===');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
