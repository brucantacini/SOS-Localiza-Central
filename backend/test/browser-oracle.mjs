// Full real flow: app UI -> running API -> Oracle -> Central UI -> status -> Oracle.
// Requires both repos side by side, all three servers running, and installed Chrome/Edge.
// No API intercepts, geolocation fixtures or storage repository replacements.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { oracleStore } from '../oracle.mjs';
import { Browser, sleep } from '../../../SosLocaliza/scripts/lib/cdp.mjs';
import { testOperator } from './support/operator.mjs';

if (!process.env.ORACLE_USER || !process.env.ORACLE_PASSWORD || !process.env.ORACLE_CONNECT_STRING) {
  console.error('BLOQUEADO: teste ponta a ponta exige conexão Oracle no backend. Não houve teste de persistência real.');
  process.exit(1);
}
const base = process.env.API_BASE_URL || 'http://localhost:3001/api/v1';
assert.equal((await fetch(base + '/health')).status, 200, 'Oracle precisa estar disponível antes do teste.');
const browser = await Browser.launch(); const store = oracleStore();
let operator;
async function wait(page, condition, label) { for (let n = 0; n < 180; n++) { if (await page.eval(condition)) return; await sleep(200); } assert.fail(label); }
async function click(page, text) {
  assert.ok(await page.eval(text => { const button = [...document.querySelectorAll('button')].find(el => el.getClientRects().length && el.textContent.includes(text)); button?.click(); return !!button; }, text), `Controle ausente: ${text}`);
}
async function change(page, selector, value) {
  await page.eval(({ selector, value }) => {
    const input = document.querySelector(selector);
    const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  }, { selector, value });
}
try {
  operator = await testOperator(store);
  const name = `TESTE E2E ${randomUUID().slice(0, 8)}`;
  const app = await browser.newPage({ width: 390, height: 900, mobile: true });
  await app.goto(process.env.SOS_URL || 'http://localhost:5173/', { settleMs: 300 });
  await wait(app, () => !!document.querySelector('form input[name="name"]'), 'Cadastro não abriu.');
  for (const [field, value] of Object.entries({ name, cpf: '000.000.000-00', phone: '11900000000', address: 'TESTE E2E - Rua Exemplo, 10' })) await change(app, `input[name="${field}"]`, value);
  await app.eval(() => document.querySelector('form').requestSubmit());
  await wait(app, () => !!document.querySelector('.home-intro'), 'Cadastro não foi concluído.');
  await click(app, 'Comunicar estado de alerta'); await click(app, 'Continuar para revisão'); await click(app, 'Confirmar registro');
  await wait(app, () => !!document.querySelector('.success-card') || !!document.querySelector('.form-error'), 'Envio não respondeu.');
  assert.ok(await app.eval(() => !!document.querySelector('.success-card')), 'App não confirmou envio; consulte o erro da API.');
  const id = await app.eval(() => document.querySelector('.success-id strong').textContent);
  const saved = await store.get(id); assert.equal(saved.profile.name, name); assert.equal(saved.status, 'novo');

  const central = await browser.newPage({ width: 1440, height: 1000 });
  await central.goto(process.env.CENTRAL_URL || 'http://localhost:5174/', { settleMs: 300 });
  await wait(central, () => !!document.querySelector('#operator-username'), 'Login da Central não abriu.');
  await change(central, '#operator-username', operator.username);
  await change(central, '#operator-password', operator.password);
  await central.eval(() => document.querySelector('.login-card form').requestSubmit());
  await wait(central, () => !!document.querySelector('.search-input input'), 'Central não abriu filtros.');
  await change(central, '.search-input input', name);
  await central.eval(() => document.querySelector('form.filters').requestSubmit());
  await wait(central, () => document.querySelectorAll('tbody tr').length === 1, 'Alerta não apareceu no painel.');
  await click(central, 'Detalhes');
  await wait(central, () => !!document.querySelector('#new-status'), 'Detalhes não carregaram.');
  assert.ok(await central.eval(id => document.querySelector('.detail-modal').textContent.includes(id), id));
  await change(central, '#new-status', 'em_atendimento'); await click(central, 'Salvar status');
  await wait(central, () => !!document.querySelector('.detail-modal .success'), 'Central não confirmou atualização.');
  const updated = await store.get(id); assert.equal(updated.status, 'em_atendimento'); assert.equal(updated.version, 2);
  await central.goto(process.env.CENTRAL_URL || 'http://localhost:5174/', { settleMs: 300 });
  await wait(central, () => !!document.querySelector('.filters'), 'Sessão não foi restaurada após recarregar.');
  assert.equal(await central.eval(() => document.cookie.includes('sos_operator_session')), false, 'Cookie deve ser HttpOnly.');
  await central.eval(() => document.querySelector('[aria-label="Encerrar sessão"]').click());
  await wait(central, () => !!document.querySelector('#operator-username'), 'Logout não abriu o login.');
  console.log(`APROVADO: app -> API -> Oracle -> painel -> status -> Oracle. Registro fictício preservado: ${id}`);
} finally { await browser.close(); if (operator) await operator.cleanup(); await store.close(); }
