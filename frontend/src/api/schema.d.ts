/**
 * Hand-written OpenAPI-compatible schema types derived from the backend source.
 * Replace with generated types once backend is running:
 *   npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts
 */

// ── Shared types ────────────────────────────────────────────────────────────

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface PhoneLoginIn {
  phone: string;
}

export interface OTPSubmitIn {
  phone: string;
  code: string;
  password?: string | null;
}

export interface RefreshIn {
  refresh_token: string;
}

export interface TokenOut {
  access_token: string;
  refresh_token: string;
  token_type: string;
  vault_hash: string;
}

export interface UserOut {
  telegram_id: number;
  telegram_username: string | null;
  telegram_first_name: string | null;
  role: string;
  vault_hash: string;
}

export interface TelegramAccountOut {
  id: string;
  telegram_id: number;
  label: string | null;
  is_active: boolean;
}

export interface PhoneLoginOut {
  message: string;
  code_type: string;
}

// ── Folders ───────────────────────────────────────────────────────────────────

export interface FolderOut {
  id: string;
  created_by: number;
  parent_id: string | null;
  name: string;
  slug: string;
  depth: number;
  icon_image: string | null;
  icon_color: string | null;
  default_channel_id: string | null;
  created_at: string;
  updated_at: string;
  file_count?: number;
  subfolder_count?: number;
  total_size?: number;
}

export interface FolderIn {
  parent_slug?: string | null;
  name: string;
  icon_color?: string | null;
  default_channel_id?: string | null;
}

export interface FolderUpdate {
  name?: string | null;
  icon_color?: string | null;
  icon_image?: string | null;
  default_channel_id?: string | null;
}

export interface FolderFetchBody {
  slugs: string[];
}

export interface BulkDeleteFolderBody {
  slugs: string[];
}

export interface BulkMoveFolderBody {
  slugs: string[];
  target_parent_slug?: string | null;
}

export interface BulkCopyFolderBody {
  slugs: string[];
  target_parent_slug?: string | null;
}

// ── Files ─────────────────────────────────────────────────────────────────────

export type FileStatus = "pending" | "complete" | "failed";

export interface FileOut {
  id: string;
  uploaded_by: number;
  folder_id: string | null;
  original_name: string;
  name: string | null;
  mime_type: string | null;
  total_size: number;
  file_hash: string;
  split_count: number;
  status: FileStatus;
  created_at: string;
}

export interface FileUploadOut {
  operation_id: string;
  file_id: string;
  original_name: string;
  total_size: number;
  split_count: number;
  folder_id: string | null;
}

export interface FileUpdate {
  name?: string | null;
}

export interface FileFetchBody {
  ids: string[];
}

export interface BulkDeleteFileBody {
  ids: string[];
}

export interface BulkMoveFileBody {
  ids: string[];
  target_folder_slug?: string | null;
}

export interface BulkCopyFileBody {
  ids: string[];
  target_folder_slug?: string | null;
}

export interface FileStatsOut {
  total_size: number;
  file_count: number;
}

// ── Bulk results ──────────────────────────────────────────────────────────────

export interface BulkItemFailure {
  id: string;
  error: string;
}

export interface BulkFileResult {
  succeeded: FileOut[];
  failed: BulkItemFailure[];
}

export interface BulkDeleteFileResult {
  succeeded: string[];
  failed: BulkItemFailure[];
}

export interface BulkFolderResult {
  succeeded: FolderOut[];
  failed: BulkItemFailure[];
}

export interface BulkDeleteFolderResult {
  succeeded: string[];
  failed: BulkItemFailure[];
}

// ── Channels ──────────────────────────────────────────────────────────────────

export interface ChannelOut {
  id: string;
  added_by: number;
  telegram_account_id: string;
  channel_id: number;
  channel_username: string | null;
  label: string | null;
  is_global_default: boolean;
  created_at: string;
}

export interface ChannelIn {
  telegram_account_id: string;
  channel_id: number;
  channel_username?: string | null;
  label?: string | null;
}

export interface ChannelCreateIn {
  telegram_account_id: string;
  title: string;
  about?: string | null;
}

export interface ChannelUpdate {
  channel_username?: string | null;
  label?: string | null;
}

// ── Dialogs ───────────────────────────────────────────────────────────────────

export interface DialogOut {
  id: number;
  title: string;
  type: string;
  username: string | null;
  member_count: number | null;
}

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchResultItem {
  type: string;
  id: string;
  name: string;
  slug: string | null;
  folder_id: string | null;
  folder_slug: string | null;
  created_at: string;
  extra: Record<string, unknown>;
}

export interface SearchOut {
  items: SearchResultItem[];
  total: number;
  query: string;
  page: number;
  page_size: number;
}

// ── Events ────────────────────────────────────────────────────────────────────

