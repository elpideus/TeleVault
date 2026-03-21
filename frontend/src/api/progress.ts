/**
 * SSE-based progress stream for file uploads.
 * Returns an EventSource that emits ProgressOut events.
 */
export function createProgressSource(
  operationId: string,
  token: string,
): EventSource {
  const path = operationId ? `/api/v1/progress/${operationId}` : `/api/v1/progress/`;
  return new EventSource(
    `${import.meta.env.VITE_API_BASE_URL}${path}?token=${encodeURIComponent(token)}`,
  );
}

