# WASM SHA-256 Hashing Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the slow pure-JS SHA-256 fallback in `hash-worker.js` with a Rust WASM implementation, reducing hashing time for large files from ~6 min/14 GB to ~20 seconds.

**Architecture:** A Rust crate (`frontend/wasm-sha256/`) uses the `sha2` crate compiled to WASM with SIMD128 via wasm-pack. The existing `hash-worker.js` gains a new Strategy 2 (WASM) inserted between Strategy 1 (native WebCrypto, Chrome 130+) and Strategy 3 (pure-JS fallback). Both Dockerfiles get a `wasm-builder` pre-stage using `rust:1-slim` that produces the WASM artifacts, injected into the Node build stage, so the Node image never needs Rust.

**Tech Stack:** Rust 1.x, sha2 0.10, wasm-bindgen 0.2.95 (pinned), wasm-pack, Node.js ESM build script, `node:22-alpine` + `rust:1-slim` Docker multi-stage

---

## File Map

| Action | File | Purpose |
| --- | --- | --- |
| Create | `frontend/wasm-sha256/Cargo.toml` | Rust crate manifest (name = "sha256" for output filenames) |
| Create | `frontend/wasm-sha256/src/lib.rs` | WasmHasher struct: new / update / finalize |
| Create | `frontend/scripts/build-wasm.mjs` | Cross-platform Node.js build script (runs wasm-pack, copies hash-worker.js to backend) |
| Modify | `frontend/package.json` | Add build:wasm, build:frontend scripts; update build to chain them |
| Modify | `frontend/.gitignore` | Ignore `public/wasm/` and `wasm-sha256/target/` |
| Modify | `frontend/public/hash-worker.js` | Insert wasmReadyPromise init, hashWithWasm(), updated onmessage |
| Modify | `backend/static/hash-worker.js` | Auto-synced by build script from frontend/public/hash-worker.js |
| Modify | `Dockerfile` (root) | Add wasm-builder stage; update frontend-build to inject WASM + run build:frontend |
| Modify | `frontend/Dockerfile` | Same pattern, adjusted paths for frontend build context |

---

## Task 1: Install Rust toolchain and wasm-pack

**Files:** no repo files changed — local tooling only

- [ ] **Step 1: Install Rust via rustup**

  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
  ```

  Expected: `rustup` and `cargo` available in PATH.

- [ ] **Step 2: Add the wasm32 target**

  ```bash
  rustup target add wasm32-unknown-unknown
  ```

  Expected output includes: `wasm32-unknown-unknown` in installed targets.

- [ ] **Step 3: Install wasm-pack**

  ```bash
  cargo install wasm-pack
  ```

  Expected: `wasm-pack` binary available. Verify:

  ```bash
  wasm-pack --version
  ```

  Expected output: `wasm-pack 0.13.x` (or similar).

---

## Task 2: Create the Rust crate

**Files:**

- Create: `frontend/wasm-sha256/Cargo.toml`
- Create: `frontend/wasm-sha256/src/lib.rs`

- [ ] **Step 1: Create `frontend/wasm-sha256/Cargo.toml`**

  ```toml
  [package]
  name = "sha256"
  version = "0.1.0"
  edition = "2021"

  [lib]
  crate-type = ["cdylib"]

  [dependencies]
  sha2 = "0.10"
  wasm-bindgen = "=0.2.95"

  [profile.release]
  opt-level = 3
  lto = true
  codegen-units = 1
  ```

  The `name = "sha256"` (not "wasm-sha256") is critical — wasm-pack derives output filenames from the crate name. This produces `sha256.js` and `sha256_bg.wasm`.

- [ ] **Step 2: Create `frontend/wasm-sha256/src/lib.rs`**

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

      /// Consumes self — do NOT call any method after finalize().
      pub fn finalize(self) -> Vec<u8> { self.0.finalize().to_vec() }
  }
  ```

