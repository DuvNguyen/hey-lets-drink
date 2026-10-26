require('dotenv').config();
const { execSync } = require('child_process');

console.log('--- Starting build verification ---');

// 1. Bundle client assets
console.log('1. Bundling client assets...');
const esbuild = require('esbuild');
esbuild.buildSync({
  entryPoints: ['node_modules/@neon/realtime/dist/client.js'],
  bundle: true,
  format: 'iife',
  globalName: 'NeonRealtime',
  outfile: 'public/neon-realtime.js',
  minify: true
});
console.log('✓ Neon Realtime client bundled into public/neon-realtime.js');

// 2. Syntax check server.js and db.js
console.log('2. Checking Node.js syntax...');
execSync('node --check server.js', { stdio: 'inherit' });
execSync('node --check db.js', { stdio: 'inherit' });
console.log('✓ Syntax valid');

// 3. Neon Database connectivity and schema check if DATABASE_URL is present
console.log('3. Verifying Neon services...');
if (process.env.DATABASE_URL) {
  const db = require('../db');
  db.initDb().then(async () => {
    const meds = await db.getMedications();
    console.log(`✓ Neon Postgres connection verified (${meds.length} medications loaded)`);
    if (process.env.NEON_REALTIME_SECRET) {
      await db.sealRealtimeQuery('SELECT id, name FROM medications', []);
      console.log('✓ Neon Realtime live query capability verified');
    }
    console.log('--- Build successful! ---');
    process.exit(0);
  }).catch(err => {
    console.error('Neon DB verification failed:', err);
    process.exit(1);
  });
} else {
  console.log('DATABASE_URL not set; skipping live DB check.');
  console.log('--- Build successful! ---');
  process.exit(0);
}
