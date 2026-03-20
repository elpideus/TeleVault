import { useEffect } from "react";
import { formatBytes } from "../../../lib/formatBytes";
import { useStorageStats, storageKeys } from "../../../api/storage";
import { useUploadStore } from "../../../store/uploadStore";
import { queryClient } from "../../../app/providers";

export function StorageIndicator() {
  const { data: stats } = useStorageStats();

  // Listen for upload completion to refresh stats immediately
  useEffect(() => {
    let lastCompletedIds = new Set<string>();
    const unsub = useUploadStore.subscribe((state) => {
      const currentCompletedIds = new Set(
        Array.from(state.uploads.values())
          .filter(u => u.status === "complete")
          .map(u => u.operationId)
      );
      
      // Trigger refresh only if a new upload just finished
      const hasNewCompletion = Array.from(currentCompletedIds).some(id => !lastCompletedIds.has(id));
      if (hasNewCompletion) {
        queryClient.invalidateQueries({ queryKey: storageKeys.stats() });
      }
      lastCompletedIds = currentCompletedIds;
    });
    return unsub;
  }, []);

  const usedSize = stats?.total_size ?? 0;
  const usedFormatted = formatBytes(usedSize);

  return (
    <div
      style={{
        padding: "16px 12px",
        borderTop: "1px solid var(--tv-border-subtle)",
        marginTop: "auto",
      }}
    >
      <div
        style={{
          height: "26px",
          borderRadius: "13px",
          overflow: "hidden",
          display: "flex",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          position: "relative",
          width: "100%",
          alignItems: "stretch",
        }}
        title={`${stats?.file_count ?? 0} files total`}
      >
        {/* Used section - darker/solid look */}
        <div
          style={{
            flex: "1 1 auto",
            minWidth: "48%",
            background: "rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            padding: "0 18px 0 12px",
            clipPath: "polygon(0 0, 100% 0, 82% 100%, 0 100%)",
            fontSize: "11px",
            fontWeight: 700,
            color: "#fff",
            zIndex: 2,
            whiteSpace: "nowrap",
            textShadow: "0 1px 2px rgba(0,0,0,0.5)",
          }}
        >
          {usedFormatted}
        </div>

        {/* Available section - subtle infinite sign */}
        <div
          style={{
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingRight: "8px",
            marginLeft: "-12px", // Overlap to create sharp slash
            fontSize: "16px",
            fontWeight: 400,
            color: "rgba(255, 255, 255, 0.4)",
            lineHeight: 1,
          }}
        >
          ∞
        </div>
      </div>
    </div>
  );
}
