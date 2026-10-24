import oracledb from 'oracledb';
let db;
try {
  db = await oracledb.getConnection({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING });
  const result = await db.execute(`SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM USER_TAB_COLUMNS
    WHERE REGEXP_LIKE(TABLE_NAME, 'SOS|OPER|USER|AUTH|SESS', 'i') ORDER BY TABLE_NAME, COLUMN_ID`);
  console.log(JSON.stringify(result.rows));
} catch (e) { console.error('Falha de inspeção:', e.code || 'UNKNOWN'); process.exitCode = 1; }
finally { if (db) await db.close(); }
