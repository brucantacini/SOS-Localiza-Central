import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
// OWASP scrypt alternative: N=2^15, r=8, p=3. Random 16-byte salt per password.
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$3$${salt}$${key.toString('hex')}`;
}
export function validHash(hash) { return typeof hash === 'string' && /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash); }
export async function verifyPassword(password, hash) {
  if (!validHash(hash)) return false;
  const [, n, r, p, salt, expected] = hash.split('$');
  const actual = await scrypt(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
