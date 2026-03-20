import { motion } from "framer-motion";
import { FileIcon } from "./FileIcon";
import { cn } from "../../../lib/cn";

interface DragPreviewProps {
  label: string;
  itemCount: number;
  folderSlugs: string[];
  fileIds: string[];
  mimeType?: string;
}

export function DragPreview({ label, itemCount, folderSlugs, mimeType }: DragPreviewProps) {
  const isMulti = itemCount > 1;
  const isFolder = !isMulti && folderSlugs.length > 0;
  
  return (
    <div className="relative group">
      {/* Stacked cards effect for multi-selection */}
      {isMulti && (
        <>
          <div 
            className="absolute inset-0 translate-x-2 translate-y-2 scale-[0.98] opacity-20 bg-[var(--tv-bg-glass)] backdrop-blur-[var(--tv-glass-blur)] border border-[var(--tv-accent-border)] rounded-[var(--tv-radius-lg)]" 
            style={{ zIndex: -2 }}
          />
          <div 
            className="absolute inset-0 translate-x-1 translate-y-1 scale-[0.99] opacity-40 bg-[var(--tv-bg-glass)] backdrop-blur-[var(--tv-glass-blur)] border border-[var(--tv-accent-border)] rounded-[var(--tv-radius-lg)]" 
            style={{ zIndex: -1 }}
          />
        </>
      )}

      <motion.div
        initial={{ scale: 0.95, opacity: 0, rotate: -1 }}
        animate={{ scale: 1.02, opacity: 1, rotate: 0 }}
        className={cn(
          "flex items-center gap-2.5 p-2 rounded-[var(--tv-radius-md)] min-w-[120px] max-w-[220px]",
          "bg-[var(--tv-bg-glass)] backdrop-blur-[var(--tv-glass-blur)]",
          "border border-[var(--tv-accent-border)] shadow-[var(--tv-shadow-lg)]",
          "pointer-events-none select-none"
        )}
      >
        <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-[var(--tv-radius-sm)] bg-[var(--tv-accent-container)] shadow-inner">
          {isFolder ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--tv-accent-primary)]">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          ) : (
             <FileIcon mimeType={mimeType ?? "application/octet-stream"} size={18} />
          )}
        </div>

        <div className="flex flex-col min-w-0 pr-1 overflow-hidden">
          <span className="truncate text-[var(--tv-text-primary)] font-[var(--tv-type-label)]">
            {isMulti ? `${itemCount} items` : label}
          </span>
          {!isMulti && (
            <span className="text-[var(--tv-text-secondary)] text-[var(--tv-font-size-xs)] font-medium opacity-80 truncate">
              {folderSlugs.length > 0 ? "Folder" : "File"}
            </span>
          )}
        </div>
      </motion.div>
    </div>
  );
}
