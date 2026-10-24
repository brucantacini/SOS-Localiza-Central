// Real Oracle integration. No mock/in-memory repository and no fallback.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { oracleStore } from '../oracle.mjs';
import { createServer } from 'node:http';
import { apiHandler, apiServer } from '../http.mjs';
import { vercelAdapter } from '../vercel.mjs';
import { testOperator } from './support/operator.mjs';
if (!process.env.ORACLE_USER || !process.env.ORACLE_PASSWORD || !process.env.ORACLE_CONNECT_STRING) {
  console.error('BLOQUEADO: configure a conexão Oracle no backend. Nenhuma persistência real foi testada.');
  process.exit(1);
}
const store = oracleStore();
const server = process.env.SOS_TEST_VERCEL === '1' ? createServer(vercelAdapter(apiHandler(store))) : apiServer(store);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const headers = { 'Content-Type': 'application/json', 'X-SOS-Client': 'central' };
let operator;
try {
  assert.equal((await fetch(base + '/health')).status, 200);
  operator = await testOperator(store);
  const login = await fetch(base + '/auth/login', { method: 'POST', headers, body: JSON.stringify({ username: operator.username, password: operator.password }) });
  assert.equal(login.status, 200); headers.Cookie = login.headers.get('set-cookie').split(';')[0];
  const payload = { requestId: randomUUID(), type: 'Alagamento', location: 'TESTE INTEGRACAO ORACLE - Rua Exemplo', source: 'Informada manualmente', latitude: null, longitude: null, profile: { name: 'TESTE INTEGRACAO ORACLE', cpf: '000.000.000-00', phone: '11900000000', address: 'Rua Exemplo, 10' }, notes: 'Registro fictício criado pelo teste de integração real; pode ser removido pelo administrador.' };
  const created = await fetch(base + '/alerts', { method: 'POST', headers, body: JSON.stringify(payload) });
  assert.equal(created.status, 201); const { data: alert } = await created.json();
  // Independent pool/connection proves committed visibility beyond the writer session.
  const secondStore = oracleStore();
  try { assert.equal((await secondStore.get(alert.id)).requestId, payload.requestId); }
  finally { await secondStore.close(); }
  const duplicate = await fetch(base + '/alerts', { method: 'POST', headers, body: JSON.stringify(payload) });
  assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).data.id, alert.id);
  const changedRequest = await fetch(base + '/alerts', { method: 'POST', headers, body: JSON.stringify({ ...payload, notes: 'Diferente' }) });
  assert.equal(changedRequest.status, 409);
  const listed = await fetch(base + '/alerts?q=TESTE%20INTEGRACAO%20ORACLE&pageSize=100', { headers });
  assert.equal(listed.status, 200); assert.ok((await listed.json()).data.some(row => row.id === alert.id));
  const patched = await fetch(base + '/alerts/' + alert.id + '/status', { method: 'PATCH', headers, body: JSON.stringify({ status: 'em_atendimento', expectedVersion: 1 }) });
  assert.equal(patched.status, 200); assert.equal((await patched.json()).data.version, 2);
  const stale = await fetch(base + '/alerts/' + alert.id + '/status', { method: 'PATCH', headers, body: JSON.stringify({ status: 'resolvido', expectedVersion: 1 }) });
  assert.equal(stale.status, 409);
  console.log(`APROVADO${process.env.SOS_TEST_VERCEL === '1' ? ' (adaptador Vercel local)' : ''}: POST, COMMIT visível em outra conexão, idempotência, filtros, PATCH e concorrência. Registro de teste preservado: ${alert.id}`);
} finally {
  if (operator) await operator.cleanup(); await new Promise(resolve => server.close(resolve)); await store.close();
}
