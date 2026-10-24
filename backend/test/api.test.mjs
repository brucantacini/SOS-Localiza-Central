import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sessionHash } from '../auth.mjs';
import { apiServer } from '../http.mjs';
import { ApiError, createInput, listInput, statusInput } from '../validation.mjs';

const sample = () => ({ requestId: randomUUID(), type: 'Alagamento', location: 'TESTE AUTOMATIZADO - Rua Exemplo', source: 'Informada manualmente', latitude: null, longitude: null, profile: { name: 'TESTE AUTOMATIZADO', cpf: '000.000.000-00', phone: '(11) 90000-0000', address: 'Rua Exemplo, 10' }, notes: '' });
// Isolated doubles exercise HTTP behavior only; these tests do not prove Oracle persistence.
async function withApi(store, run) {
  const server = apiServer({ findSession: async hash => hash === sessionHash('a'.repeat(64)) ? { username: 'unit-test', mustChangePassword: false } : null, ...store }, { CORS_ORIGINS: 'http://localhost:5174' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}/api/v1`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test('validation rejects incomplete coordinates and invalid enums', () => {
  assert.throws(() => createInput({ ...sample(), latitude: -23.5 }), { status: 400 });
  assert.throws(() => createInput({ ...sample(), longitude: 181, latitude: 0 }), { status: 400 });
  assert.throws(() => createInput({ ...sample(), type: 'inexistente' }), { status: 400 });
  assert.throws(() => statusInput({ status: 'resolvido', expectedVersion: 0 }), { status: 400 });
  assert.equal(createInput(sample()).latitude, null);
});
test('filters reject impossible dates and excessive pages', () => {
  for (const q of ['from=2026-02-30', 'from=2026-10-24&to=2026-10-23', 'pageSize=101', 'page=0', 'status=unknown', 'foo=bar']) assert.throws(() => listInput(new URLSearchParams(q)), { status: 400 });
  assert.equal(listInput(new URLSearchParams('q=%25')).q, '%');
});
test('POST only responds after persistence promise completes; duplicate uses 200', async () => {
  let persisted = false; let release;
  const gate = new Promise(resolve => { release = resolve; });
  await withApi({ create: async input => { await gate; persisted = true; return { created: true, alert: { ...input, id: randomUUID() } }; } }, async base => {
    const response = fetch(base + '/alerts', { method: 'POST', body: JSON.stringify(sample()) });
    assert.equal(persisted, false); release();
    assert.equal((await response).status, 201); assert.equal(persisted, true);
  });
  await withApi({ create: async input => ({ created: false, alert: input }) }, async base => {
    assert.equal((await fetch(base + '/alerts', { method: 'POST', body: JSON.stringify(sample()) })).status, 200);
  });
});
test('database unavailable never reports successful POST', async () => {
  await withApi({ create: async () => { throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Oracle indisponível.'); } }, async base => {
    const response = await fetch(base + '/alerts', { method: 'POST', body: JSON.stringify(sample()) });
    assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'DATABASE_UNAVAILABLE');
  });
});
test('protected reads and status updates require session before database access', async () => {
  await withApi({}, async base => {
    for (const [path, method] of [['/alerts', 'GET'], ['/alerts/' + randomUUID(), 'GET'], ['/alerts/' + randomUUID() + '/status', 'PATCH']]) {
      assert.equal((await fetch(base + path, { method })).status, 401);
    }
  });
});
test('conflict is exposed as 409 and unexpected errors are sanitized', async () => {
  await withApi({ update: async () => { throw new ApiError(409, 'CONFLICT', 'Atualize os dados.'); }, get: async () => { throw new Error('SECRET_PASSWORD'); } }, async base => {
    const headers = { Cookie: 'sos_operator_session=' + 'a'.repeat(64), 'X-SOS-Client': 'central' };
    const response = await fetch(base + '/alerts/' + randomUUID() + '/status', { method: 'PATCH', headers, body: JSON.stringify({ status: 'resolvido', expectedVersion: 1 }) });
    assert.equal(response.status, 409);
    const failed = await fetch(base + '/alerts/' + randomUUID(), { headers });
    assert.equal(failed.status, 500); assert.ok(!(await failed.text()).includes('SECRET_PASSWORD'));
  });
});
test('malformed and oversized JSON fail before storage', async () => {
  await withApi({}, async base => {
    assert.equal((await fetch(base + '/alerts', { method: 'POST', body: '{' })).status, 400);
    assert.equal((await fetch(base + '/alerts', { method: 'POST', body: JSON.stringify({ data: 'x'.repeat(17000) }) })).status, 413);
  });
});
test('CORS allows only configured origins and disables caching', async () => {
  await withApi({ health: async () => {} }, async base => {
    const allowed = await fetch(base + '/health', { headers: { Origin: 'http://localhost:5174' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5174');
    assert.equal(allowed.headers.get('cache-control'), 'no-store');
    const denied = await fetch(base + '/health', { headers: { Origin: 'https://unknown.invalid' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  });
});