- [ ] **Step 3: Verify the crate compiles natively**

  ```bash
  cd frontend/wasm-sha256
  cargo check
  ```

  Expected: `Finished` with no errors. This catches typos before the slower WASM build.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/wasm-sha256/
  git commit -m "feat: add Rust sha256 WASM crate"
  ```

---

## Task 3: Update .gitignore

**Files:**

- Modify: `frontend/.gitignore`

- [ ] **Step 1: Append WASM build artifacts to `frontend/.gitignore`**

  Add to the end of `frontend/.gitignore`:

  ```text
  # WASM build artifacts
  public/wasm/
  wasm-sha256/target/
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/.gitignore
  git commit -m "chore: ignore WASM build artifacts"
  ```

---

## Task 4: Create cross-platform build script

**Files:**

- Create: `frontend/scripts/build-wasm.mjs`

- [ ] **Step 1: Create `frontend/scripts/` directory and `build-wasm.mjs`**

  ```js
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
  ```

  **`--target no-modules`** is the only wasm-pack target compatible with `importScripts()` in classic (non-module) Web Workers. Do not change this to `--target web` or `--target bundler`.

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/scripts/build-wasm.mjs
  git commit -m "feat: add cross-platform wasm build script"
  ```

---

## Task 5: Update `frontend/package.json` scripts

**Files:**

- Modify: `frontend/package.json`

- [ ] **Step 1: Update the `scripts` block**

  Current `scripts` block:

  ```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  }
  ```

  Replace with:

  ```json
  "scripts": {
    "dev": "vite",
    "build:wasm": "node scripts/build-wasm.mjs",
    "build:frontend": "tsc -b && vite build",
    "build": "npm run build:wasm && npm run build:frontend",
    "lint": "eslint .",
    "preview": "vite preview"
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/package.json
  git commit -m "feat: add build:wasm and build:frontend npm scripts"
  ```

---

## Task 6: Run the first WASM build and verify artifacts

**Files:** no repo files changed — this is a verification step

- [ ] **Step 1: Run the WASM build from the `frontend/` directory**

  ```bash
  cd frontend
  npm run build:wasm
  ```

  Expected output (last few lines):

  ```text
  [INFO]: :-) Done in Xs
  ✓ WASM built and hash-worker.js synced to backend/static/
  ```

- [ ] **Step 2: Verify output files exist**

  ```bash
  ls frontend/public/wasm/
  ```

  Expected: `sha256.js`, `sha256_bg.wasm`, and several other wasm-pack generated files (`sha256.d.ts`, `package.json`, etc. — all ignored by `.gitignore`).

- [ ] **Step 3: Verify the `.wasm` file is non-trivial in size**

  ```bash
  ls -lh frontend/public/wasm/sha256_bg.wasm
  ```

  Expected: file is between 20 KB and 200 KB. A 0-byte or missing file indicates a build failure.

- [ ] **Step 4: Verify `backend/static/hash-worker.js` was copied**

  ```bash
  diff frontend/public/hash-worker.js backend/static/hash-worker.js
  ```

  Expected: no diff output (files are identical). If diff shows differences, the copy step failed — re-check `build-wasm.mjs` path resolution.

---

## Task 7: Update `hash-worker.js` with WASM Strategy 2

**Files:**

- Modify: `frontend/public/hash-worker.js`

This is the most critical task. Read the full current file before editing — the existing Strategy 1 and Strategy 3 code must not be touched.

- [ ] **Step 1: Add WASM init Promise at the top of the file**

  Insert after line 11 (`const CHUNK = 64 * 1024 * 1024;`) and before the `// ── Strategy 1` comment:

  ```js
  // ── Strategy 2 init: WASM SHA-256 ────────────────────────────────────────────
  // Kicked off immediately at worker start. onmessage awaits this before hashing.
  // Classic workers don't support top-level await — async IIFE stores the Promise.
  const wasmReadyPromise = (async () => {
    importScripts('/wasm/sha256.js');           // injects wasm_bindgen global
    await wasm_bindgen('/wasm/sha256_bg.wasm'); // instantiates the WASM module
    return true;
  })().catch(() => false); // any failure (404, no SIMD128 support) → false → Strategy 3
  ```

- [ ] **Step 2: Add `hashWithWasm` function**

  Insert after the closing `}` of `hashIncremental` (around line 116) and before `// ── Helpers`:

  ```js
  // ── Strategy 2: WASM SHA-256 ─────────────────────────────────────────────────
  async function hashWithWasm(file) {
    const hasher = new wasm_bindgen.WasmHasher();
    let offset = 0;
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK, file.size);
      hasher.update(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
      offset = end;
      self.postMessage({ type: 'progress', value: offset / file.size });
    }
    const hashBytes = hasher.finalize(); // consumes hasher — do not use after this
    return Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  ```

