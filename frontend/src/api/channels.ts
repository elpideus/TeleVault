import { apiClient } from "./client";
import type { ChannelIn, ChannelUpdate, ChannelCreateIn } from "./schema";

export const channelKeys = {
  all: ["channels"] as const,
  list: () => [...channelKeys.all, "list"] as const,
  byId: (id: string) => [...channelKeys.all, id] as const,
};

export async function listChannels() {
  const { data, error } = await apiClient.GET("/api/v1/channels/");
  if (error) throw error;
  return data;
}

export async function createChannel(body: ChannelIn) {
  const { data, error } = await apiClient.POST("/api/v1/channels/", { body });
  if (error) throw error;
  return data;
}

export async function createTelegramChannel(body: ChannelCreateIn) {
  const { data, error } = await apiClient.POST("/api/v1/channels/telegram", { body });
  if (error) throw error;
  return data;
}

export async function setDefaultChannel(channelId: string) {
  const { data, error } = await apiClient.POST(
    "/api/v1/channels/{channel_id}/default",
    { params: { path: { channel_id: channelId } } },
  );
  if (error) throw error;
  return data;
}

export async function unsetDefaultChannel(channelId: string) {
  const { data, error } = await apiClient.DELETE(
    "/api/v1/channels/{channel_id}/default",
    { params: { path: { channel_id: channelId } } },
  );
  if (error) throw error;
  return data;
}

// Stub — channel update not yet exposed in schema but useful
export async function updateChannel(_channelId: string, _body: ChannelUpdate) {
  // TODO: wire once PATCH /channels/{id} is in schema
  throw new Error("Not implemented");
}
