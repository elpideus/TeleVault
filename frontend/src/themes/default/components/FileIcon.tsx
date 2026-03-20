import {
  Document20Regular,
  Image20Regular,
  Video20Regular,
  MusicNote120Regular,
  FolderZip20Regular,
  Code20Regular,
  Table20Regular,
  SlideAdd20Regular,
  DocumentText20Regular,
  Cube20Regular,
} from "@fluentui/react-icons";

// ── MIME → icon + color mapping ───────────────────────────────────────────────

interface IconDef {
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  color: string; // CSS var
}

function resolveIconDef(mimeType: string): IconDef {
  // Images
  if (mimeType.startsWith("image/"))
    return { icon: Image20Regular, color: "var(--tv-warning)" };

  // Videos
  if (mimeType.startsWith("video/"))
    return { icon: Video20Regular, color: "var(--tv-error)" };

  // Audio
  if (mimeType.startsWith("audio/"))
    return { icon: MusicNote120Regular, color: "var(--tv-success)" };

  // Archives & compressed
  if (
    mimeType === "application/zip" ||
    mimeType === "application/gzip" ||
    mimeType === "application/x-tar" ||
    mimeType === "application/x-7z-compressed" ||
    mimeType === "application/x-rar-compressed"
  )
    return { icon: FolderZip20Regular, color: "var(--tv-warning)" };

  // PDF
  if (mimeType === "application/pdf")
    return { icon: Document20Regular, color: "var(--tv-error)" };

  // Spreadsheets
  if (
    mimeType.includes("spreadsheet") ||
    mimeType === "text/csv" ||
    mimeType === "application/vnd.ms-excel"
  )
    return { icon: Table20Regular, color: "var(--tv-success)" };

  // Presentations
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return { icon: SlideAdd20Regular, color: "var(--tv-warning)" };

  // Word / rich text
  if (mimeType.includes("word") || mimeType === "application/rtf")
    return { icon: DocumentText20Regular, color: "var(--tv-accent-primary)" };

  // Markdown / plain text
  if (mimeType === "text/plain" || mimeType === "text/markdown")
    return { icon: DocumentText20Regular, color: "var(--tv-text-secondary)" };

  // Code / JSON / XML
  if (
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType.startsWith("text/")
  )
    return { icon: Code20Regular, color: "var(--tv-info)" };

  // 3D / binary / unknown
  return { icon: Cube20Regular, color: "var(--tv-text-disabled)" };
}

// ── FileIcon ──────────────────────────────────────────────────────────────────

export interface FileIconProps {
  mimeType: string;
  /** Size in px — applied to both width and height. Defaults to 20. */
  size?: number;
  className?: string;
}

export function FileIcon({ mimeType, size = 20, className }: FileIconProps) {
  const { icon: Icon, color } = resolveIconDef(mimeType);
  return (
    <span
      className={className}
      style={{ display: "inline-flex", flexShrink: 0 }}
    >
      <Icon style={{ width: size, height: size, color, flexShrink: 0 }} />
    </span>
  );
}
