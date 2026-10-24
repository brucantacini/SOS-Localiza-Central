import { writeFile } from 'node:fs/promises';
import { hashPassword } from '../passwords.mjs';
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (input.length > 32768) process.exit(1); }
try {
  const { usernames, password } = JSON.parse(input);
  if (!Array.isArray(usernames) || !usernames.length || usernames.length > 100 || usernames.some(name => typeof name !== 'string' || !/^[a-z0-9._-]{1,80}$/.test(name)) || typeof password !== 'string' || password.length < 8 || password.length > 256) throw new Error();
  const operators = [];
  for (const username of new Set(usernames)) operators.push({ username, passwordHash: await hashPassword(password) });
  // Exclusive creation avoids overwriting a prior private manifest.
  await writeFile(new URL('../.operators.seed.json', import.meta.url), JSON.stringify({ operators }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log('Manifesto local criado somente com hashes. Nenhuma senha foi armazenada.');
} catch { console.error('Não foi possível preparar o manifesto. Confira a entrada e se o arquivo local já existe.'); process.exitCode = 1; }
