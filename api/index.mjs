import { apiHandler } from '../backend/http.mjs';
import { oracleStore } from '../backend/oracle.mjs';
import { vercelAdapter } from '../backend/vercel.mjs';

// One store/pool per warm function instance; sessions remain persisted in Oracle.
export default vercelAdapter(apiHandler(oracleStore()));
