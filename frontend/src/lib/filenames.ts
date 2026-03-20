/**
 * Splits a filename into its base name and extension.
 * Example: "document.pdf" -> { base: "document", ext: ".pdf" }
 * Example: "archive.tar.gz" -> { base: "archive.tar", ext: ".gz" }
 * Example: "noextension" -> { base: "noextension", ext: "" }
 */
export function splitFilename(name: string): { base: string; ext: string } {
  if (!name) return { base: "", ext: "" };
  
  const lastDotIndex = name.lastIndexOf(".");
  
  // If no dot or dot is at the start (e.g. .gitignore), return whole name as base
  if (lastDotIndex <= 0) {
    return { base: name, ext: "" };
  }
  
  return {
    base: name.substring(0, lastDotIndex),
    ext: name.substring(lastDotIndex),
  };
}
