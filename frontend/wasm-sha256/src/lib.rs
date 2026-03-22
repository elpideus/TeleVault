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
