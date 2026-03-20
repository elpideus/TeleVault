import { useQuery } from "@tanstack/react-query";
import { listChannels, channelKeys } from "../api/channels";

export function useChannels() {
  const { data, isLoading, isError } = useQuery({
    queryKey: channelKeys.list(),
    queryFn: listChannels,
  });
  return {
    channels: data?.items ?? [],
    hasChannels: (data?.items?.length ?? 0) > 0,
    isLoading,
    isError,
  };
}
