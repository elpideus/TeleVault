// Mock data for the /preview component showcase page.
// These constants are only used by PreviewPage — not by the real application.

import type { FileItem, FolderItem } from "../types/files";
import type { EventOut, SearchResultItem } from "../api/schema";

// ── Folder node (preview-only type) ──────────────────────────────────────────

export interface FolderNode {
  id: string;
  name: string;
  slug: string;
  iconColor?: string;
  children?: FolderNode[];
}

// ── Folders ───────────────────────────────────────────────────────────────────

export const MOCK_FOLDERS: FolderItem[] = [
  {
    id: "f1",
    name: "Documents",
    slug: "documents",
    icon_color: "var(--tv-accent-primary)",
    depth: 0,
    created_at: "2024-01-15T10:30:00Z",
    file_count: 24,
    subfolder_count: 3,
  },
  {
    id: "f2",
    name: "Photos",
    slug: "photos",
    icon_color: "var(--tv-warning)",
    depth: 0,
    created_at: "2024-02-20T14:00:00Z",
    file_count: 182,
    subfolder_count: 5,
  },
  {
    id: "f3",
    name: "Videos",
    slug: "videos",
    icon_color: "var(--tv-error)",
    depth: 0,
    created_at: "2024-03-01T09:00:00Z",
    file_count: 12,
    subfolder_count: 0,
  },
  {
    id: "f4",
    name: "Archives",
    slug: "archives",
    depth: 0,
    created_at: "2023-11-10T16:45:00Z",
    file_count: 7,
    subfolder_count: 1,
  },
  {
    id: "f5",
    name: "Music",
    slug: "music",
    icon_color: "var(--tv-success)",
    depth: 0,
    created_at: "2024-04-05T11:20:00Z",
    file_count: 64,
    subfolder_count: 2,
  },
];

// ── Files ─────────────────────────────────────────────────────────────────────

export const MOCK_FILES: FileItem[] = [
  {
    id: "i1",
    original_name: "Project Proposal Q2 2024.pdf",
    size: 2_457_600,
    mime_type: "application/pdf",
    status: "ready",
    created_at: "2024-04-10T08:00:00Z",
    sha256: "a3b4c5d6e7f8",
    split_count: 1,
  },
  {
    id: "i2",
    original_name: "Design System v3.fig",
    size: 18_874_368,
    mime_type: "application/octet-stream",
    status: "ready",
    created_at: "2024-04-09T15:30:00Z",
    sha256: "b4c5d6e7f8a9",
    split_count: 1,
  },
  {
    id: "i3",
    original_name: "sprint-recording-2024-04-08.mp4",
    size: 524_288_000,
    mime_type: "video/mp4",
    status: "ready",
    created_at: "2024-04-08T18:00:00Z",
    sha256: "c5d6e7f8a9b0",
    split_count: 4,
  },
  {
    id: "i4",
    original_name: "team-photo.jpg",
    size: 4_194_304,
    mime_type: "image/jpeg",
    status: "ready",
    created_at: "2024-04-07T12:00:00Z",
    sha256: "d6e7f8a9b0c1",
    split_count: 1,
  },
  {
    id: "i5",
    original_name: "database-backup-2024-04.zip",
    size: 1_073_741_824,
    mime_type: "application/zip",
    status: "ready",
    created_at: "2024-04-06T03:00:00Z",
    sha256: "e7f8a9b0c1d2",
    split_count: 8,
  },
  {
    id: "i6",
    original_name: "notes.md",
    size: 8_192,
    mime_type: "text/markdown",
    status: "ready",
    created_at: "2024-04-05T09:15:00Z",
    sha256: "f8a9b0c1d2e3",
    split_count: 1,
  },
  {
    id: "i7",
    original_name: "app-icon.png",
    size: 131_072,
    mime_type: "image/png",
    status: "ready",
    created_at: "2024-04-04T11:00:00Z",
    sha256: "a9b0c1d2e3f4",
    split_count: 1,
  },
  {
    id: "i8",
    original_name: "processing-large-file.tar.gz",
    size: 3_221_225_472,
    mime_type: "application/gzip",
    status: "processing",
    created_at: "2024-04-10T10:00:00Z",
    split_count: 0,
  },
  {
    id: "i9",
    original_name: "invoice-march-2024.xlsx",
    size: 49_152,
    mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    status: "ready",
    created_at: "2024-03-31T17:00:00Z",
    sha256: "b0c1d2e3f4a5",
    split_count: 1,
  },
  {
    id: "i10",
    original_name: "corrupted-upload.bin",
    size: 65_536,
    mime_type: "application/octet-stream",
    status: "error",
    created_at: "2024-04-03T08:00:00Z",
  },
  {
    id: "i11",
    original_name: "podcast-episode-42.mp3",
    size: 68_157_440,
    mime_type: "audio/mpeg",
    status: "ready",
    created_at: "2024-04-02T20:00:00Z",
    sha256: "c1d2e3f4a5b6",
    split_count: 1,
  },
  {
    id: "i12",
    original_name: "presentation-final.pptx",
    size: 8_388_608,
    mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    status: "ready",
    created_at: "2024-04-01T14:00:00Z",
    sha256: "d2e3f4a5b6c7",
    split_count: 1,
  },
];

