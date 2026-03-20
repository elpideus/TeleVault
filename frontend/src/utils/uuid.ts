/**
 * Generates a v4 UUID.
 * Falls back to a manual implementation when crypto.randomUUID is unavailable
 * (non-secure HTTP contexts) or frozen by SES/Lockdown (browser extensions).
 */
export function generateUUID(): string {
  try {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // crypto.randomUUID may throw in non-secure contexts
  }
  // Manual v4 UUID via getRandomValues (works in all contexts)
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const n = Number(c);
    const rand = crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;
    return (n ^ (rand & (15 >> (n / 4)))).toString(16);
  });
}
