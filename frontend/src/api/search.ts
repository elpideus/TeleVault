import { apiClient } from "./client";

export const searchKeys = {
  all: ["search"] as const,
  query: (q: string, page?: number) => [...searchKeys.all, q, page] as const,
};

export async function search(q: string, page = 1, pageSize = 20) {
  const { data, error } = await apiClient.GET("/api/v1/search/", {
    params: { query: { q, page, page_size: pageSize } },
  });
  if (error) throw error;
  return data;
}