- [ ] **Step 3: Update `self.onmessage` entry point**

  Replace the existing `self.onmessage` block (the entire block starting at `self.onmessage = async`) with:

  ```js
  // ── Entry point ──────────────────────────────────────────────────────────────
  self.onmessage = async ({ data: file }) => {
    const wasmReady = await wasmReadyPromise; // resolves instantly if already initialised
    try {
      let hash;
      try {
        // Strategy 1: native streaming Web Crypto (Chrome 130+)
        hash = await hashWithStreamingWebCrypto(file);
      } catch {
        if (wasmReady) {
          // Strategy 2: WASM SHA-256 (~500–800 MB/s, all modern browsers)
          hash = await hashWithWasm(file);
        } else {
          // Strategy 3: pure-JS SHA-256 fallback (ancient/locked-down browsers)
          hash = await hashIncremental(file);
        }
      }
      self.postMessage({ type: 'done', hash });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  };
  ```

- [ ] **Step 4: Verify the file looks correct**

  Read through `frontend/public/hash-worker.js` top to bottom and confirm:

  - `wasmReadyPromise` async IIFE is near the top (after `const CHUNK`)
  - `hashWithStreamingWebCrypto` is unchanged
  - `createSHA256` and `hashIncremental` are unchanged
  - `hashWithWasm` is new and present
  - `bufToHex` helper is unchanged
  - `self.onmessage` uses `await wasmReadyPromise` and the three-strategy cascade

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/public/hash-worker.js
  git commit -m "feat: add WASM SHA-256 as Strategy 2 in hash-worker"
  ```

---

## Task 8: Sync updated hash-worker.js to backend

**Files:**

- Modify: `backend/static/hash-worker.js` (via build script)

- [ ] **Step 1: Re-run `build:wasm` to sync the updated worker to `backend/static/`**

  ```bash
  cd frontend
  npm run build:wasm
  ```

  The WASM artifacts are already built — wasm-pack will be very fast on a no-change rebuild. The `copyFileSync` at the end always copies the current `hash-worker.js`.

- [ ] **Step 2: Verify the backend copy now has the WASM strategy**

  ```bash
  grep -n "wasmReadyPromise" backend/static/hash-worker.js
  ```

  Expected: output shows the line containing `wasmReadyPromise`. If empty, the copy did not happen.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/static/hash-worker.js
  git commit -m "chore: sync updated hash-worker to backend/static"
  ```

---

## Task 9: Manual correctness verification

This verifies two things: (a) the WASM hash output is correct, and (b) Strategy 2 actually executed (not Strategy 1 or 3).

**Important:** On Chrome 130+, Strategy 1 (WebCrypto streaming) will win and Strategy 2 will never run. You must force Strategy 2 to execute — otherwise a broken WASM implementation silently passes through Strategy 1.

- [ ] **Step 1: Temporarily disable Strategy 1 in `hash-worker.js`**

  In `frontend/public/hash-worker.js`, in `self.onmessage`, replace:

  ```js
  hash = await hashWithStreamingWebCrypto(file); // Strategy 1
  ```

  with:

  ```js
  throw new Error('force-wasm-test'); // Strategy 1 disabled temporarily
  ```

  This forces the catch block to execute, which picks Strategy 2 (WASM) or Strategy 3 (JS fallback).

- [ ] **Step 2: Add a console log to confirm WASM path is running**

  At the top of `hashWithWasm`, temporarily add:

  ```js
  async function hashWithWasm(file) {
    console.log('[hash-worker] Strategy 2: WASM running'); // TEMP
    const hasher = new wasm_bindgen.WasmHasher();
  ```

- [ ] **Step 3: Start the dev server**

  ```bash
  cd frontend
  npm run dev
  ```

- [ ] **Step 4: Produce a known-hash test file**

  ```bash
  dd if=/dev/urandom of=/tmp/test-hash-file.bin bs=1M count=10
  sha256sum /tmp/test-hash-file.bin
  ```

  Note the hex hash — this is the expected value.

