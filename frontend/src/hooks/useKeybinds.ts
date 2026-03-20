// Global keybind system.
// Registered once at AppShell level. Reads bindings from keybindStore and
// dispatches actions to the appropriate store or handler.

import { useEffect, useCallback } from "react";
import { useKeybindStore } from "../store/keybindStore";
import type { ActionId } from "../lib/keybinds";

// ── Combo parser ──────────────────────────────────────────────────────────────

interface ParsedCombo {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

function parseCombo(combo: string): ParsedCombo {
  const parts = combo.split("+");
  const key = parts[parts.length - 1] ?? "";
  return {
    key: key.toLowerCase(),
    ctrl: parts.includes("Ctrl"),
    alt: parts.includes("Alt"),
    shift: parts.includes("Shift"),
    meta: parts.includes("Meta"),
  };
}

function matchesCombo(e: KeyboardEvent, combo: ParsedCombo): boolean {
  return (
    e.key.toLowerCase() === combo.key &&
    e.ctrlKey === combo.ctrl &&
    e.altKey === combo.alt &&
    e.shiftKey === combo.shift &&
    e.metaKey === combo.meta
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface KeybindHandlers {
  onRename?: () => void;
  onDelete?: () => void;
  onNewFolder?: () => void;
  onUpload?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onSelectAll?: () => void;
  onOpenProperties?: () => void;
  onToggleSidebar?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenSearch?: () => void;
  onViewGrid?: () => void;
  onViewList?: () => void;
  onViewDetails?: () => void;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
}

type HandlerMap = {
  [K in ActionId]?: () => void;
};

function handlersToMap(h: KeybindHandlers): HandlerMap {
  return {
    rename: h.onRename,
    delete: h.onDelete,
    newFolder: h.onNewFolder,
    upload: h.onUpload,
    copy: h.onCopy,
    paste: h.onPaste,
    selectAll: h.onSelectAll,
    openProperties: h.onOpenProperties,
    toggleSidebar: h.onToggleSidebar,
    openCommandPalette: h.onOpenCommandPalette,
    openSearch: h.onOpenSearch,
    viewGrid: h.onViewGrid,
    viewList: h.onViewList,
    viewDetails: h.onViewDetails,
    navigateBack: h.onNavigateBack,
    navigateForward: h.onNavigateForward,
  };
}

/**
 * Registers global keyboard listeners for all TeleVault actions.
 * Call once at AppShell level and pass handler callbacks.
 * Skips events when the active element is an input/textarea/contenteditable.
 */
export function useKeybinds(handlers: KeybindHandlers): void {
  const bindings = useKeybindStore((s) => s.bindings);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        target.isContentEditable
      ) {
        return;
      }

      const handlerMap = handlersToMap(handlers);
      const entries = Object.entries(bindings) as [ActionId, string][];

      for (const [actionId, combo] of entries) {
        const parsed = parseCombo(combo);
        if (matchesCombo(e, parsed)) {
          const handler = handlerMap[actionId];
          if (handler) {
            e.preventDefault();
            handler();
            return;
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bindings, handlers],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
