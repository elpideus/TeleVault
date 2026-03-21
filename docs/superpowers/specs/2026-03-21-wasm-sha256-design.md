# WASM SHA-256 Hashing Worker — Design Spec

**Date:** 2026-03-21
**Status:** Approved
**Topic:** Replace pure-JS SHA-256 fallback in hash-worker with Rust WASM (sha2 crate + SIMD128)

---

## Problem

TeleVault hashes every file before upload for deduplication. The hashing runs in a Web Worker (`hash-worker.js`) with two strategies:

1. `crypto.subtle.digest('SHA-256', ReadableStream)` — Chrome 130+ only (Oct 2024). Native C++ speed (~5–10 GB/s).
2. Pure-JS SHA-256 fallback — used on Firefox, Safari, and older Chrome. Measured throughput: ~40 MB/s.

At ~40 MB/s, a 14 GB file takes ~6 minutes. Users uploading 500+ GB files face multi-hour hashing times before uploads even begin.

---

## Goal

Replace the pure-JS fallback (Strategy 2) with a Rust SHA-256 compiled to WASM with SIMD128, achieving ~500–800 MB/s. Keep the existing JS fallback as Strategy 3 for ancient or locked-down browsers.

---

## Architecture

### File Layout

```text
frontend/
├── wasm-sha256/                 ← NEW: Rust crate (source committed)
│   ├── Cargo.toml               ← crate name = "sha256" (controls output filenames)
│   └── src/lib.rs
├── scripts/
│   └── build-wasm.mjs           ← NEW: cross-platform build script
├── public/
│   ├── hash-worker.js           ← UPDATED: WASM strategy as Strategy 2
│   └── wasm/                    ← BUILD ARTIFACT (gitignored)
│       ├── sha256_bg.wasm       ← wasm-pack output (crate name = sha256)
│       └── sha256.js            ← wasm-bindgen glue (--target no-modules)
backend/
└── static/
    └── hash-worker.js           ← AUTHORITATIVE COPY: synced from frontend/public/ by build script
```

`frontend/public/hash-worker.js` is the source of truth. The build script copies it to `backend/static/hash-worker.js` after every WASM build.

### Strategy Cascade in hash-worker.js

```text
Strategy 1  crypto.subtle.digest(ReadableStream)   Chrome 130+, ~5–10 GB/s (unchanged)
Strategy 2  WASM WasmHasher                        all modern browsers, ~500–800 MB/s (NEW)
Strategy 3  pure-JS SHA-256                        ancient/locked-down fallback (unchanged)
```

SIMD128 is required to instantiate the WASM module. If a browser does not support WASM SIMD128 (pre-Chrome 91, pre-Firefox 89, pre-Safari 16.4), WASM init will throw and the worker silently falls through to Strategy 3. This is intentional.

### Data Flow

```text
File (Browser)
  │  64 MB chunk via File.slice().arrayBuffer()
  ▼
hash-worker.js (Web Worker)
  │  tries Strategy 1 → 2 → 3 in order
  ▼
hex string → postMessage({ type: 'done', hash })
  ▼
uploadFile() in frontend/src/api/files.ts (unchanged)
```

---

## Rust Crate

**`wasm-sha256/Cargo.toml`**

The package name is `sha256` (not `wasm-sha256`) so that wasm-pack outputs `sha256.js` / `sha256_bg.wasm`. The directory name `wasm-sha256/` is separate from the crate name.

```toml
[package]
name = "sha256"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
sha2 = "0.10"
wasm-bindgen = "=0.2.95"   # pin exact version — --target no-modules is deprecated in newer 0.2.x

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
```

**`wasm-sha256/src/lib.rs`**

```rust
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmHasher(Sha256);

#[wasm_bindgen]
impl WasmHasher {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self { WasmHasher(Sha256::new()) }

    pub fn update(&mut self, data: &[u8]) { self.0.update(data); }

    /// Consumes self — returns 32-byte hash. Do not call any method after this.
    pub fn finalize(self) -> Vec<u8> { self.0.finalize().to_vec() }
}
```

`finalize()` moves self. wasm-bindgen marks the JS wrapper as consumed; calling any method on it afterward throws a "already moved" error. The JS caller must not reuse the hasher after `finalize()`.

---

## Updated hash-worker.js

### WASM Init (top of file — async IIFE, not top-level await)

Classic Web Workers do not support top-level `await` (that requires `type: "module"`). WASM init is wrapped in an async IIFE whose Promise is stored and awaited inside `onmessage`.

```js
// Kick off WASM init immediately at worker start; onmessage awaits the result.
const wasmReadyPromise = (async () => {
  importScripts('/wasm/sha256.js');          // injects wasm_bindgen global
  await wasm_bindgen('/wasm/sha256_bg.wasm'); // instantiates the module
  return true;
})().catch(() => false);                     // any failure → false, degrade to Strategy 3
```

### Strategy 2: WASM SHA-256