- [ ] **Step 5: Open DevTools and drop the test file**

  Open browser DevTools → Console. Navigate to the TeleVault upload UI and drop `test-hash-file.bin`.

  You must see:

  ```text
  [hash-worker] Strategy 2: WASM running
  ```

  If this log is absent and the upload succeeds anyway, Strategy 3 (JS) ran instead — WASM init failed. Check the console for errors about `sha256.js` or `sha256_bg.wasm`.

- [ ] **Step 6: Verify the hash is correct**

  Intercept the worker output by pasting in DevTools console before dropping the file:

  ```js
  const w = new Worker('/hash-worker.js');
  w.onmessage = e => { if (e.data.type === 'done') console.log('HASH:', e.data.hash); };
  ```

  Drop the file. The `HASH:` output must exactly match `sha256sum` from Step 4.

- [ ] **Step 7: Restore Strategy 1 and remove temp logs**

  Revert `throw new Error('force-wasm-test')` back to `hash = await hashWithStreamingWebCrypto(file)`. Remove the `console.log` from `hashWithWasm`.

  Verify with `git diff frontend/public/hash-worker.js` — only the intended WASM additions from Task 7 should remain.

- [ ] **Step 8: Re-run `build:wasm` to sync final hash-worker.js**

  ```bash
  cd frontend && npm run build:wasm
  ```

---

## Task 10: Update root `Dockerfile`

**Files:**

- Modify: `Dockerfile` (repo root)

The root `Dockerfile` builds the frontend in Stage 1 (`frontend-build`) and the backend in Stage 2, combining in Stage 3. Insert Stage 0 (`wasm-builder`) before Stage 1, update Stage 1 to inject artifacts.

- [ ] **Step 1: Read the current root `Dockerfile`**

  Confirm current Stage 1 starts with:

  ```dockerfile
  # ─── Stage 1: Build frontend ─────────────────────────────────────────────────
  FROM node:22-alpine AS frontend-build
  ...
  RUN npm run build
  ```

- [ ] **Step 2: Insert Stage 0 before Stage 1**

  Add before the `# ─── Stage 1` comment:

  ```dockerfile
  # ─── Stage 0: Build WASM ─────────────────────────────────────────────────────
  FROM rust:1-slim AS wasm-builder
  RUN cargo install wasm-pack
  WORKDIR /build/wasm-sha256
  COPY frontend/wasm-sha256/ .
  RUN RUSTFLAGS="-C target-feature=+simd128" \
      wasm-pack build --target no-modules --release --out-dir /wasm-out

  ```

- [ ] **Step 3: Update Stage 1 to inject WASM artifacts and use `build:frontend`**

  In Stage 1, after `COPY frontend/ .` and before the `ARG` lines, add:

  ```dockerfile
  COPY --from=wasm-builder /wasm-out ./public/wasm/
  ```

  Change the final build command from `RUN npm run build` to `RUN npm run build:frontend`.

- [ ] **Step 4: Verify the full updated Stage 0 + Stage 1 looks like this**

  ```dockerfile
  # ─── Stage 0: Build WASM ─────────────────────────────────────────────────────
  FROM rust:1-slim AS wasm-builder
  RUN cargo install wasm-pack
  WORKDIR /build/wasm-sha256
  COPY frontend/wasm-sha256/ .
  RUN RUSTFLAGS="-C target-feature=+simd128" \
      wasm-pack build --target no-modules --release --out-dir /wasm-out

  # ─── Stage 1: Build frontend ─────────────────────────────────────────────────
  FROM node:22-alpine AS frontend-build

  WORKDIR /app

  # Install dependencies
  COPY frontend/package*.json ./
  RUN npm install

  # Copy source and inject WASM artifacts from wasm-builder
  COPY frontend/ .
  COPY --from=wasm-builder /wasm-out ./public/wasm/

  # Pass build arguments (optional, defaults are used if not provided)
  ARG VITE_API_BASE_URL
  ARG VITE_THEME=default
  ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
  ENV VITE_THEME=$VITE_THEME

  RUN npm run build:frontend
  ```

  Stages 2 and 3 are unchanged.

- [ ] **Step 5: Commit**

  ```bash
  git add Dockerfile
  git commit -m "feat: add wasm-builder Docker stage to root Dockerfile"
  ```

