import type React from "react";

/**
 * Programmatically triggers a contextmenu event on a given element.
 * Useful for opening Radix ContextMenus from a regular button click.
 */
export const triggerContextMenu = (
  e: React.MouseEvent,
  triggerRef: React.RefObject<HTMLElement | null>,
) => {
  if (!triggerRef.current) return;

  e.stopPropagation();
  e.preventDefault();

  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 2,
    buttons: 0,
    clientX: e.clientX,
    clientY: e.clientY,
  });

  triggerRef.current.dispatchEvent(event);
};
