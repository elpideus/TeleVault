import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

export const storageKeys = {
  all: ["storage"] as const,
  stats: () => [...storageKeys.all, "stats"] as const,
};

export function useStorageStats() {
  return useQuery({
    queryKey: storageKeys.stats(),
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/v1/files/stats", {});
      if (error) throw error;
      return data;
    },
    // Refetch on window focus or after 5 mins (or keep it relatively fresh)
    staleTime: 1000 * 60 * 5,
  });
}