---

## Task 11: Update `frontend/Dockerfile`

**Files:**

- Modify: `frontend/Dockerfile`

The `frontend/Dockerfile` builds the standalone frontend image. The build context here is `frontend/` (not the repo root), so `COPY` paths are relative to `frontend/`.

- [ ] **Step 1: Read the current `frontend/Dockerfile`**

  Confirm it looks like:

  ```dockerfile
  # Stage 1: Build
  FROM node:22-alpine AS build
  WORKDIR /app
  COPY package*.json ./
  RUN npm install
  COPY . .
  ARG VITE_API_BASE_URL
  ARG VITE_THEME=default
  ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
  ENV VITE_THEME=$VITE_THEME
  RUN npm run build

  # Stage 2: Serve
  FROM nginx:stable-alpine
  ...
  ```

- [ ] **Step 2: Replace the entire file**

  ```dockerfile
  # Stage 0: Build WASM
  FROM rust:1-slim AS wasm-builder
  RUN cargo install wasm-pack
  WORKDIR /build/wasm-sha256
  COPY wasm-sha256/ .
  RUN RUSTFLAGS="-C target-feature=+simd128" \
      wasm-pack build --target no-modules --release --out-dir /wasm-out

  # Stage 1: Build
  FROM node:22-alpine AS build

  WORKDIR /app

  # Install dependencies
  COPY package*.json ./
  RUN npm install

  # Copy source and inject WASM artifacts from wasm-builder
  COPY . .
  COPY --from=wasm-builder /wasm-out ./public/wasm/

  # Pass build arguments (optional, defaults are used if not provided)
  ARG VITE_API_BASE_URL
  ARG VITE_THEME=default
  ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
  ENV VITE_THEME=$VITE_THEME

  RUN npm run build:frontend

  # Stage 2: Serve
  FROM nginx:stable-alpine

  # Limit worker_processes to 1
  RUN sed -i 's/worker_processes.*/worker_processes 1;/g' /etc/nginx/nginx.conf

  # Copy build output to Nginx's serve directory
  COPY --from=build /app/dist /usr/share/nginx/html

  # Copy custom Nginx configuration
  COPY nginx.conf /etc/nginx/conf.d/default.conf

  EXPOSE 80

  CMD ["nginx", "-g", "daemon off;"]
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/Dockerfile
  git commit -m "feat: add wasm-builder Docker stage to frontend/Dockerfile"
  ```

---

## Task 12: Final build verification

- [ ] **Step 1: Run a full local build**

  ```bash
  cd frontend
  npm run build
  ```

  Expected:

  - `build:wasm` runs wasm-pack (fast — incremental cached)
  - `build:frontend` runs TypeScript + Vite
  - No errors

- [ ] **Step 2: Verify `frontend/dist/` contains the WASM files**

  ```bash
  ls frontend/dist/wasm/
  ```

  Expected: `sha256.js` and `sha256_bg.wasm` present (Vite copies everything from `public/` into `dist/`).

- [ ] **Step 3: Run a Docker build of the root image locally (if Docker is available)**

  ```bash
  docker build -t televault-test . --progress=plain 2>&1 | tail -30
  ```

  Expected: build completes without errors. The `wasm-builder` stage output should appear before the `frontend-build` stage.

- [ ] **Step 4: Review commit history**

  ```bash
  git log --oneline -10
  ```

  Confirm all tasks landed as separate, clean commits.

---

## Quick-Reference: Key Constraints

| Constraint | Why |
| --- | --- |
| `--target no-modules` (not `--target web`) | Classic workers use `importScripts`, not ES module imports |
| `wasm-bindgen = "=0.2.95"` (pinned exact) | `--target no-modules` is deprecated in newer 0.2.x |
| `name = "sha256"` in Cargo.toml | wasm-pack derives output filenames from crate name; "sha256" → sha256.js / sha256_bg.wasm |
| `wasmReadyPromise` async IIFE (not top-level await) | Classic workers have no top-level await support |
| `build:frontend` in Dockerfiles (not `build`) | Docker injects WASM from wasm-builder stage; running build:wasm inside Node image would fail |
| Strategy 2 errors propagate (not retried as Strategy 3) | A WASM compute failure is not a browser-compat issue |
