import { execSync } from 'child_process';
import { copyFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

// resolve() from the script file path walks up two segments:
// scripts/build-wasm.mjs → scripts/ → frontend/  (the repo's frontend root)
const root = resolve(fileURLToPath(import.meta.url), '../../');

execSync('wasm-pack build --target no-modules --release --out-dir ../public/wasm', {
  cwd: join(root, 'wasm-sha256'),
  env: { ...process.env, RUSTFLAGS: '-C target-feature=+simd128' },
  stdio: 'inherit',
});

copyFileSync(
  join(root, 'public/hash-worker.js'),
  join(root, '../backend/static/hash-worker.js'),
);

console.log('✓ WASM built and hash-worker.js synced to backend/static/');
