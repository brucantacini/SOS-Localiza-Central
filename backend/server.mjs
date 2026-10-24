import { oracleStore } from './oracle.mjs';
import { apiServer } from './http.mjs';
const store = oracleStore();
const server = apiServer(store);
server.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () => {
  console.log(`SOS Localiza API: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3001}/api/v1`);
  if (!process.env.ORACLE_CONNECT_STRING) console.warn('Oracle não configurado: operações persistentes responderão 503.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await store.close(); process.exit(0); }));
