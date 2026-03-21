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

Replace the pure-JS fallback (Strategy 2) with a Rust SHA-256 compiled to WASM with SIMD128, achieving ~500–800 MB/s. Keep the existing JS fallback as Strategy 3 for ancient/locked-down browsers.

---

## Architecture

### File Layout

```
frontend/
├── wasm-sha256/                 ← NEW: Rust crate (source committed)
│   ├── Cargo.toml
│   └── src/lib.rs
├── public/
│   ├── hash-worker.js           ← UPDATED: WASM strategy as Strategy 2
│   └── wasm/                    ← BUILD ARTIFACT (gitignored)
│       ├── sha256_bg.wasm
│       └── sha256.js            ← wasm-bindgen glue (--target no-modules)
backend/
└── static/
    └── hash-worker.js           ← UPDATED: kept in sync via build script
```

### Strategy Cascade in hash-worker.js

```
Strategy 1  crypto.subtle.digest(ReadableStream)   Chrome 130+, ~5–10 GB/s (unchanged)
Strategy 2  WASM WasmHasher                        all modern browsers, ~500–800 MB/s (NEW)
Strategy 3  pure-JS SHA-256                        ancient fallback (unchanged)
```

### Data Flow

```
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

    /// Consumes self, returns 32-byte hash as Uint8Array
    pub fn finalize(self) -> Vec<u8> { self.0.finalize().to_vec() }
}
```

**`wasm-sha256/Cargo.toml`**

```toml
[package]
name = "wasm-sha256"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
sha2 = "0.10"
wasm-bindgen = "0.2"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
```

---

## Updated hash-worker.js

WASM init runs once at worker startup:

```js
let wasmReady = false;
try {
  importScripts('/wasm/sha256.js');
  await wasm_bindgen('/wasm/sha256_bg.wasm');
  wasmReady = true;
} catch {
  // Silently degrade to Strategy 3 (pure-JS)
}
```

WASM hashing (Strategy 2):

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
  const hashBytes = hasher.finalize();
  return Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

Entry point becomes:

```js
self.onmessage = async ({ data: file }) => {
  try {
    let hash;
    try { hash = await hashWithStreamingWebCrypto(file); }
    catch {
      if (wasmReady) { hash = await hashWithWasm(file); }
      else { hash = await hashIncremental(file); }
    }
    self.postMessage({ type: 'done', hash });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
```

---

## Build

### Prerequisites (one-time)

```bash
curl https://sh.rustup.rs | sh   # install Rust
cargo install wasm-pack
```

### NPM Scripts (added to frontend/package.json)

```json
"build:wasm": "cd wasm-sha256 && RUSTFLAGS=\"-C target-feature=+simd128\" wasm-pack build --target no-modules --release --out-dir ../public/wasm && cp ../public/hash-worker.js ../../backend/static/hash-worker.js"
```

Must be run before `npm run build` and after any change to the Rust crate or `hash-worker.js`.

### .gitignore

```
frontend/public/wasm/
```

---

## Performance Estimates

| Strategy | Browser | Throughput | 14 GB | 500 GB |
|---|---|---|---|---|
| Strategy 1 (WebCrypto) | Chrome 130+ | ~5–10 GB/s | ~2–3 s | ~1 min |
| Strategy 2 (WASM) | All modern | ~500–800 MB/s | ~18–28 s | ~10–17 min |
| Strategy 3 (pure JS) | All | ~40 MB/s | ~6 min | ~3.5 hrs |

For 500+ GB files, the bottleneck at Strategy 2 becomes disk read speed (~2–5 GB/s NVMe = 100–250 s for 500 GB), not SHA-256 computation.

---

## Error Handling

- WASM init failure → `wasmReady = false` → falls through to Strategy 3, no crash
- WASM runtime error during hashing → caught by outer try/catch → posts `{ type: 'error' }`
- Strategy 1 error → tries WASM → tries JS (same as before, extended)

---

## What Does NOT Change

- `frontend/src/api/files.ts` — zero changes
- `frontend/src/features/explorer/FileExplorer.tsx` — zero changes
- Backend — zero changes
- Worker message protocol: `{ type: 'progress'|'done'|'error' }` — identical

---

## Testing

- Manual: drop a known file, verify hex output matches `sha256sum` on the same file
- Integration: the duplicate-detection flow (`hash → /api/v1/files/check-hash`) acts as a correctness check — a wrong hash would cause false negatives on deduplication
- No unit tests for the Rust crate (sha2 is tested upstream by RustCrypto)
