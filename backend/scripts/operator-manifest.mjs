import { validHash } from '../passwords.mjs';
export function validateOperators(manifest) {
  if (!Array.isArray(manifest?.operators) || !manifest.operators.length || manifest.operators.length > 100) throw new Error('Manifesto local inválido.');
  const names = new Set();
  for (const item of manifest.operators) {
    if (!/^[a-z0-9._-]{1,80}$/.test(item?.username || '') || !validHash(item?.passwordHash) || names.has(item.username) || Object.keys(item).some(key => !['username', 'passwordHash'].includes(key))) throw new Error('Manifesto local inválido.');
    names.add(item.username);
  }
  return manifest.operators;
}