```js
async function hashWithWasm(file) {
  const hasher = new wasm_bindgen.WasmHasher();
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK, file.size);
    hasher.update(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
    offset = end;
    self.postMessage({ type: 'progress', value: offset / file.size });
  }
  const hashBytes = hasher.finalize(); // consumes hasher
  return Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

### Updated Entry Point

```js
self.onmessage = async ({ data: file }) => {
  const wasmReady = await wasmReadyPromise; // resolves instantly if already done
  try {
    let hash;
    try {
      hash = await hashWithStreamingWebCrypto(file); // Strategy 1
    } catch {
      if (wasmReady) {
        hash = await hashWithWasm(file);             // Strategy 2
      } else {
        hash = await hashIncremental(file);          // Strategy 3
      }
    }
    self.postMessage({ type: 'done', hash });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
```

Strategy 1 error → Strategy 2 if WASM ready, else Strategy 3. Strategy 2 error propagates as `{ type: 'error' }` (not silently retried as Strategy 3 — a WASM computation error is not a recoverable browser-compat issue).

---

## Build

### Prerequisites (one-time)

```bash
curl https://sh.rustup.rs | sh   # install Rust toolchain
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

### Cross-Platform Build Script

`frontend/scripts/build-wasm.mjs` — a Node.js script that works on Windows, macOS, and Linux without shell-specific syntax:

```js
import { execSync } from 'child_process';
import { copyFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

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
```

### NPM Script (added to `frontend/package.json`)

```json
"build:wasm": "node scripts/build-wasm.mjs",
"build:frontend": "tsc -b && vite build",
"build": "npm run build:wasm && npm run build:frontend"
```

`build:wasm` is prepended to `build` for local development. Docker uses `build:frontend` directly (WASM artifacts are injected from the `wasm-builder` stage). Developers can run `npm run build:wasm` independently after modifying the Rust crate.

---

## .gitignore Changes

Add to `frontend/.gitignore`:

```text
public/wasm/
wasm-sha256/target/
```

---

## Performance Estimates

| Strategy | Browser | Throughput | 14 GB | 500 GB |
| --- | --- | --- | --- | --- |
| Strategy 1 (WebCrypto) | Chrome 130+ | ~5–10 GB/s | ~2–3 s | ~1–2 min (I/O bound) |
| Strategy 2 (WASM+SIMD) | Modern (2021+) | ~500–800 MB/s | ~18–28 s | ~10–17 min |
| Strategy 3 (pure JS) | All | ~40 MB/s | ~6 min | ~3.5 hrs |

For large files at Strategy 2, the bottleneck becomes disk read speed (~2–5 GB/s NVMe). At 2 GB/s, reading 500 GB takes ~250 seconds (~4 min) regardless of SHA-256 throughput. Strategy 2 throughput exceeds disk speed at ~500 MB/s+ disk bandwidth, so the bottleneck is I/O-bound at that point.

---

## Error Handling

| Event | Behaviour |
| --- | --- |
| WASM file 404 / browser lacks SIMD128 | `wasmReadyPromise` resolves `false` → Strategy 3 |
| Strategy 1 throws | Try Strategy 2 (or 3 if WASM not ready) |
| Strategy 2 throws | Propagate as `{ type: 'error' }` — not retried |
| Strategy 3 throws | Propagate as `{ type: 'error' }` |

---

## What Does NOT Change

- `frontend/src/api/files.ts` — zero changes
- `frontend/src/features/explorer/FileExplorer.tsx` — zero changes
- Backend API — zero changes
- Worker message protocol: `{ type: 'progress'|'done'|'error' }` — identical

---

## Docker Build Changes

Both `frontend/Dockerfile` and the root `Dockerfile` run `npm run build` inside a `node:22-alpine` image, which has no Rust. After this change, `npm run build` calls `build:wasm` first, which calls `wasm-pack` — this will fail.

### Solution: WASM pre-stage + split npm scripts

Add a `build:frontend` npm script that skips wasm-pack entirely:

```json
"build:wasm": "node scripts/build-wasm.mjs",
"build:frontend": "tsc -b && vite build",
"build": "npm run build:wasm && npm run build:frontend"
```

Add a `wasm-builder` Docker stage before the Node stage that produces the WASM artifacts, then inject them into the Node stage via `COPY --from`:

**Root `Dockerfile` (insert before `Stage 1: Build frontend`):**

```dockerfile
# ─── Stage 0: Build WASM ─────────────────────────────────────────────────────
FROM rust:1-slim AS wasm-builder
RUN cargo install wasm-pack
WORKDIR /build/wasm-sha256
COPY frontend/wasm-sha256/ .
RUN RUSTFLAGS="-C target-feature=+simd128" \
    wasm-pack build --target no-modules --release --out-dir /wasm-out
```

**Root `Dockerfile` — update Stage 1 to inject artifacts and skip wasm-pack:**

```dockerfile
# ─── Stage 1: Build frontend ─────────────────────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
COPY --from=wasm-builder /wasm-out ./public/wasm/   # inject pre-built WASM
# ... ARG / ENV lines unchanged ...
RUN npm run build:frontend                           # skip wasm-pack
```

**`frontend/Dockerfile` — same pattern** (build context is `frontend/`, so paths differ):

```dockerfile
FROM rust:1-slim AS wasm-builder
RUN cargo install wasm-pack
WORKDIR /build/wasm-sha256
COPY wasm-sha256/ .
RUN RUSTFLAGS="-C target-feature=+simd128" \
    wasm-pack build --target no-modules --release --out-dir /wasm-out

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
COPY --from=wasm-builder /wasm-out ./public/wasm/
# ... ARG / ENV lines unchanged ...
RUN npm run build:frontend
```

### Docker layer caching

The `wasm-builder` stage is only invalidated when `frontend/wasm-sha256/` changes (Rust source or Cargo.toml). Normal frontend changes do not rebuild the WASM stage. CI caching (`cache-from: type=gha`) preserves this.

## CI Notes

The existing `docker-publish.yml` workflow uses `docker/build-push-action` with `context: .`. No changes to the CI workflow file are required — the new `wasm-builder` stage is self-contained in the Dockerfile. Docker layer caching (`cache-from: type=gha`) handles caching the Rust compile stage between runs.

---

## Testing

- Manual: drop a known file, verify hex output matches `sha256sum` on the same file
- Integration: the duplicate-detection flow (`hash → /api/v1/files/check-hash`) acts as a correctness test — a wrong hash causes false negatives on deduplication
- No unit tests for the Rust crate (sha2 is tested upstream by RustCrypto)
