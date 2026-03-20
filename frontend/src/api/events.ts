import { apiClient } from "./client";

export const eventKeys = {
  all: ["events"] as const,
  list: (page?: number) => [...eventKeys.all, "list", page] as const,
};

export async function listEvents(page = 1, pageSize = 50) {
  const { data, error } = await apiClient.GET("/api/v1/events/", {
    params: { query: { page, page_size: pageSize } },
  });
  if (error) throw error;
  return data;
}

export function createActivitySource(token: string): EventSource {
  return new EventSource(
    `${import.meta.env.VITE_API_BASE_URL}/api/v1/events/stream?token=${encodeURIComponent(token)}`,
  );
}
