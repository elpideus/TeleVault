import { FolderTree } from "./FolderTree";
import { StorageIndicator } from "./StorageIndicator";
import type { FolderNode } from "./FolderTree";

export interface SidebarProps {
  nodes: FolderNode[];
}

export function Sidebar({ nodes }: SidebarProps) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--tv-bg-glass)",
        backdropFilter: "blur(var(--tv-glass-blur))",
        borderRight: "1px solid var(--tv-border-subtle)",
        overflow: "hidden",
      }}
    >
      {/* Zone 2 — Folder tree (fills remaining height) */}
      <FolderTree nodes={nodes} />

      {/* Zone 3 — Storage indicator (pinned to bottom) */}
      <StorageIndicator />
    </div>
  );
}