export interface EventOut {
  id: string;
  actor_telegram_id: number;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface EventListOut {
  items: EventOut[];
  total: number;
  page: number;
  page_size: number;
}

// ── Progress ──────────────────────────────────────────────────────────────────

export interface ProgressOut {
  operation_id: string;
  pct: number;
  bytes_done: number;
  bytes_total: number;
  status: string;
  message: string | null;
  error: string | null;
}

// ── openapi-fetch paths (subset — extend as needed) ──────────────────────────

export interface paths {
  "/api/v1/auth/phone": {
    post: {
      requestBody: { content: { "application/json": PhoneLoginIn } };
      responses: { 200: { content: { "application/json": PhoneLoginOut } } };
    };
  };
  "/api/v1/auth/otp": {
    post: {
      requestBody: { content: { "application/json": OTPSubmitIn } };
      responses: { 200: { content: { "application/json": TokenOut } } };
    };
  };
  "/api/v1/auth/refresh": {
    post: {
      requestBody: { content: { "application/json": RefreshIn } };
      responses: { 200: { content: { "application/json": TokenOut } } };
    };
  };
  "/api/v1/auth/logout": {
    post: {
      requestBody: { content: { "application/json": RefreshIn } };
      responses: { 204: { content: never } };
    };
  };
  "/api/v1/auth/me": {
    get: {
      responses: { 200: { content: { "application/json": UserOut } } };
    };
  };
  "/api/v1/auth/accounts": {
    get: {
      responses: { 200: { content: { "application/json": TelegramAccountOut[] } } };
    };
  };
  "/api/v1/folders/": {
    get: {
      parameters: { query?: { page?: number; page_size?: number } };
      responses: { 200: { content: { "application/json": Paginated<FolderOut> } } };
    };
    post: {
      requestBody: { content: { "application/json": FolderIn } };
      responses: { 201: { content: { "application/json": FolderOut } } };
    };
    delete: {
      requestBody: { content: { "application/json": BulkDeleteFolderBody } };
      responses: { 200: { content: { "application/json": BulkDeleteFolderResult } } };
    };
  };
  "/api/v1/folders/fetch": {
    post: {
      requestBody: { content: { "application/json": FolderFetchBody } };
      responses: { 200: { content: { "application/json": FolderOut[] } } };
    };
  };
  "/api/v1/folders/move": {
    post: {
      requestBody: { content: { "application/json": BulkMoveFolderBody } };
      responses: { 200: { content: { "application/json": BulkFolderResult } } };
    };
  };
  "/api/v1/folders/copy": {
    post: {
      requestBody: { content: { "application/json": BulkCopyFolderBody } };
      responses: { 200: { content: { "application/json": BulkFolderResult } } };
    };
  };
  "/api/v1/folders/children": {
    get: {
      parameters: { query?: { page?: number; page_size?: number } };
      responses: { 200: { content: { "application/json": Paginated<FolderOut> } } };
    };
  };
  "/api/v1/folders/{slug}/children": {
    get: {
      parameters: {
        path: { slug: string };
        query?: { page?: number; page_size?: number };
      };
      responses: { 200: { content: { "application/json": Paginated<FolderOut> } } };
    };
  };
  "/api/v1/folders/{slug}": {
    patch: {
      parameters: { path: { slug: string } };
      requestBody: { content: { "application/json": FolderUpdate } };
      responses: { 200: { content: { "application/json": FolderOut } } };
    };
  };
  "/api/v1/files/": {
    get: {
      parameters: {
        query?: { folder_slug?: string; page?: number; page_size?: number };
      };
      responses: { 200: { content: { "application/json": Paginated<FileOut> } } };
    };
    delete: {
      requestBody: { content: { "application/json": BulkDeleteFileBody } };
      responses: { 200: { content: { "application/json": BulkDeleteFileResult } } };
    };
  };
  "/api/v1/files/fetch": {
    post: {
      requestBody: { content: { "application/json": FileFetchBody } };
      responses: { 200: { content: { "application/json": FileOut[] } } };
    };
  };
  "/api/v1/files/move": {
    post: {
      requestBody: { content: { "application/json": BulkMoveFileBody } };
      responses: { 200: { content: { "application/json": BulkFileResult } } };
    };
  };
  "/api/v1/files/copy": {
    post: {
      requestBody: { content: { "application/json": BulkCopyFileBody } };
      responses: { 200: { content: { "application/json": BulkFileResult } } };
    };
  };
  "/api/v1/files/stats": {
    get: {
      responses: { 200: { content: { "application/json": FileStatsOut } } };
    };
  };
  "/api/v1/files/{file_id}": {
    patch: {
      parameters: { path: { file_id: string } };
      requestBody: { content: { "application/json": FileUpdate } };
      responses: { 200: { content: { "application/json": FileOut } } };
    };
  };
  "/api/v1/channels/": {
    get: {
      responses: { 200: { content: { "application/json": Paginated<ChannelOut> } } };
    };
    post: {
      requestBody: { content: { "application/json": ChannelIn } };
      responses: { 201: { content: { "application/json": ChannelOut } } };
    };
  };
  "/api/v1/channels/telegram": {
    post: {
      requestBody: { content: { "application/json": ChannelCreateIn } };
      responses: { 201: { content: { "application/json": ChannelOut } } };
    };
  };
  "/api/v1/channels/{channel_id}/default": {
    post: {
      parameters: { path: { channel_id: string } };
      responses: { 200: { content: { "application/json": ChannelOut } } };
    };
    delete: {
      parameters: { path: { channel_id: string } };
      responses: { 200: { content: { "application/json": ChannelOut } } };
    };
  };
  "/api/v1/search/": {
    get: {
      parameters: {
        query: { q: string; page?: number; page_size?: number };
      };
      responses: { 200: { content: { "application/json": SearchOut } } };
    };
  };
  "/api/v1/events/": {
    get: {
      parameters: { query?: { page?: number; page_size?: number } };
      responses: { 200: { content: { "application/json": EventListOut } } };
    };
  };
  "/api/v1/dialogs/{account_id}": {
    get: {
      parameters: {
        path: { account_id: string };
        query?: { admin?: boolean; page?: number; page_size?: number };
      };
      responses: { 200: { content: { "application/json": Paginated<DialogOut> } } };
    };
  };
}
