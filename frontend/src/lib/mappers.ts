import type { FileOut, FolderOut } from "../api/schema";
import type { FileItem, FolderItem } from "../types/files";

export function mapFileOut(f: FileOut): FileItem {
  return {
    id: f.id,
    original_name: f.original_name,
    name: f.name || null,
    size: f.total_size,
    mime_type: f.mime_type ?? "application/octet-stream",
    // "pending" collapses to "processing" — FileItem has no pending state
    status:
      f.status === "complete"
        ? "ready"
        : f.status === "failed"
          ? "error"
          : "processing",
    created_at: f.created_at,
    sha256: f.file_hash,
    split_count: f.split_count,
    folder_id: f.folder_id ?? undefined,
  };
}

const API_ORIGIN = import.meta.env.VITE_API_BASE_URL
  ? new URL(import.meta.env.VITE_API_BASE_URL).origin
  : "";

function resolveApiUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_ORIGIN}${path}`;
}

export function mapFolderOut(f: FolderOut): FolderItem {
  return {
    id: f.id,
    name: f.name,
    slug: f.slug,
    icon_color: f.icon_color ?? undefined,
    icon_image: resolveApiUrl(f.icon_image),
    depth: f.depth,
    created_at: f.created_at,
    file_count: f.file_count,
    subfolder_count: f.subfolder_count,
    total_size: f.total_size,
  };
}
