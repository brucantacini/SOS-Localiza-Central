// Exercises the Vercel adapter over HTTP against the real configured Oracle.
// Does not deploy or claim to validate Vercel's cloud runtime/build.
process.env.SOS_TEST_VERCEL = '1';
process.env.VERCEL = '1';
await import('./oracle-integration.mjs');
