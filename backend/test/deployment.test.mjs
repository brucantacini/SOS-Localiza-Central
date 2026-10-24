import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { apiHandler } from '../http.mjs';
import { vercelAdapter } from '../vercel.mjs';
import { hashPassword } from '../passwords.mjs';
import deployedHandler from '../../api/index.mjs';

const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
const rewrite = path => {
  const url = new URL(path, 'http://localhost');
  const rule = config.rewrites.find(rule => rule.source === '/api/v1/:path*');
  const target = new URL(rule.destination.replace(':path*', url.pathname.slice('/api/v1/'.length)), url);
  for (const [key, value] of url.searchParams) target.searchParams.append(key, value);
  return target.pathname + target.search;
};
async function withDeployment(store, run, parsed = false, queryOnly = false, captureMetadata = false) {
  const handler = vercelAdapter(apiHandler({ findSession: async () => ({ username: 'test', mustChangePassword: false }), ...store }, { VERCEL: '1', CORS_ORIGINS: 'https://centralsoslocaliza.vercel.app' }));
  const server = createServer(async (req, res) => {
    if (captureMetadata) { const url = new URL(req.url, 'http://localhost'); req.query = { ...Object.fromEntries(url.searchParams), path: url.searchParams.get('__sos_route').slice(3).split('/') }; }
    if (queryOnly) { const url = new URL(req.url, 'http://localhost'); req.query = Object.fromEntries(url.searchParams); req.url = url.pathname; }
    if (parsed && ['POST', 'PATCH'].includes(req.method)) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      try { req.body = JSON.parse(raw); } catch { req.body = raw; }
    }
    await handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test('Vercel entry exports a handler and auth/session is an API response, not a static 404', async () => {
  assert.equal(typeof deployedHandler, 'function');
  await withDeployment({}, async base => {
    const response = await fetch(base + rewrite('/api/v1/auth/session'));
    assert.equal(response.status, 401); assert.equal((await response.json()).error.code, 'UNAUTHORIZED');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});
test('configured rewrite preserves nested alert routes and search filters', async () => {
  await withDeployment({ health: async () => {}, list: async filters => ({ data: [], filters }), get: async id => ({ id }) }, async base => {
    const headers = { Cookie: 'sos_operator_session=' + 'a'.repeat(64) };
    assert.equal((await fetch(base + rewrite('/api/v1/health'))).status, 200);
    assert.equal((await fetch(base + '/api/v1/health')).status, 200);
    const listed = await fetch(base + rewrite('/api/v1/alerts?q=Rua%20%26%20Bairro&page=2&pageSize=25'), { headers });
    assert.equal(listed.status, 200); const body = await listed.json(); assert.equal(body.filters.q, 'Rua & Bairro'); assert.equal(body.filters.page, 2);
    const id = randomUUID(); const detail = await fetch(base + rewrite('/api/v1/alerts/' + id), { headers });
    assert.equal((await detail.json()).data.id, id);
  });
});
test('Vercel parsed JSON and local raw stream both support real POST contract', async () => {
  const input = { requestId: randomUUID(), type: 'Alagamento', location: 'TESTE', source: 'Informada manualmente', latitude: null, longitude: null, profile: { name: 'TESTE', cpf: '000', phone: '000', address: 'TESTE' }, notes: '' };
  for (const parsed of [false, true]) await withDeployment({ create: async value => ({ created: true, alert: value }) }, async base => {
    const result = await fetch(base + rewrite('/api/v1/alerts'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(result.status, 201); assert.deepEqual((await result.json()).data, input);
  }, parsed);
});
test('runtime query helper preserves REST path and filters when req.url has no query', async () => {
  await withDeployment({ list: async filters => ({ data: [], filters }) }, async base => {
    const response = await fetch(base + rewrite('/api/v1/alerts?q=Teste&page=3'), { headers: { Cookie: 'sos_operator_session=' + 'a'.repeat(64) } });
    assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.filters.q, 'Teste'); assert.equal(body.filters.page, 3);
  }, false, true);
});
test('Vercel source capture metadata is not passed to alert filter validation', async () => {
  await withDeployment({ list: async filters => ({ data: [], filters }) }, async base => {
    const headers = { Cookie: 'sos_operator_session=' + 'a'.repeat(64) };
    const response = await fetch(base + rewrite('/api/v1/alerts?page=1&pageSize=25'), { headers });
    assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.filters.pageSize, 25); assert.equal(body.filters.path, undefined);
  }, false, false, true);
});
test('source metadata in rewritten URL is stripped but unknown client filters still fail', async () => {
  await withDeployment({ list: async filters => ({ data: [], filters }) }, async base => {
    const headers = { Cookie: 'sos_operator_session=' + 'a'.repeat(64) };
    const valid = await fetch(base + rewrite('/api/v1/alerts?pageSize=25') + '&path=alerts', { headers });
    assert.equal(valid.status, 200);
    for (const query of ['path=unrelated', 'unknown=anything']) {
      const invalid = await fetch(base + rewrite('/api/v1/alerts?' + query), { headers });
      assert.equal(invalid.status, 400); assert.equal((await invalid.json()).error.fields.query, 'Filtro desconhecido.');
    }
  });
});
test('Vercel parsed PATCH supports status updates and still requires CSRF header', async () => {
  await withDeployment({ update: async (_id, value) => value }, async base => {
    const url = base + rewrite('/api/v1/alerts/' + randomUUID() + '/status');
    const headers = { Cookie: 'sos_operator_session=' + 'a'.repeat(64), 'Content-Type': 'application/json', 'X-SOS-Client': 'central', Origin: 'https://centralsoslocaliza.vercel.app' };
    const result = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ status: 'resolvido', expectedVersion: 2 }) });
    assert.equal(result.status, 200); assert.equal((await result.json()).data.expectedVersion, 2);
    delete headers['X-SOS-Client'];
    assert.equal((await fetch(url, { method: 'PATCH', headers, body: '{}' })).status, 403);
  }, true);
});
test('Vercel parsed bodies retain size limits and malformed JSON errors', async () => {
  await withDeployment({}, async base => {
    const url = base + rewrite('/api/v1/alerts');
    assert.equal((await fetch(url, { method: 'POST', body: '{' })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify({ notes: 'x'.repeat(17000) }) })).status, 413);
  }, true);
});
test('Vercel login sets Secure HttpOnly cookie and never returns password or session token', async () => {
  const password = randomBytes(24).toString('hex'); const username = randomUUID();
  const hash = await hashPassword(password);
  await withDeployment({ findOperator: async () => ({ ID: randomUUID(), USERNAME: username, PASSWORD_HASH: hash, IS_ACTIVE: 1, MUST_CHANGE_PASSWORD: 1 }), createSession: async () => {} }, async base => {
    const result = await fetch(base + rewrite('/api/v1/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SOS-Client': 'central', Origin: 'https://centralsoslocaliza.vercel.app' }, body: JSON.stringify({ username, password }) });
    assert.equal(result.status, 200); assert.match(result.headers.get('set-cookie'), /HttpOnly.*SameSite=Strict.*Secure/);
    const body = await result.json(); assert.equal(body.data.operator.username, username); assert.equal(body.data.token, undefined); assert.ok(!JSON.stringify(body).includes(password));
  }, true);
});
