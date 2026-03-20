import { splitFilename } from "./filenames";

/**
 * Maps common file extensions to human-readable descriptions.
 */
const extensionMap: Record<string, string> = {
  // Images
  ".jpg": "JPEG Image",
  ".jpeg": "JPEG Image",
  ".png": "PNG Image",
  ".gif": "GIF Image",
  ".webp": "WebP Image",
  ".svg": "SVG Image",
  ".bmp": "Bitmap Image",
  ".ico": "Icon File",

  // Video
  ".mp4": "MP4 Video",
  ".mkv": "Matroska Video",
  ".mov": "QuickTime Video",
  ".avi": "AVI Video",
  ".webm": "WebM Video",

  // Audio
  ".mp3": "MP3 Audio",
  ".wav": "WAV Audio",
  ".ogg": "OGG Audio",
  ".flac": "FLAC Audio",
  ".m4a": "M4A Audio",

  // Documents
  ".pdf": "PDF Document",
  ".doc": "Word Document",
  ".docx": "Word Document",
  ".xls": "Excel Spreadsheet",
  ".xlsx": "Excel Spreadsheet",
  ".ppt": "PowerPoint Presentation",
  ".pptx": "PowerPoint Presentation",
  ".txt": "Text Document",
  ".md": "Markdown Document",
  ".rtf": "Rich Text Format",

  // Archives
  ".zip": "ZIP Archive",
  ".rar": "RAR Archive",
  ".7z": "7-Zip Archive",
  ".tar": "Tarball Archive",
  ".gz": "Gnu Zipped Archive",

  // Code
  ".js": "JavaScript File",
  ".ts": "TypeScript File",
  ".tsx": "React TypeScript File",
  ".jsx": "React JavaScript File",
  ".html": "HTML Document",
  ".css": "CSS Stylesheet",
  ".json": "JSON File",
  ".py": "Python Script",
  ".go": "Go Source File",
  ".rs": "Rust Source File",
  ".cpp": "C++ Source File",
  ".c": "C Source File",
} as const;

/**
 * Maps common MIME types to human-readable descriptions if the extension map fails.
 */
const mimeMap: Record<string, string> = {
  "application/pdf": "PDF Document",
  "text/plain": "Text Document",
  "text/html": "HTML Document",
  "image/jpeg": "JPEG Image",
  "image/png": "PNG Image",
  "image/gif": "GIF Image",
  "image/svg+xml": "SVG Image",
  "audio/mpeg": "MP3 Audio",
  "video/mp4": "MP4 Video",
  "application/zip": "ZIP Archive",
  "application/json": "JSON File",
} as const;

/**
 * Returns a human-readable display string for a file type based on its name and MIME type.
 * @param filename The name of the file (e.g., "test.jpg")
 * @param mimeType The MIME type string (e.g., "image/jpeg")
 */
export function getFileTypeDisplay(filename: string, mimeType: string): string {
  const { ext } = splitFilename(filename);
  const normalizedExt = ext.toLowerCase();

  // 1. Try extension map first as it's often more specific
  if (normalizedExt && extensionMap[normalizedExt]) {
    return extensionMap[normalizedExt]!;
  }

  // 2. Try MIME map if extension failed or is unknown
  if (mimeMap[mimeType]) {
    return mimeMap[mimeType]!;
  }

  // 3. Fallback to simplified MIME type (e.g., "image/jpeg" -> "IMAGE File")
  if (mimeType && mimeType !== "application/octet-stream") {
    const [mainType] = mimeType.split("/");
    if (mainType && mainType !== "application") {
      return `${mainType.toUpperCase()} File`;
    }
    return mimeType;
  }

  // 4. Ultimate fallback for "application/octet-stream" or unknown
  if (normalizedExt) {
    return `${normalizedExt.slice(1).toUpperCase()} File`;
  }

  return "Unknown File";
}
