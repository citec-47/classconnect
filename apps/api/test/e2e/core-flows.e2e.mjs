// End-to-end smoke test against the running API.
const BASE = 'http://localhost:4000/api/v1';
let pass = 0, fail = 0;

async function call(path, { method = 'GET', body, token, lang = 'en' } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'accept-language': lang,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* 204 */ }
  return { status: res.status, data, correlationId: res.headers.get('x-correlation-id') };
}

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

const rnd = () => Math.floor(Math.random() * 9000000) + 1000000;

console.log('\n=== Health & catalogue ===');
const health = await call('/health');
check('health returns ok with database up', health.data?.status === 'ok' && health.data?.database === 'up', JSON.stringify(health.data));
check('correlation ID returned (NFR-MNT-005)', !!health.correlationId);

const levels = await call('/catalogue/levels');
check('FR-PRO-001 levels seeded (16)', levels.data?.length === 16, `got ${levels.data?.length}`);
check('FR-PRO-001 includes GCE O/L and A/L', levels.data?.some(l => l.code === 'GCE_OL') && levels.data?.some(l => l.code === 'GCE_AL'));
check('NFR-LOC-001 levels carry EN and FR names', levels.data?.[0]?.nameEn && levels.data?.[0]?.nameFr);

const subjects = await call('/catalogue/subjects');
check('FR-PRO-002 subjects seeded (17)', subjects.data?.length === 17, `got ${subjects.data?.length}`);

console.log('\n=== FR-RBA-002: default-deny authorisation ===');
const noAuth = await call('/learners');
check('unauthenticated request to /learners is 401', noAuth.status === 401, `got ${noAuth.status}`);
check('error carries a message key, not prose (NFR-LOC-001)', noAuth.data?.messageKey === 'errors.unauthorised', JSON.stringify(noAuth.data));

const teachersNoAuth = await call('/catalogue/teachers');
check('teacher browse requires auth', teachersNoAuth.status === 401);

console.log('\n=== FR-AUT-001/002: registration + OTP ===');
const parentPhone = `+2376${rnd()}${Math.floor(Math.random()*10)}`.slice(0, 13);
const reg = await call('/auth/register', {
  method: 'POST',
  body: {
    role: 'parent', fullName: 'Amina Nkeng', phone: parentPhone,
    preferredLanguage: 'en', acceptedTerms: true,
  },
});
check('parent registration succeeds', reg.status === 201, JSON.stringify(reg.data));
check('FR-AUT-002 OTP required after registration', reg.data?.requiresOtp === true);
check('dev OTP exposed for local testing', typeof reg.data?.devCode === 'string');

const dupe = await call('/auth/register', {
  method: 'POST',
  body: { role: 'parent', fullName: 'Someone Else', phone: parentPhone, preferredLanguage: 'en', acceptedTerms: true },
});
check('DAT-004 duplicate phone rejected', dupe.status === 409 && dupe.data?.messageKey === 'errors.phone.taken', JSON.stringify(dupe.data));

const badOtp = await call('/auth/otp/verify', {
  method: 'POST',
  body: { phone: parentPhone, code: '000000', purpose: 'registration' },
});
check('FR-AUT-004 wrong OTP rejected with attempts remaining', badOtp.status === 400 && badOtp.data?.messageKey === 'errors.otp.incorrect', JSON.stringify(badOtp.data));
check('FR-AUT-004 remaining attempts reported', typeof badOtp.data?.params?.remaining === 'number', JSON.stringify(badOtp.data?.params));

const verify = await call('/auth/otp/verify', {
  method: 'POST',
  body: { phone: parentPhone, code: reg.data.devCode, purpose: 'registration', deviceLabel: 'Smoke test' },
});
check('FR-AUT-002 correct OTP signs in', verify.status === 200 && !!verify.data?.accessToken, JSON.stringify(verify.data));
check('FR-AUT-006 access token TTL <= 15 min', verify.data?.expiresIn <= 900, `${verify.data?.expiresIn}s`);
check('FR-AUT-006 refresh token issued', typeof verify.data?.refreshToken === 'string');

const replay = await call('/auth/otp/verify', {
  method: 'POST',
  body: { phone: parentPhone, code: reg.data.devCode, purpose: 'registration' },
});
check('FR-AUT-004 OTP invalidated on use (replay fails)', replay.status !== 200, `got ${replay.status}`);

const parentToken = verify.data.accessToken;

console.log('\n=== FR-AUT-010: session management ===');
const me = await call('/auth/me', { token: parentToken });
check('/auth/me returns the signed-in user', me.data?.fullName === 'Amina Nkeng', JSON.stringify(me.data));
check('FR-RBA-001 parent role assigned', me.data?.roles?.includes('parent'));

const sessions = await call('/auth/sessions', { token: parentToken });
check('FR-AUT-010 active sessions listed', Array.isArray(sessions.data) && sessions.data.length === 1, JSON.stringify(sessions.data));
check('FR-AUT-010 device label recorded', sessions.data?.[0]?.deviceLabel === 'Smoke test');

console.log('\n=== Account creation is Admin-only ===');
// A parent manages the children an Admin links to them; they cannot create one.
// The creation flow itself is covered in full by admin-accounts.e2e.mjs.
const parentCreates = await call('/learners', {
  method: 'POST', token: parentToken,
  body: { fullName: 'Junior Nkeng', dob: '2011-04-15', subjectIds: [], preferredStudyDays: [] },
});
check('a parent cannot create a Student account', parentCreates.status === 403, `got ${parentCreates.status}`);

const list = await call('/learners', { token: parentToken });
check('a parent with no linked children sees an empty list', Array.isArray(list.data) && list.data.length === 0, JSON.stringify(list.data));

