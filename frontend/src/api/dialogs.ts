import { apiClient } from "./client";

export const dialogKeys = {
  all: ["dialogs"] as const,
  byAccount: (accountId: string) => [...dialogKeys.all, accountId] as const,
};

export async function listDialogs(telegramAccountId: string, admin = false, page = 1, pageSize = 50) {
  const { data, error } = await apiClient.GET("/api/v1/dialogs/{account_id}", {
    params: {
      path: {
        account_id: telegramAccountId,
      },
      query: {
        admin,
        page,
        page_size: pageSize,
      },
    },
  });
  if (error) throw error;
  return data;
}
