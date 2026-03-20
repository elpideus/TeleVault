/**
 * Maps a MIME type and filename to a user-friendly label.
 */
export function getFileTypeLabel(
  mimeType: string | null | undefined,
  filename?: string | null,
): string {
  // Normalize
  const type = mimeType?.toLowerCase() || "";
  const name = filename?.toLowerCase() || "";
  const ext = name.split(".").pop() || "";

  // 1. Check MIME first if it's specific
  if (type.startsWith("image/")) {
    if (type.includes("jpeg")) return "JPEG Image";
    if (type.includes("png")) return "PNG Image";
    if (type.includes("gif")) return "GIF Image";
    if (type.includes("webp")) return "WebP Image";
    if (type.includes("svg")) return "SVG Graphics";
    return "Image File";
  }

  if (type.startsWith("video/")) {
    if (type.includes("mp4")) return "MP4 Video";
    if (type.includes("quicktime")) return "QuickTime Video";
    if (type.includes("x-matroska")) return "MKV Video";
    if (type.includes("webm")) return "WebM Video";
    return "Video File";
  }

  if (type.startsWith("audio/")) {
    if (type.includes("mpeg")) return "MP3 Audio";
    if (type.includes("wav")) return "WAV Audio";
    return "Audio File";
  }

  // 2. Check Extension as backup/primary for some types
  if (ext === "pdf" || type === "application/pdf") return "PDF Document";
  if (["doc", "docx"].includes(ext) || type.includes("wordprocessingml")) return "Word Document";
  if (["xls", "xlsx"].includes(ext) || type.includes("spreadsheetml")) return "Excel Spreadsheet";
  if (["ppt", "pptx"].includes(ext) || type.includes("presentationml")) return "PowerPoint Presentation";
  if (ext === "txt" || type === "text/plain") return "Plain Text File";
  if (ext === "md" || type === "text/markdown") return "Markdown File";
  if (ext === "html" || type === "text/html") return "HTML Document";
  if (ext === "zip" || type.includes("zip")) return "ZIP Archive";
  if (ext === "rar" || type.includes("x-rar")) return "RAR Archive";
  if (["7z", "tar", "gz"].includes(ext)) return "Compressed Archive";
  
  if (["jpg", "jpeg"].includes(ext)) return "JPEG Image";
  if (ext === "png") return "PNG Image";
  if (ext === "mp4") return "MP4 Video";
  if (ext === "mp3") return "MP3 Audio";

  if (!mimeType || type === "application/octet-stream") {
    if (ext) return `${ext.toUpperCase()} File`;
    return "File";
  }

  return "File";
}