console.log('\n=== FR-RBA-003: record-level ownership ===');
const otherPhone = `+2376${rnd()}${Math.floor(Math.random()*10)}`.slice(0, 13);
const other = await call('/auth/register', {
  method: 'POST',
  body: { role: 'parent', fullName: 'Other Parent', phone: otherPhone, preferredLanguage: 'en', acceptedTerms: true },
});
const otherVerify = await call('/auth/otp/verify', {
  method: 'POST', body: { phone: otherPhone, code: other.data.devCode, purpose: 'registration' },
});
const otherToken = otherVerify.data.accessToken;

// A well-formed id this parent has no relationship to.
const UNRELATED_LEARNER = '00000000-0000-4000-8000-000000000000';

const steal = await call(`/learners/${UNRELATED_LEARNER}`, { token: otherToken });
check('FR-RBA-003 an unrelated learner is not readable', steal.status === 403 || steal.status === 404, `got ${steal.status}`);

const stealWrite = await call(`/learners/${UNRELATED_LEARNER}`, {
  method: 'PATCH', token: otherToken, body: { fullName: 'Hacked' },
});
check('FR-RBA-003 an unrelated learner is not writable', stealWrite.status === 403 || stealWrite.status === 404, `got ${stealWrite.status}`);

// A malformed id must be a client error, never a 500 that pollutes alerting.
const malformed = await call('/learners/not-a-uuid', { token: otherToken });
check('a malformed id is a client error, not a 500', malformed.status === 400 || malformed.status === 404, `got ${malformed.status}`);

const otherList = await call('/learners', { token: otherToken });
check('FR-RBA-003 list is scoped to own children', otherList.data?.length === 0, `got ${otherList.data?.length}`);

console.log('\n=== FR-RBA-002: permission enforcement ===');
const parentTriesQueue = await call('/admin/verification/queue', { token: parentToken });
check('parent cannot read the verification queue', parentTriesQueue.status === 403, `got ${parentTriesQueue.status}`);

console.log('\n=== Teacher self-registration, and its limits ===');
// A Teacher account exists only because an Admin created it. Both halves of the
// old self-service path are gone: the registration role, and the endpoint.
const selfRegister = await call('/auth/register', {
  method: 'POST',
  body: { role: 'teacher', fullName: 'Paul Tabi', phone: `+2376${rnd()}${Math.floor(Math.random()*10)}`.slice(0, 13), preferredLanguage: 'fr', acceptedTerms: true },
});
check('a teacher cannot register without naming subjects', selfRegister.status === 400, `got ${selfRegister.status}`);

// FR-RBA-002: the application endpoint is scoped to teacher:apply, so a parent
// holding a valid token still cannot reach it.
const selfApply = await call('/teachers/me/application', { method: 'POST', token: parentToken, body: {} });
check('a parent cannot use the teacher application endpoint', selfApply.status === 403, `got ${selfApply.status}`);

console.log('\n=== FR-PRO-001: school-type grouping ===');
const primaryLevels = await call('/catalogue/levels?schoolType=primary');
const secondaryLevels = await call('/catalogue/levels?schoolType=secondary');
check('primary school is Class 1 to Class 6', primaryLevels.data?.length === 6, `got ${primaryLevels.data?.length}`);
check('secondary includes Lower and Upper Sixth',
  ['Lower Sixth', 'Upper Sixth'].every(n => secondaryLevels.data?.some(l => l.nameEn === n)));
check('the groups partition the catalogue',
  primaryLevels.data.length + secondaryLevels.data.length === levels.data.length);


console.log('\n=== FR-AUT-003: signing in with credentials ===');
// An account identified by phone still has a password when one was set, and
// demanding an email at sign-in would make that password unusable. Both
// identifiers must reach the same account.
const credPhone = `+2376${rnd()}${Math.floor(Math.random() * 10)}`.slice(0, 13);
const credEmail = `cred${rnd()}@classconnect.test`;
const credPassword = 'a-long-enough-password';

const credReg = await call('/auth/register', { method: 'POST', body: {
  role: 'parent', fullName: 'Credential User', phone: credPhone, email: credEmail,
  password: credPassword, preferredLanguage: 'en', acceptedTerms: true } });
check('registration accepts an optional password', credReg.status === 201, JSON.stringify(credReg.data));

const byPhone = await call('/auth/login', { method: 'POST', body: {
  phone: credPhone, password: credPassword } });
check('sign in by phone and password', byPhone.status === 200 && !!byPhone.data?.accessToken, JSON.stringify(byPhone.data));

const byEmail = await call('/auth/login', { method: 'POST', body: {
  email: credEmail, password: credPassword } });
check('sign in by email and password', byEmail.status === 200 && !!byEmail.data?.accessToken, JSON.stringify(byEmail.data));

const wrongPassword = await call('/auth/login', { method: 'POST', body: {
  phone: credPhone, password: 'not-the-password' } });
check('a wrong password is refused', wrongPassword.status === 401 &&
  wrongPassword.data?.messageKey === 'errors.password.incorrect', JSON.stringify(wrongPassword.data));

const noIdentifier = await call('/auth/login', { method: 'POST', body: { password: credPassword } });
check('sign-in without an identifier is refused', noIdentifier.status === 400, `got ${noIdentifier.status}`);

// FR-AUT-007 rationale: an unknown account and a wrong password must be
// indistinguishable, or the endpoint enumerates who has registered.
const unknownPhone = await call('/auth/login', { method: 'POST', body: {
  phone: `+2376${rnd()}${Math.floor(Math.random() * 10)}`.slice(0, 13), password: credPassword } });
check('an unknown account fails the same way as a wrong password', unknownPhone.status === 401 &&
  unknownPhone.data?.messageKey === 'errors.password.incorrect', JSON.stringify(unknownPhone.data));

console.log('\n=== Results ===');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