// ── Folder tree ───────────────────────────────────────────────────────────────

export const MOCK_FOLDER_TREE: FolderNode[] = [
  {
    id: "1",
    name: "Documents",
    slug: "documents",
    iconColor: "var(--tv-accent-primary)",
    children: [
      { id: "1-1", name: "Work", slug: "documents/work", iconColor: "var(--tv-info)" },
      { id: "1-2", name: "Personal", slug: "documents/personal" },
    ],
  },
  {
    id: "2",
    name: "Photos",
    slug: "photos",
    iconColor: "var(--tv-warning)",
    children: [
      { id: "2-1", name: "2024", slug: "photos/2024" },
      { id: "2-2", name: "Vacation", slug: "photos/vacation", iconColor: "var(--tv-success)" },
    ],
  },
  {
    id: "3",
    name: "Videos",
    slug: "videos",
    iconColor: "var(--tv-error)",
  },
  {
    id: "4",
    name: "Archives",
    slug: "archives",
    children: [
      { id: "4-1", name: "Old Projects", slug: "archives/old-projects" },
    ],
  },
];

// ── Activity ──────────────────────────────────────────────────────────────────

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}
const MIN = 60_000;
const HR = 3_600_000;
const DAY = 86_400_000;

export const MOCK_ACTIVITY: EventOut[] = [
  { id: "1", actor_telegram_id: 123456789, action: "file_uploaded", target_type: "file", target_id: "f1", target_name: null, metadata: { name: "vacation-2025.mp4" }, created_at: ago(2 * MIN) },
  { id: "2", actor_telegram_id: 123456789, action: "folder_created", target_type: "folder", target_id: "d1", target_name: null, metadata: { name: "Projects" }, created_at: ago(15 * MIN) },
  { id: "3", actor_telegram_id: 123456789, action: "file_renamed", target_type: "file", target_id: "f2", target_name: null, metadata: { name: "report_final.pdf" }, created_at: ago(1 * HR) },
  { id: "4", actor_telegram_id: 123456789, action: "file_moved", target_type: "file", target_id: "f3", target_name: null, metadata: { name: "invoice_march.pdf" }, created_at: ago(3 * HR) },
  { id: "5", actor_telegram_id: 123456789, action: "file_downloaded", target_type: "file", target_id: "f4", target_name: null, metadata: { name: "architecture.png" }, created_at: ago(6 * HR) },
  { id: "6", actor_telegram_id: 123456789, action: "file_uploaded", target_type: "file", target_id: "f5", target_name: null, metadata: { name: "backup-2025-03-17.zip" }, created_at: ago(DAY + 2 * HR) },
  { id: "7", actor_telegram_id: 123456789, action: "folder_renamed", target_type: "folder", target_id: "d2", target_name: null, metadata: { name: "Archive" }, created_at: ago(DAY + 5 * HR) },
  { id: "8", actor_telegram_id: 123456789, action: "file_deleted", target_type: "file", target_id: "f6", target_name: null, metadata: { name: "temp-notes.txt" }, created_at: ago(2 * DAY) },
  { id: "9", actor_telegram_id: 123456789, action: "folder_deleted", target_type: "folder", target_id: "d3", target_name: null, metadata: { name: "Old Drafts" }, created_at: ago(3 * DAY) },
  { id: "10", actor_telegram_id: 123456789, action: "file_uploaded", target_type: "file", target_id: "f7", target_name: null, metadata: { name: "meeting-notes.docx" }, created_at: ago(5 * DAY) },
];

// ── Search results ────────────────────────────────────────────────────────────

export const MOCK_SEARCH_RESULTS: SearchResultItem[] = [
  { type: "file", id: "f1", name: "Design System v2.figma", slug: null, folder_id: "d1", folder_slug: "design", created_at: "2025-11-01T10:00:00Z", extra: {} },
  { type: "file", id: "f2", name: "Q4 Report 2025.pdf", slug: null, folder_id: "d2", folder_slug: "reports", created_at: "2025-12-01T08:30:00Z", extra: {} },
  { type: "file", id: "f3", name: "product-roadmap.xlsx", slug: null, folder_id: "d3", folder_slug: "strategy", created_at: "2025-10-15T14:00:00Z", extra: {} },
  { type: "folder", id: "d1", name: "Design Assets", slug: "design", folder_id: null, folder_slug: null, created_at: "2025-09-01T09:00:00Z", extra: {} },
  { type: "folder", id: "d2", name: "Reports", slug: "reports", folder_id: null, folder_slug: null, created_at: "2025-08-15T11:00:00Z", extra: {} },
];
