// hash-worker.js
// Computes SHA-256 off the main thread to prevent browser freeze/crash on large files.
// Strategy:
//   1. Try crypto.subtle.digest() with a ReadableStream (Chrome 130+, native C++ speed).
//   2. Fall back to an incremental pure-JS SHA-256 that processes the file in 64 MB
//      chunks so memory usage stays constant regardless of file size.
// Progress messages ({ type: 'progress', value: 0..1 }) are posted during fallback.
// Final result: { type: 'done', hash: '<hex string>' }
// On error:     { type: 'error', message: '<string>' }

const CHUNK = 64 * 1024 * 1024; // 64 MB

// ── Strategy 2 init: WASM SHA-256 ────────────────────────────────────────────
// Kicked off immediately at worker start. onmessage awaits this before hashing.
// Classic workers don't support top-level await — async IIFE stores the Promise.
const wasmReadyPromise = (async () => {
  importScripts('/wasm/sha256.js');           // injects wasm_bindgen global
  await wasm_bindgen('/wasm/sha256_bg.wasm'); // instantiates the WASM module
  return true;
})().catch(() => false); // any failure (404, no SIMD128 support) → false → Strategy 3

// ── Strategy 1: native streaming Web Crypto ──────────────────────────────────
// crypto.subtle.digest() accepts a ReadableStream in Chrome 130+.
// We wrap the file's stream in a TransformStream to count bytes for progress.
async function hashWithStreamingWebCrypto(file) {
  let consumed = 0;
  const total = file.size;

  const progress = new TransformStream({
    transform(chunk, controller) {
      consumed += chunk.byteLength;
      self.postMessage({ type: 'progress', value: consumed / total });
      controller.enqueue(chunk);
    },
  });

  const trackedStream = file.stream().pipeThrough(progress);
  const buffer = await crypto.subtle.digest('SHA-256', trackedStream);
  return bufToHex(buffer);
}

// ── Strategy 2: incremental pure-JS SHA-256 (fallback) ───────────────────────
function createSHA256() {
  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]);
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const W = new Uint32Array(64);
  const buf = new Uint8Array(64);
  let bufLen = 0, totalLen = 0;
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  function processBlock(src, off) {
    for (let i = 0; i < 16; i++)
      W[i] = (src[off+i*4]<<24)|(src[off+i*4+1]<<16)|(src[off+i*4+2]<<8)|src[off+i*4+3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i-15],7)^rotr(W[i-15],18)^(W[i-15]>>>3);
      const s1 = rotr(W[i-2],17)^rotr(W[i-2],19)^(W[i-2]>>>10);
      W[i] = (W[i-16]+s0+W[i-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e,6)^rotr(e,11)^rotr(e,25);
      const ch = (e&f)^(~e&g);
      const t1 = (h+S1+ch+K[i]+W[i])>>>0;
      const S0 = rotr(a,2)^rotr(a,13)^rotr(a,22);
      const maj = (a&b)^(a&c)^(b&c);
      const t2 = (S0+maj)>>>0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }

  return {
    update(data) {
      totalLen += data.length;
      let off = 0;
      if (bufLen > 0) {
        const take = Math.min(64 - bufLen, data.length);
        buf.set(data.subarray(0, take), bufLen);
        bufLen += take; off = take;
        if (bufLen === 64) { processBlock(buf, 0); bufLen = 0; }
      }
      while (off + 64 <= data.length) { processBlock(data, off); off += 64; }
      if (off < data.length) { buf.set(data.subarray(off)); bufLen = data.length - off; }
    },
    digest() {
      buf[bufLen++] = 0x80;
      if (bufLen > 56) { buf.fill(0, bufLen, 64); processBlock(buf, 0); bufLen = 0; }
      buf.fill(0, bufLen, 56);
      const bitLen = totalLen * 8;
      const hi = Math.floor(bitLen / 0x100000000);
      const lo = bitLen % 0x100000000;
      buf[56]=(hi>>>24)&0xff; buf[57]=(hi>>>16)&0xff; buf[58]=(hi>>>8)&0xff; buf[59]=hi&0xff;
      buf[60]=(lo>>>24)&0xff; buf[61]=(lo>>>16)&0xff; buf[62]=(lo>>>8)&0xff; buf[63]=lo&0xff;
      processBlock(buf, 0);
      const out = new Uint8Array(32);
      for (let i = 0; i < 8; i++) {
        out[i*4]=(H[i]>>>24)&0xff; out[i*4+1]=(H[i]>>>16)&0xff;
        out[i*4+2]=(H[i]>>>8)&0xff; out[i*4+3]=H[i]&0xff;
      }
      return bufToHex(out.buffer);
    },
  };
}

async function hashIncremental(file) {
  const hasher = createSHA256();
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK, file.size);
    hasher.update(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
    offset = end;
    self.postMessage({ type: 'progress', value: offset / file.size });
  }
  return hasher.digest();
}

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

// ── Helpers ──────────────────────────────────────────────────────────────────
function bufToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

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
