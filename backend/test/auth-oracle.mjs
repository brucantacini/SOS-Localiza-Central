import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import { oracleStore } from '../oracle.mjs';
import { apiServer } from '../http.mjs';
import { hashPassword, verifyPassword, validHash } from '../passwords.mjs';
import { sessionHash } from '../auth.mjs';
import { readFile } from 'node:fs/promises';
import { validateOperators } from '../scripts/operator-manifest.mjs';
let input = ''; for await (const chunk of process.stdin) input += chunk;
const store = oracleStore(); const second = oracleStore();
const server = apiServer(store);
let db; let scratchId;
try {
  const { usernames, password } = JSON.parse(input);
  if (!Array.isArray(usernames) || !usernames.length || typeof password !== 'string') throw new Error();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const post = (path, body, cookie = '') => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SOS-Client': 'central', Cookie: cookie }, body: JSON.stringify(body) });
  const seed = validateOperators(JSON.parse(await readFile(new URL('../.operators.seed.json', import.meta.url), 'utf8')));
  const before = await Promise.all(usernames.map(name => store.findOperator(name)));
  const repeated = await store.seedOperators(seed); assert.equal(repeated.inserted, 0);
  for (let n = 0; n < usernames.length; n++) {
    const row = await store.findOperator(usernames[n]); assert.ok(row && validHash(row.PASSWORD_HASH)); assert.equal(row.PASSWORD_HASH, before[n].PASSWORD_HASH);
    const response = await post('/auth/login', { username: usernames[n], password }); assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0]; const token = cookie.split('=')[1];
    assert.ok(await second.findSession(sessionHash(token)), 'Sessão deve ser visível em outra conexão Oracle.');
    assert.equal((await fetch(base + '/alerts', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await post('/auth/logout', {}, cookie)).status, 200);
    assert.equal(await second.findSession(sessionHash(token)), null);
    assert.equal((await fetch(base + '/alerts', { headers: { Cookie: cookie } })).status, 401);
  }
  const scratchName = 'test_' + randomUUID().replaceAll('-', '');
  const original = randomBytes(24).toString('hex'); const changed = randomBytes(24).toString('hex');
  const scratchSeed = [{ username: scratchName, passwordHash: await hashPassword(original) }];
  await store.seedOperators(scratchSeed); scratchId = (await store.findOperator(scratchName)).ID;
  const session = await post('/auth/login', { username: scratchName, password: original });
  const cookie = session.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/auth/password', { currentPassword: original, newPassword: changed }, cookie)).status, 200);
  const changedRow = await store.findOperator(scratchName); assert.equal(changedRow.MUST_CHANGE_PASSWORD, 0);
  assert.equal((await store.seedOperators(scratchSeed)).inserted, 0);
  assert.equal((await store.findOperator(scratchName)).PASSWORD_HASH, changedRow.PASSWORD_HASH);
  assert.ok(await verifyPassword(changed, changedRow.PASSWORD_HASH));
  assert.equal((await post('/auth/login', { username: scratchName, password: original })).status, 401);
  const wrong = await post('/auth/login', { username: scratchName, password: original });
  const unknown = await post('/auth/login', { username: randomUUID(), password: original });
  assert.deepEqual(await wrong.json(), await unknown.json());
  console.log(`APROVADO: ${usernames.length} logins reais; hashes seguros; sessões persistidas e revogadas; seed repetido sem alterações; senha alterada preservada. Nenhuma credencial foi impressa.`);
} catch { console.error('Falha no teste de autenticação Oracle. Nenhuma credencial foi impressa.'); process.exitCode = 1; }
finally {
  if (scratchId) {
    db = await oracledb.getConnection({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING });
    await db.execute('DELETE FROM SOS_OPERATORS WHERE ID = :id', { id: scratchId }, { autoCommit: true }); await db.close();
  }
  if (server.listening) await new Promise(resolve => server.close(resolve)); await store.close(); await second.close();
}
