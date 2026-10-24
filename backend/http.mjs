import { createServer } from 'node:http';
import { authService } from './auth.mjs';
import { ApiError, createInput, listInput, statusInput, uuid } from './validation.mjs';

async function body(req) {
  if (Number(req.headers['content-length']) > 16384) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Corpo acima de 16 KiB.');
  // Vercel may provide an already parsed body instead of a readable stream.
  if (req.body !== undefined) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > 16384) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Corpo acima de 16 KiB.');
    try { return JSON.parse(raw); } catch { throw new ApiError(400, 'VALIDATION_ERROR', 'JSON inválido.'); }
  }
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Corpo acima de 16 KiB.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'VALIDATION_ERROR', 'JSON inválido.'); }
}
export function apiHandler(store, env = process.env) {
  const auth = authService(store);
  const cookieName = 'sos_operator_session';
  const cookie = token => `${cookieName}=${token}; HttpOnly; Path=/api/v1; SameSite=Strict; Max-Age=${token ? 28800 : 0}${env.SESSION_COOKIE_SECURE === 'true' || env.NODE_ENV === 'production' || env.VERCEL === '1' ? '; Secure' : ''}`;
  const tokenOf = req => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
  const origins = (env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174').split(',').map(s => s.trim());
  function sameOrigin(req) {
    if ((req.headers.origin && !origins.includes(req.headers.origin)) || req.headers['x-sos-client'] !== 'central') throw new ApiError(403, 'FORBIDDEN', 'Requisição não autorizada.');
  }
  return async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (origins.includes(req.headers.origin)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-SOS-Client');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://localhost'); const path = url.pathname;
      if (req.method === 'POST' && path === '/api/v1/auth/login') {
        sameOrigin(req);
        const clientIp = env.VERCEL === '1' && typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
        const result = await auth.login(await body(req), clientIp);
        res.setHeader('Set-Cookie', cookie(result.token)); send(200, { data: { operator: result.operator, expiresAt: result.expiresAt } }); return;
      }
      if (req.method === 'GET' && path === '/api/v1/auth/session') { send(200, { data: { operator: await auth.session(tokenOf(req)) } }); return; }
      if (req.method === 'POST' && path === '/api/v1/auth/logout') {
        sameOrigin(req); await auth.logout(tokenOf(req)); res.setHeader('Set-Cookie', cookie('')); send(200, { data: { loggedOut: true } }); return;
      }
      if (req.method === 'POST' && path === '/api/v1/auth/password') {
        sameOrigin(req); await auth.changePassword(tokenOf(req), await body(req)); res.setHeader('Set-Cookie', cookie('')); send(200, { data: { passwordChanged: true } }); return;
      }
      if (req.method === 'GET' && path === '/api/v1/health') { await store.health(); send(200, { data: { status: 'ok', database: 'oracle' } }); return; }
      if (req.method === 'POST' && path === '/api/v1/alerts') {
        const input = createInput(await body(req));
        const result = await store.create(input); send(result.created ? 201 : 200, { data: result.alert }); return;
      }
      if (req.method === 'GET' && path === '/api/v1/alerts') { await auth.session(tokenOf(req)); send(200, await store.list(listInput(url.searchParams))); return; }
      const match = path.match(/^\/api\/v1\/alerts\/([^/]+)(\/status)?$/);
      if (match && (req.method === 'GET' && !match[2] || req.method === 'PATCH' && match[2])) {
        await auth.session(tokenOf(req)); if (req.method === 'PATCH') sameOrigin(req); const id = uuid(match[1]);
        const data = req.method === 'GET' ? await store.get(id) : await store.update(id, statusInput(await body(req)));
        send(200, { data }); return;
      }
      throw new ApiError(404, 'NOT_FOUND', 'Rota não encontrada.');
    } catch (error) {
      const known = error instanceof ApiError;
      if (!known) console.error('HTTP operation failed');
      send(known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Não foi possível concluir a operação.', ...(known && error.fields ? { fields: error.fields } : {}) } });
    }
  };
}
export function apiServer(store, env = process.env) { return createServer(apiHandler(store, env)); }
