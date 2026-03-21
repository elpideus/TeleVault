/**
 * Creates an N-slot semaphore for limiting concurrent async operations.
 *
 * Correct handoff invariant: when release() finds a waiting acquirer, it does
 * NOT decrement `running` — it hands the slot directly. `running` stays the
 * same: one consumer finishes, one starts. This prevents over-subscription
 * between the microtask that resolves the waiter and the waiter resuming.
 */
export function createSemaphore(n: number) {
  let running = 0;
  const waiters: Array<() => void> = [];

  return {
    async acquire(): Promise<void> {
      if (running < n) {
        running++;
        return;
      }
      // running is NOT incremented here — release() keeps the count stable
      // by not decrementing when it hands off to this waiter.
      await new Promise<void>((resolve) => waiters.push(resolve));
    },

    release(): void {
      const next = waiters.shift();
      if (next) {
        // Hand slot directly to the next waiter; running stays the same.
        next();
      } else {
        running--;
      }
    },
  };
}
