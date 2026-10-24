import oracledb from 'oracledb';
import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from './validation.mjs';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];
function record(row) {
  return { id: row.ID, requestId: row.REQUEST_ID, type: row.OCCURRENCE_TYPE, date: row.CREATED_AT, updatedAt: row.UPDATED_AT, status: row.STATUS, version: row.VERSION, location: row.LOCATION, source: row.LOCATION_SOURCE, latitude: row.LATITUDE, longitude: row.LONGITUDE, profile: { name: row.PROFILE_NAME, cpf: row.PROFILE_CPF, phone: row.PROFILE_PHONE, address: row.PROFILE_ADDRESS }, notes: row.NOTES || '' };
}
const missing = () => new ApiError(404, 'NOT_FOUND', 'Alerta não encontrado.');
const conflict = () => new ApiError(409, 'CONFLICT', 'Registro alterado ou identificador reutilizado. Atualize os dados antes de tentar novamente.');
export function oracleStore(env = process.env) {
  let poolPromise;
  async function pool() {
    if (!env.ORACLE_USER || !env.ORACLE_PASSWORD || !env.ORACLE_CONNECT_STRING) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Conexão Oracle não configurada no backend.');
    if (!poolPromise) {
      poolPromise = oracledb.createPool({ user: env.ORACLE_USER, password: env.ORACLE_PASSWORD, connectString: env.ORACLE_CONNECT_STRING,
        ...(env.ORACLE_CONFIG_DIR ? { configDir: env.ORACLE_CONFIG_DIR } : {}),
        ...(env.ORACLE_WALLET_LOCATION ? { walletLocation: env.ORACLE_WALLET_LOCATION } : {}),
        ...(env.ORACLE_WALLET_PASSWORD ? { walletPassword: env.ORACLE_WALLET_PASSWORD } : {}),
        poolMin: 0, poolMax: 5, queueTimeout: 10000,
      }).catch(error => { poolPromise = undefined; throw error; });
    }
    return poolPromise;
  }
  async function connection(fn) {
    let db;
    try { db = await (await pool()).getConnection(); db.callTimeout = 15000; return await fn(db); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      // Never expose Oracle messages, bind data, connection strings or credentials.
      console.error('Oracle operation failed:', error.code || 'UNKNOWN');
      throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Não foi possível acessar o Oracle. Tente novamente.');
    } finally { if (db) await db.close(); }
  }
  async function byId(db, id) { const result = await db.execute('SELECT * FROM SOS_ALERTS WHERE ID = :id', { id }); if (!result.rows[0]) throw missing(); return record(result.rows[0]); }
  return {
    async findOperator(username) {
      return connection(async db => (await db.execute('SELECT ID, USERNAME, PASSWORD_HASH, MUST_CHANGE_PASSWORD, IS_ACTIVE FROM SOS_OPERATORS WHERE USERNAME = :username', { username })).rows[0] || null);
    },
    async seedOperators(operators) {
      return connection(async db => {
        let inserted = 0;
        try {
          for (const operator of operators) {
            const result = await db.execute(`MERGE INTO SOS_OPERATORS target USING (SELECT :username AS USERNAME FROM DUAL) source
              ON (target.USERNAME = source.USERNAME) WHEN NOT MATCHED THEN INSERT
              (ID, USERNAME, PASSWORD_HASH, MUST_CHANGE_PASSWORD, IS_ACTIVE, CREATED_AT, UPDATED_AT)
              VALUES (:id, source.USERNAME, :passwordHash, 1, 1, :createdAt, :updatedAt)`,
            { username: operator.username, id: randomUUID(), passwordHash: operator.passwordHash, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
            inserted += result.rowsAffected;
          }
          await db.commit(); return { inserted, preserved: operators.length - inserted };
        } catch (error) { await db.rollback(); throw error; }
      });
    },
    async createSession({ tokenHash, operatorId, expectedHash, expiresAt }) {
      return connection(async db => {
        const current = (await db.execute('SELECT PASSWORD_HASH, IS_ACTIVE FROM SOS_OPERATORS WHERE ID = :operatorId FOR UPDATE', { operatorId })).rows[0];
        if (!current || current.PASSWORD_HASH !== expectedHash || current.IS_ACTIVE !== 1) { await db.rollback(); throw new ApiError(401, 'UNAUTHORIZED', 'Usuário ou senha inválidos.'); }
        await db.execute('DELETE FROM SOS_OPERATOR_SESSIONS WHERE EXPIRES_AT <= :nowDate', { nowDate: new Date().toISOString() });
        await db.execute('INSERT INTO SOS_OPERATOR_SESSIONS (TOKEN_HASH, OPERATOR_ID, CREATED_AT, EXPIRES_AT) VALUES (:tokenHash, :operatorId, :createdAt, :expiresAt)', { tokenHash, operatorId, createdAt: new Date().toISOString(), expiresAt });
        await db.commit();
      });
    },
    async findSession(tokenHash) {
      return connection(async db => {
        const result = await db.execute(`SELECT o.USERNAME, o.MUST_CHANGE_PASSWORD FROM SOS_OPERATOR_SESSIONS s
          JOIN SOS_OPERATORS o ON o.ID = s.OPERATOR_ID WHERE s.TOKEN_HASH = :tokenHash AND s.EXPIRES_AT > :nowDate AND o.IS_ACTIVE = 1`, { tokenHash, nowDate: new Date().toISOString() });
        const row = result.rows[0]; return row ? { username: row.USERNAME, mustChangePassword: row.MUST_CHANGE_PASSWORD === 1 } : null;
      });
    },
    async deleteSession(tokenHash) {
      return connection(async db => { await db.execute('DELETE FROM SOS_OPERATOR_SESSIONS WHERE TOKEN_HASH = :tokenHash', { tokenHash }); await db.commit(); });
    },
    async changePassword(id, oldHash, newHash) {
      return connection(async db => {
        try {
          const changed = await db.execute('UPDATE SOS_OPERATORS SET PASSWORD_HASH = :newHash, MUST_CHANGE_PASSWORD = 0, UPDATED_AT = :updatedAt WHERE ID = :id AND PASSWORD_HASH = :oldHash AND IS_ACTIVE = 1', { id, oldHash, newHash, updatedAt: new Date().toISOString() });
          if (!changed.rowsAffected) throw new ApiError(409, 'CONFLICT', 'Não foi possível alterar a senha. Entre novamente.');
          await db.execute('DELETE FROM SOS_OPERATOR_SESSIONS WHERE OPERATOR_ID = :id', { id });
          await db.commit();
        } catch (error) { await db.rollback(); throw error; }
      });
    },
    async health() { return connection(db => db.execute('SELECT 1 FROM DUAL')); },
    async get(id) { return connection(db => byId(db, id)); },
    async create(input) {
      return connection(async db => {
        const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
        async function previous() {
          const result = await db.execute('SELECT * FROM SOS_ALERTS WHERE REQUEST_ID = :requestId', { requestId: input.requestId });
          if (!result.rows[0]) return null;
          if (result.rows[0].REQUEST_HASH !== hash) throw conflict();
          return { alert: record(result.rows[0]), created: false };
        }
        const existing = await previous(); if (existing) return existing;
        const id = randomUUID(); const now = new Date().toISOString();
        try {
          await db.execute(`INSERT INTO SOS_ALERTS
            (ID, REQUEST_ID, REQUEST_HASH, OCCURRENCE_TYPE, CREATED_AT, UPDATED_AT, STATUS, VERSION, LOCATION, LOCATION_SOURCE, LATITUDE, LONGITUDE, PROFILE_NAME, PROFILE_CPF, PROFILE_PHONE, PROFILE_ADDRESS, NOTES)
            VALUES (:id, :requestId, :hash, :type, :nowDate, :nowUpdated, 'novo', 1, :location, :source, :latitude, :longitude, :name, :cpf, :phone, :address, :notes)`,
          { id, requestId: input.requestId, hash, type: input.type, nowDate: now, nowUpdated: now, location: input.location, source: input.source, latitude: input.latitude, longitude: input.longitude, ...input.profile, notes: input.notes });
          // Read before commit so conversion errors cannot report a committed record as failed.
          const alert = await byId(db, id);
          await db.commit();
          return { alert, created: true };
        } catch (error) {
          await db.rollback();
          if (error.errorNum === 1) { const duplicate = await previous(); if (duplicate) return duplicate; }
          throw error;
        }
      });
    },
    async list(filters) {
      return connection(async db => {
        const where = []; const binds = {};
        for (const [key, column] of [['status', 'STATUS'], ['type', 'OCCURRENCE_TYPE']]) if (filters[key]) { where.push(`${column} = :${key}`); binds[key] = filters[key]; }
        if (filters.from) { where.push('CREATED_AT >= :fromDate'); binds.fromDate = filters.from + 'T00:00:00.000Z'; }
        if (filters.to) { where.push('CREATED_AT <= :toDate'); binds.toDate = filters.to + 'T23:59:59.999Z'; }
        if (filters.q) { where.push('(INSTR(LOWER(PROFILE_NAME), :search) > 0 OR INSTR(LOWER(LOCATION), :search) > 0 OR INSTR(LOWER(NOTES), :search) > 0)'); binds.search = filters.q.toLowerCase(); }
        const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
        // Same read-only transaction snapshot keeps count and page consistent during new submissions.
        await db.execute('SET TRANSACTION READ ONLY');
        try {
          const counts = await db.execute(`SELECT STATUS, COUNT(*) AS TOTAL FROM SOS_ALERTS${clause} GROUP BY STATUS`, binds);
          const summary = { total: 0, novo: 0, em_atendimento: 0, resolvido: 0 };
          for (const row of counts.rows) { summary[row.STATUS] = row.TOTAL; summary.total += row.TOTAL; }
          const rows = await db.execute(`SELECT * FROM SOS_ALERTS${clause} ORDER BY CREATED_AT DESC, ID DESC OFFSET :skip ROWS FETCH NEXT :take ROWS ONLY`, { ...binds, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize });
          return { data: rows.rows.map(record), pagination: { page: filters.page, pageSize: filters.pageSize, total: summary.total }, summary };
        } finally { await db.rollback(); }
      });
    },
    async update(id, input) {
      return connection(async db => {
        try {
          const result = await db.execute('UPDATE SOS_ALERTS SET STATUS = :status, VERSION = VERSION + 1, UPDATED_AT = :updatedAt WHERE ID = :id AND VERSION = :expectedVersion', { ...input, id, updatedAt: new Date().toISOString() });
          if (!result.rowsAffected) { await byId(db, id); throw conflict(); }
          const alert = await byId(db, id); await db.commit(); return alert;
        } catch (error) { await db.rollback(); throw error; }
      });
    },
    async close() { if (poolPromise) await (await poolPromise).close(5); },
  };
}
