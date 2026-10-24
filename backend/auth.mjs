import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './passwords.mjs';
import { ApiError } from './validation.mjs';
const invalid = () => new ApiError(401, 'UNAUTHORIZED', 'Usuário ou senha inválidos.');
export const sessionHash = token => createHash('sha256').update(token).digest('hex');
const dummy = hashPassword(randomBytes(32).toString('hex'));
export function authService(store) {
  const attempts = new Map(); let working = 0;
  function limit(ip) {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
    const entry = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
    if (attempts.size >= 10000 || entry.count >= 20 || working >= 4) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas. Aguarde antes de tentar novamente.');
    entry.count++; attempts.set(ip, entry);
  }
  return {
    async login(input, ip) {
      limit(ip); working++;
      try {
        const username = typeof input?.username === 'string' ? input.username.trim().toLowerCase() : '';
        const password = typeof input?.password === 'string' && input.password.length <= 256 ? input.password : '';
        const operator = /^[a-z0-9._-]{1,80}$/.test(username) ? await store.findOperator(username) : null;
        const valid = await verifyPassword(password, operator?.PASSWORD_HASH || await dummy);
        if (!operator || !valid || operator.IS_ACTIVE !== 1 || !password) throw invalid();
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
        await store.createSession({ tokenHash: sessionHash(token), operatorId: operator.ID, expectedHash: operator.PASSWORD_HASH, expiresAt });
        return { token, operator: { username: operator.USERNAME, mustChangePassword: operator.MUST_CHANGE_PASSWORD === 1 }, expiresAt };
      } finally { working--; }
    },
    async session(token) {
      if (!/^[a-f0-9]{64}$/.test(token || '')) throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada. Entre novamente.');
      const operator = await store.findSession(sessionHash(token));
      if (!operator) throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada. Entre novamente.');
      return operator;
    },
    async logout(token) { if (/^[a-f0-9]{64}$/.test(token || '')) await store.deleteSession(sessionHash(token)); },
    async changePassword(token, input) {
      const session = await this.session(token);
      const currentPassword = typeof input?.currentPassword === 'string' && input.currentPassword.length <= 256 ? input.currentPassword : '';
      const newPassword = input?.newPassword;
      if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 256 || newPassword === currentPassword) throw new ApiError(400, 'VALIDATION_ERROR', 'A nova senha deve ter de 12 a 256 caracteres e ser diferente da atual.');
      const row = await store.findOperator(session.username);
      if (!row || !await verifyPassword(currentPassword, row.PASSWORD_HASH)) throw invalid();
      await store.changePassword(row.ID, row.PASSWORD_HASH, await hashPassword(newPassword));
    },
  };
}
