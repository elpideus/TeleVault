import { cn } from "../../../lib/cn";

// ── Shared shimmer keyframe — injected once via CSS ───────────────────────────
// We define this in tokens.css (or inline here for portability).
// The shimmer moves left→right using background-position animation.

const shimmerClass = [
  "animate-[shimmer_1.5s_ease-in-out_infinite]",
  "bg-gradient-to-r",
  "from-[var(--tv-bg-elevated)]",
  "via-[var(--tv-bg-subtle)]",
  "to-[var(--tv-bg-elevated)]",
  "bg-[length:200%_100%]",
].join(" ");

// We inject the shimmer keyframes into the document once.
function ensureShimmerKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById("tv-shimmer-kf")) return;
  const style = document.createElement("style");
  style.id = "tv-shimmer-kf";
  style.textContent = `
    @keyframes shimmer {
      0%   { background-position: 200% center; }
      100% { background-position: -200% center; }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .animate-skeleton-fade {
      animation: fadeIn 0.4s ease-out forwards;
    }
  `;
  document.head.appendChild(style);
}
ensureShimmerKeyframes();

// ── FolderSkeleton ────────────────────────────────────────────────────────────

export function FolderSkeleton() {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-3 rounded-[var(--tv-radius-md)]",
        "border border-[var(--tv-border-subtle)]",
        "bg-[var(--tv-bg-elevated)]",
        "animate-skeleton-fade",
      )}
      aria-hidden="true"
    >
      {/* Icon placeholder */}
      <div className="flex items-center justify-center h-12">
        <div
          className={cn("w-8 h-8 rounded-[var(--tv-radius-sm)]", shimmerClass)}
        />
      </div>
      {/* Name line */}
      <div className={cn("h-3 rounded-[var(--tv-radius-xs)] w-3/4 mx-auto", shimmerClass)} />
      {/* Sub-label line */}
      <div className={cn("h-2.5 rounded-[var(--tv-radius-xs)] w-1/2 mx-auto", shimmerClass)} />
    </div>
  );
}

// ── FileSkeleton ──────────────────────────────────────────────────────────────

export function FileSkeleton() {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-3 rounded-[var(--tv-radius-md)]",
        "border border-[var(--tv-border-subtle)]",
        "bg-[var(--tv-bg-elevated)]",
        "animate-skeleton-fade",
      )}
      aria-hidden="true"
    >
      {/* Icon placeholder */}
      <div className="flex items-center justify-center h-12">
        <div
          className={cn("w-8 h-8 rounded-[var(--tv-radius-sm)]", shimmerClass)}
        />
      </div>
      {/* Name line */}
      <div className={cn("h-3 rounded-[var(--tv-radius-xs)] w-5/6 mx-auto", shimmerClass)} />
      {/* Meta row */}
      <div className="flex justify-between items-center gap-2">
        <div className={cn("h-2.5 rounded-[var(--tv-radius-xs)] w-1/3", shimmerClass)} />
        <div className={cn("h-2.5 rounded-[var(--tv-radius-xs)] w-1/4", shimmerClass)} />
      </div>
    </div>
  );
}

// ── Row skeletons (list / details views) ─────────────────────────────────────

export function RowSkeleton({ columns = 3 }: { columns?: number }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 h-10",
        "border-b border-[var(--tv-border-subtle)]",
        "animate-skeleton-fade",
      )}
      aria-hidden="true"
    >
      {/* Icon */}
      <div className={cn("w-5 h-5 rounded-[var(--tv-radius-xs)] flex-shrink-0", shimmerClass)} />
      {/* Name */}
      <div className={cn("h-3 rounded-[var(--tv-radius-xs)] flex-1", shimmerClass)} />
      {/* Extra columns */}
      {Array.from({ length: columns - 1 }).map((_, i) => (
        <div
          key={i}
          className={cn("h-3 rounded-[var(--tv-radius-xs)]", shimmerClass)}
          style={{ width: `${60 + i * 20}px`, flexShrink: 0 }}
        />
      ))}
    </div>
  );
}
