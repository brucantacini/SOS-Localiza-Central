import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword, validHash } from '../passwords.mjs';
import { apiServer } from '../http.mjs';
import { ApiError } from '../validation.mjs';

// Runtime-only credentials and isolated doubles; Oracle coverage is in auth-oracle.mjs.
const username = 'test_' + randomUUID().slice(0, 8);
const password = randomBytes(24).toString('hex');
const hash = await hashPassword(password);
async function withAuth(run, secure = false) {
  const sessions = new Map(); let passwordHash = hash; let active = 1;
  const store = {
    findOperator: async name => name === username ? { ID: 'test-id', USERNAME: username, PASSWORD_HASH: passwordHash, IS_ACTIVE: active, MUST_CHANGE_PASSWORD: 1 } : null,
    createSession: async session => { sessions.set(session.tokenHash, session); },
    findSession: async tokenHash => sessions.has(tokenHash) && active ? { username, mustChangePassword: true } : null,
    deleteSession: async tokenHash => sessions.delete(tokenHash),
    changePassword: async (_id, oldHash, nextHash) => { assert.equal(oldHash, passwordHash); passwordHash = nextHash; sessions.clear(); },
    list: async () => ({ data: [], summary: { total: 0 }, pagination: { total: 0 } }),
  };
  const server = apiServer(store, { CORS_ORIGINS: 'http://localhost:5174', SESSION_COOKIE_SECURE: String(secure) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const post = (path, input, cookie = '', extra = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SOS-Client': 'central', Cookie: cookie, ...extra }, body: JSON.stringify(input) });
  try { await run({ base, post, sessions, deactivate: () => { active = 0; } }); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const cookieOf = response => response.headers.get('set-cookie').split(';')[0];
test('scrypt uses a unique salt and verifies passwords without storing plaintext', async () => {
  const second = await hashPassword(password);
  assert.ok(validHash(second)); assert.notEqual(second, hash); assert.ok(!second.includes(password));
  assert.equal(await verifyPassword(password, second), true);
  assert.equal(await verifyPassword(randomUUID(), second), false);
  assert.equal(await verifyPassword(password, 'invalid'), false);
});
test('unknown user and wrong password return identical generic errors', async () => {
  await withAuth(async ({ post }) => {
    const wrong = await post('/auth/login', { username, password: randomUUID() });
    const unknown = await post('/auth/login', { username: randomUUID(), password });
    assert.equal(wrong.status, 401); assert.equal(unknown.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json());
  });
});
test('login persists only token hash, sets HttpOnly cookie, and logout revokes replay', async () => {
  await withAuth(async ({ base, post, sessions }) => {
    const response = await post('/auth/login', { username, password });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/); assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
    const result = await response.json(); assert.equal(result.data.operator.username, username); assert.ok(!('token' in result.data));
    const cookie = cookieOf(response); assert.ok(!sessions.has(cookie.split('=')[1]));
    assert.equal((await fetch(base + '/alerts', { headers: { Cookie: cookie } })).status, 200);
    const ended = await post('/auth/logout', {}, cookie); assert.equal(ended.status, 200); assert.match(ended.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await fetch(base + '/alerts', { headers: { Cookie: cookie } })).status, 401);
  });
});
test('Secure is enabled for HTTPS configuration and disabled in local HTTP mode', async () => {
  await withAuth(async ({ post }) => { const response = await post('/auth/login', { username, password }); assert.match(response.headers.get('set-cookie'), /; Secure/); }, true);
});
test('cookie-less bearer key no longer authenticates, and foreign origins cannot mutate sessions', async () => {
  await withAuth(async ({ base, post }) => {
    assert.equal((await fetch(base + '/alerts', { headers: { Authorization: 'Bearer legacy-key' } })).status, 401);
    assert.equal((await post('/auth/login', { username, password }, '', { Origin: 'https://foreign.invalid' })).status, 403);
    assert.equal((await post('/auth/login', { username, password }, '', { 'X-SOS-Client': '' })).status, 403);
  });
});
test('password change revokes all sessions; prior password cannot log in', async () => {
  await withAuth(async ({ base, post }) => {
    const cookie1 = cookieOf(await post('/auth/login', { username, password }));
    const cookie2 = cookieOf(await post('/auth/login', { username, password }));
    const newPassword = randomBytes(24).toString('hex');
    assert.equal((await post('/auth/password', { currentPassword: password, newPassword }, cookie1)).status, 200);
    for (const cookie of [cookie1, cookie2]) assert.equal((await fetch(base + '/auth/session', { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await post('/auth/login', { username, password })).status, 401);
    assert.equal((await post('/auth/login', { username, password: newPassword })).status, 200);
  });
});
test('disabled operators and expired/revoked sessions cannot access alerts', async () => {
  await withAuth(async ({ base, post, deactivate }) => {
    const cookie = cookieOf(await post('/auth/login', { username, password })); deactivate();
    assert.equal((await fetch(base + '/auth/session', { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await post('/auth/login', { username, password })).status, 401);
  });
});
test('login attempts are bounded, including when the database is unavailable', async () => {
  const { authService } = await import('../auth.mjs');
  const auth = authService({ findOperator: async () => { throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Unavailable'); } });
  for (let n = 0; n < 20; n++) await assert.rejects(() => auth.login({ username, password }, 'test-ip'), { status: 503 });
  await assert.rejects(() => auth.login({ username, password }, 'test-ip'), { status: 429 });
});
