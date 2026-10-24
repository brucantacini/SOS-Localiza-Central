import { randomBytes, randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import { hashPassword } from '../../passwords.mjs';
export async function testOperator(store) {
  const username = 'test_' + randomUUID().replaceAll('-', '');
  const password = randomBytes(24).toString('hex');
  await store.seedOperators([{ username, passwordHash: await hashPassword(password) }]);
  const row = await store.findOperator(username);
  return {
    username, password,
    async cleanup() {
      const db = await oracledb.getConnection({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING });
      try { await db.execute('DELETE FROM SOS_OPERATORS WHERE ID = :id', { id: row.ID }, { autoCommit: true }); }
      finally { await db.close(); }
    },
  };
}
