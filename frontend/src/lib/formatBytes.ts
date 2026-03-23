// Utility to format a byte count into a human-readable string.
// e.g. 1234567 → "1.2 MB"

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  
  // No decimals for bytes
  if (i === 0) return `${Math.floor(value)} B`;
  
  return `${value.toFixed(decimals)} ${sizes[i]}`;
}
