import { useNavigate } from "react-router-dom";
import { ChevronRight16Regular, MoreHorizontal16Regular } from "@fluentui/react-icons";
import { cn } from "../../../lib/cn";
import { useState, useLayoutEffect, useRef, useMemo } from "react";

export interface BreadcrumbSegment {
  label: string;
  icon?: React.ReactNode;
  /** undefined for the last (non-clickable) segment */
  href?: string;
}

export interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  className?: string;
}

export function Breadcrumb({ segments, className }: BreadcrumbProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLElement>(null);
  const [maxItems, setMaxItems] = useState(20);

  // Responsive logic: update maxItems based on container width
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width } = entry.contentRect;
      // Each segment + chevron is roughly 60-100px. 
      // We'll use a dynamic estimate: 70px per item to be very generous with space.
      const estimatedMax = Math.max(2, Math.floor(width / 70));
      setMaxItems(estimatedMax);
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Calculate visible segments with end-priority truncation
  const visibleItems = useMemo(() => {
    const formattedSegments = segments.map((s, i) => ({
      label: s.label,
      icon: s.icon,
      href: s.href,
      originalIndex: i
    }));

    if (formattedSegments.length <= maxItems || formattedSegments.length <= 2) {
      return formattedSegments;
    }

    // Always keep the first item
    const firstItem = formattedSegments[0];

    // Handle very small maxItems
    if (maxItems <= 2) {
      return [firstItem, formattedSegments[formattedSegments.length - 1]];
    }

    // The ellipsis takes one slot
    // We have maxItems - 2 slots left for the end of the path
    const endCount = maxItems - 2;
    const lastItems = formattedSegments.slice(-endCount);

    return [
      firstItem,
      { isEllipsis: true as const },
      ...lastItems
    ];
  }, [segments, maxItems]);

  return (
    <nav
      ref={containerRef}
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-0.5 min-w-0 overflow-hidden flex-1 w-full", className)}
    >
      {visibleItems.map((item, i) => {
        if (!item) return null;
        const isLast = i === visibleItems.length - 1;

        return (
          <div key={i} className="flex items-center gap-0.5 min-w-0 flex-none">
            {i > 0 && (
              <ChevronRight16Regular
                style={{
                  width: 12,
                  height: 12,
                  flexShrink: 0,
                  color: "var(--tv-text-disabled)",
                }}
              />
            )}
            
            {'isEllipsis' in item ? (
              <div className="flex h-6 w-8 items-center justify-center rounded-[var(--tv-radius-xs)] text-[var(--tv-text-disabled)]">
                <MoreHorizontal16Regular />
              </div>
            ) : (
              <>
                {isLast ? (
                  <span
                    aria-current="page"
                    className="truncate px-1"
                    style={{
                      font: "var(--tv-type-body-sm)",
                      color: "var(--tv-text-primary)",
                      maxWidth: 160,
                    }}
                  >
                    {item.icon ? (
                      <span className="flex items-center justify-center">
                        {item.icon}
                      </span>
                    ) : (
                      item.label
                    )}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => item.href && navigate(item.href)}
                    className={cn(
                      "relative truncate rounded-[var(--tv-radius-xs)] px-1",
                      "overflow-hidden cursor-pointer border-0 bg-transparent",
                      "after:absolute after:inset-0 after:rounded-[inherit]",
                      "after:content-[''] after:pointer-events-none",
                      "after:transition-[background-color] after:duration-[120ms]",
                      "hover:after:bg-[rgba(255,255,255,0.06)]",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1",
                      "focus-visible:outline-[var(--tv-accent-primary)]",
                    )}
                    style={{
                      font: "var(--tv-type-body-sm)",
                      color: "var(--tv-text-secondary)",
                      maxWidth: 160,
                    }}
                  >
                    {item.icon ? (
                      <span className="flex items-center justify-center">
                        {item.icon}
                      </span>
                    ) : (
                      item.label
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </nav>
  );
}
