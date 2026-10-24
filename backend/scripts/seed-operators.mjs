import { readFile } from 'node:fs/promises';
import { oracleStore } from '../oracle.mjs';
import { validateOperators } from './operator-manifest.mjs';
const store = oracleStore();
try {
  const operators = validateOperators(JSON.parse(await readFile(new URL('../.operators.seed.json', import.meta.url), 'utf8')));
  const result = await store.seedOperators(operators);
  console.log(`Seed concluído: ${result.inserted} criados; ${result.preserved} preservados. Senhas existentes não foram alteradas.`);
} catch (error) { console.error('Falha no seed de operadores:', error.code || 'CONFIGURATION_ERROR'); process.exitCode = 1; }
finally { await store.close(); }
