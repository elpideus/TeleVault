/**
 * Data carried by every drag source. Built at drag-start time by the
 * FileGrid / FileList components which have the full item lists.
 *
 * fileIds     — IDs of file items to move (may be empty)
 * folderSlugs — slugs of folder items to move (may be empty)
 * itemCount   — total items being dragged (for overlay label)
 * label       — display label: item name (single) or "N items" (multi)
 */
export interface DragPayload {
  fileIds: string[];
  folderSlugs: string[];
  itemCount: number;
  label: string;
  mimeType?: string;
}
