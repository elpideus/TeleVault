// Shared domain types for files and folders.
// These mirror the backend API response shapes used in Phase 10 wiring.

export type FileStatus = "ready" | "processing" | "error";

export interface FileItem {
  id: string;
  original_name: string;
  name?: string | null;
  size: number; // bytes
  mime_type: string;
  status: FileStatus;
  created_at: string; // ISO 8601
  sha256?: string;
  split_count?: number;
  folder_id?: string;
}

export interface FolderItem {
  id: string;
  name: string;
  slug: string;
  icon_color?: string; // CSS var string, e.g. "var(--tv-accent-primary)"
  icon_image?: string; // URL
  depth: number;
  created_at: string; // ISO 8601
  file_count?: number;
  subfolder_count?: number;
  total_size?: number;
}

// Combined type used in browser views
export type BrowserItem =
  | ({ type: "folder" } & FolderItem)
  | ({ type: "file" } & FileItem);
