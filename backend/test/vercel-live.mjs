// Read-only verification of deployed routes, using a temporary operator removed afterward.
import { oracleStore } from '../oracle.mjs';
import { testOperator } from './support/operator.mjs';
const base = (process.env.API_BASE_URL || 'https://centralsoslocaliza.vercel.app/api/v1').replace(/\/$/, '');
const store = oracleStore(); let operator; let cookie;
try {
  const health = await fetch(base + '/health'); console.log('Health:', health.status);
  if (health.status !== 200) throw new Error('Health check failed');
  operator = await testOperator(store);
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SOS-Client': 'central', Origin: new URL(base).origin }, body: JSON.stringify({ username: operator.username, password: operator.password }) });
  console.log('Login:', login.status); if (login.status !== 200) throw new Error('Login failed');
  cookie = login.headers.get('set-cookie').split(';')[0];
  const alerts = await fetch(base + '/alerts?page=1&pageSize=25', { headers: { Cookie: cookie } });
  const body = await alerts.json();
  console.log('Consulta de alertas:', alerts.status, body.error ? JSON.stringify(body.error) : JSON.stringify({ count: body.data.length, total: body.pagination.total }));
  if (alerts.status !== 200) process.exitCode = 1;
} catch { console.error('Verificação remota não concluída; nenhuma credencial foi impressa.'); process.exitCode = 1; }
finally {
  if (cookie) await fetch(base + '/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'X-SOS-Client': 'central', Origin: new URL(base).origin } }).catch(() => {});
  if (operator) await operator.cleanup(); await store.close();
}
