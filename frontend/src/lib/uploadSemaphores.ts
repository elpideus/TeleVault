import { createSemaphore } from "./semaphore";

/**
 * Shared semaphores for limiting concurrent upload operations across the app.
 * 
 * Hashing is strictly sequential to avoid CPU/RAM thrashing.
 * TeleVault XHR concurrency is capped globally to avoid browser socket exhaustion.
 */
export const hashSem = createSemaphore(1);

// This will be initialized with the actual concurrency from the backend
let _tvSem: ReturnType<typeof createSemaphore> | null = null;

export function getTvSem(n: number = 1) {
  if (!_tvSem) {
    _tvSem = createSemaphore(n);
  }
  return _tvSem;
}
