import oracledb from 'oracledb';
import { readFile } from 'node:fs/promises';

let db;
try {
  db = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
    ...(process.env.ORACLE_CONFIG_DIR ? { configDir: process.env.ORACLE_CONFIG_DIR } : {}),
    ...(process.env.ORACLE_WALLET_LOCATION ? { walletLocation: process.env.ORACLE_WALLET_LOCATION } : {}),
    ...(process.env.ORACLE_WALLET_PASSWORD ? { walletPassword: process.env.ORACLE_WALLET_PASSWORD } : {}),
  });
  db.callTimeout = 15000;
  console.log('Oracle conectado via driver Thin.');
  const files = process.argv.includes('--operators-only') ? ['../migrations/002-operators.sql'] : ['../schema.sql', '../migrations/002-operators.sql'];
  const schema = (await Promise.all(files.map(file => readFile(new URL(file, import.meta.url), 'utf8')))).join('\n');
  for (const statement of schema.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) {
    const table = statement.match(/^CREATE TABLE (\w+)/i);
    const index = statement.match(/^CREATE INDEX (\w+)/i);
    const name = (table || index)?.[1];
    if (!name) throw new Error('DDL não reconhecido');
    const existing = await db.execute(table ? 'SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME = :name' : 'SELECT INDEX_NAME FROM USER_INDEXES WHERE INDEX_NAME = :name', { name });
    if (existing.rows.length) { console.log(`${name}: já existe, preservado.`); continue; }
    await db.execute(statement);
    console.log(`${name}: criado.`);
  }
  console.log('Schema pronto. Objetos existentes preservados.');
} catch (error) {
  console.error('Falha na preparação Oracle:', error.code || 'UNKNOWN');
  process.exitCode = 1;
} finally { if (db) await db.close(); }
