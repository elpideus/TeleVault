/**
 * SSE-based progress stream for file uploads.
 * Returns an EventSource that emits ProgressOut events.
 */
export function createProgressSource(
  operationId: string,
  token: string,
): EventSource {
  return new EventSource(
    `${import.meta.env.VITE_API_BASE_URL}/api/v1/progress/${operationId}?token=${encodeURIComponent(token)}`,
  );
}
