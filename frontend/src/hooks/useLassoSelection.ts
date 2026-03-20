import { useRef, useState, useEffect } from "react";

export interface LassoResult {
  rectStyle: React.CSSProperties | null;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function useLassoSelection(
  containerRef: React.RefObject<HTMLElement>,
  onSelect: (ids: string[], additive: boolean) => void,
): LassoResult {
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const additive = useRef(false);
  const onSelectRef = useRef(onSelect);
  const containerRefRef = useRef(containerRef);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Keep refs current every render
  useEffect(() => { onSelectRef.current = onSelect; });
  useEffect(() => { containerRefRef.current = containerRef; });

  function computeHits(curX: number, curY: number): string[] {
    const container = containerRefRef.current.current;
    if (!dragStart.current || !container) return [];
    const { x, y } = dragStart.current;
    const lr = {
      left: Math.min(x, curX), top: Math.min(y, curY),
      right: Math.max(x, curX), bottom: Math.max(y, curY),
    };
    const ids: string[] = [];
    container.querySelectorAll<HTMLElement>("[data-item-id]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.left < lr.right && r.right > lr.left && r.top < lr.bottom && r.bottom > lr.top) {
        if (el.dataset.itemId) ids.push(el.dataset.itemId);
      }
    });
    return ids;
  }

  // Stable handler objects — created once, stored in refs, never recreated
  const handlers = useRef({
    move(e: MouseEvent) {
      if (!dragStart.current) return;
      const { x, y } = dragStart.current;
      setRect({ x: Math.min(x, e.clientX), y: Math.min(y, e.clientY), w: Math.abs(e.clientX - x), h: Math.abs(e.clientY - y) });
      onSelectRef.current(computeHits(e.clientX, e.clientY), additive.current);
    },
    up(e: MouseEvent) {
      document.removeEventListener("mousemove", handlers.current.move);
      document.removeEventListener("mouseup", handlers.current.up);
      if (!dragStart.current) return;
      
      const { x, y } = dragStart.current;
      const dx = Math.abs(e.clientX - x);
      const dy = Math.abs(e.clientY - y);
      
      const hits = computeHits(e.clientX, e.clientY);
      dragStart.current = null;
      setRect(null);
      
      if (dx < 5 && dy < 5) return;
      onSelectRef.current(hits, additive.current);
    },
  });

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-item-id]")) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    additive.current = e.ctrlKey || e.metaKey;
    setRect(null);
    document.addEventListener("mousemove", handlers.current.move);
    document.addEventListener("mouseup", handlers.current.up);
  }

  const rectStyle: React.CSSProperties | null = rect
    ? {
        position: "fixed",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        border: "1px solid var(--tv-accent-primary)",
        background: "color-mix(in srgb, var(--tv-accent-primary) 12%, transparent)",
        pointerEvents: "none",
        zIndex: 20,
      }
    : null;

  return { rectStyle, onMouseDown };
}
