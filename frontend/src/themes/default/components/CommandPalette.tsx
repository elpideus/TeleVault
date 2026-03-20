// Global command palette — triggered by Ctrl+K.
// Lists all ActionId actions with keybind display, filterable, executes on Enter.
// Animation: same as SearchOverlay (scale 0.97→1, opacity 0→1, y +6px→0).

import { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Rename20Regular,
  Delete20Regular,
  FolderAdd20Regular,
  ArrowUpload20Regular,
  Copy20Regular,
  ClipboardPaste20Regular,
  SelectAllOn20Regular,
  Info20Regular,
  PanelLeft20Regular,
  AppsListDetail20Regular,
  Search20Regular,
  Grid20Regular,
  TextBulletList20Regular,
  Table20Regular,
  ArrowLeft20Regular,
  ArrowRight20Regular,
  Document20Regular,
  Folder20Regular,
} from "@fluentui/react-icons";
import { useQuery } from "@tanstack/react-query";
import { cn } from "../../../lib/cn";
import { springGentle, exitTransition } from "../../../lib/springs";
import { useUIStore } from "../../../store/uiStore";
import { useKeybindStore } from "../../../store/keybindStore";
import { search, searchKeys } from "../../../api/search";
import { Kbd } from "./Kbd";
import type { ActionId } from "../../../lib/keybinds";
import type { SearchResultItem as SearchResultData } from "../../../api/schema";

// ── Action metadata ───────────────────────────────────────────────────────────

interface ActionMeta {
  id: ActionId;
  label: string;
  icon: React.ReactNode;
  /** Grouping label shown as a section header */
  group: string;
}

const ACTION_META: ActionMeta[] = [
  // File & folder operations
  { id: "rename", label: "Rename", icon: <Rename20Regular />, group: "File" },
  { id: "delete", label: "Delete", icon: <Delete20Regular />, group: "File" },
  { id: "newFolder", label: "New Folder", icon: <FolderAdd20Regular />, group: "File" },
  { id: "upload", label: "Upload Files", icon: <ArrowUpload20Regular />, group: "File" },
  { id: "copy", label: "Copy", icon: <Copy20Regular />, group: "File" },
  { id: "paste", label: "Paste", icon: <ClipboardPaste20Regular />, group: "File" },
  { id: "selectAll", label: "Select All", icon: <SelectAllOn20Regular />, group: "File" },
  { id: "openProperties", label: "Properties", icon: <Info20Regular />, group: "File" },
  // Navigation
  { id: "navigateBack", label: "Navigate Back", icon: <ArrowLeft20Regular />, group: "Navigation" },
  { id: "navigateForward", label: "Navigate Forward", icon: <ArrowRight20Regular />, group: "Navigation" },
  // View
  { id: "viewGrid", label: "Grid View", icon: <Grid20Regular />, group: "View" },
  { id: "viewList", label: "List View", icon: <TextBulletList20Regular />, group: "View" },
  { id: "viewDetails", label: "Details View", icon: <Table20Regular />, group: "View" },
  // Interface
  { id: "toggleSidebar", label: "Toggle Sidebar", icon: <PanelLeft20Regular />, group: "Interface" },
  { id: "openSearch", label: "Search", icon: <Search20Regular />, group: "Interface" },
  { id: "openCommandPalette", label: "Command Palette", icon: <AppsListDetail20Regular />, group: "Interface" },
];

// ── CommandItem ───────────────────────────────────────────────────────────────

export interface CommandItemProps {
  meta: ActionMeta;
  keybind: string;
  isActive: boolean;
  onSelect: (id: ActionId) => void;
}

export function CommandItem({ meta, keybind, isActive, onSelect }: CommandItemProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      onClick={() => onSelect(meta.id)}
      className={cn(
        "relative w-full flex items-center gap-3 px-3 py-2.5",
        "rounded-[var(--tv-radius-sm)] cursor-pointer text-left",
        "border-0 overflow-hidden",
        // State layer
        "after:absolute after:inset-0 after:rounded-[inherit]",
        "after:content-[''] after:pointer-events-none",
        "after:transition-[background-color] after:duration-[120ms]",
        isActive
          ? "after:bg-[rgba(255,255,255,0.08)]"
          : "hover:after:bg-[rgba(255,255,255,0.05)]",
      )}
      style={{
        background: isActive ? "var(--tv-accent-container)" : "transparent",
      }}
    >
      {/* Icon */}
      <span
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--tv-radius-xs)",
          background: "rgba(255,255,255,0.06)",
          color: isActive ? "var(--tv-accent-on-container)" : "var(--tv-text-secondary)",
        }}
        aria-hidden
      >
        <span style={{ display: "flex", width: 16, height: 16, alignItems: "center", justifyContent: "center" }}>
          {meta.icon}
        </span>
      </span>

      {/* Label */}
      <span
        className="flex-1 truncate"
        style={{
          font: "var(--tv-type-body)",
          color: isActive ? "var(--tv-accent-on-container)" : "var(--tv-text-primary)",
        }}
      >
        {meta.label}
      </span>

      {/* Keybind */}
      <Kbd>{keybind}</Kbd>
    </button>
  );
}

// ── SearchResultItem ───────────────────────────────────────────────────────────

export interface SearchResultItemProps {
  result: SearchResultData;
  isActive: boolean;
  onSelect: (result: SearchResultData) => void;
}

export function SearchResultItem({ result, isActive, onSelect }: SearchResultItemProps) {
  const isFolder = result.type === "folder";

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      onClick={() => onSelect(result)}
      className={cn(
        "relative w-full flex items-center gap-3 px-3 py-2.5",
        "rounded-[var(--tv-radius-sm)] cursor-pointer text-left",
        "border-0 overflow-hidden",
        "after:absolute after:inset-0 after:rounded-[inherit]",
        "after:content-[''] after:pointer-events-none",
        "after:transition-[background-color] after:duration-[120ms]",
        isActive
          ? "after:bg-[rgba(255,255,255,0.08)]"
          : "hover:after:bg-[rgba(255,255,255,0.05)]",
      )}
      style={{
        background: isActive ? "var(--tv-accent-container)" : "transparent",
      }}
    >
      <span
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--tv-radius-xs)",
          background: isFolder ? "rgba(59, 130, 246, 0.12)" : "rgba(255,255,255,0.06)",
          color: isFolder ? "var(--tv-accent-on-container)" : "var(--tv-text-secondary)",
        }}
        aria-hidden
      >
        {isFolder ? <Folder20Regular style={{ width: 16, height: 16 }} /> : <Document20Regular style={{ width: 16, height: 16 }} />}
      </span>

      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          className="truncate"
          style={{
            font: "var(--tv-type-body)",
            color: isActive ? "var(--tv-accent-on-container)" : "var(--tv-text-primary)",
          }}
        >
          {result.name}
        </span>
        <span
          className="truncate opacity-60"
          style={{
            font: "var(--tv-type-label-sm)",
            color: isActive ? "var(--tv-accent-on-container)" : "var(--tv-text-secondary)",
          }}
        >
          {isFolder ? "Folder" : "File"} • /{result.folder_slug || "Root"}
        </span>
      </span>
    </button>
  );
}

// ── CommandPalette ────────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  /** Override open state for preview/storybook. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Called when the user selects an action.
   * Wire this up at AppShell level to dispatch real actions.
   */
  onAction?: (id: ActionId) => void;
}

export function CommandPalette({ open: controlledOpen, onOpenChange, onAction }: CommandPaletteProps) {
  const shouldReduceMotion = useReducedMotion();

  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const bindings = useKeybindStore((s) => s.bindings);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? (controlledOpen ?? false) : commandPaletteOpen;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!isControlled) setCommandPaletteOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, setCommandPaletteOpen, onOpenChange],
  );

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 300ms debounce for search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setDebouncedQuery("");
      setActiveIndex(0);
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [isOpen]);

  // Auto-scroll to active item
  useEffect(() => {
    if (!isOpen || !scrollContainerRef.current) return;

    const activeElement = scrollContainerRef.current.querySelector('[aria-selected="true"]');
    if (activeElement) {
      activeElement.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [activeIndex, isOpen]);

  // Fetch file search results
  const { data: searchData, isFetching } = useQuery({
    queryKey: searchKeys.query(debouncedQuery),
    queryFn: () => search(debouncedQuery, 1, 10),
    enabled: debouncedQuery.length >= 2,
    placeholderData: (prev) => prev,
  });

  // Combined results logic
  const filteredActions = query.trim()
    ? ACTION_META.filter(
        (a) =>
          a.label.toLowerCase().includes(query.toLowerCase()) ||
          a.group.toLowerCase().includes(query.toLowerCase()),
      )
    : ACTION_META;

  const searchResults = searchData?.items ?? [];
  const searchFiles = searchResults.filter((r) => r.type === "file");
  const searchFolders = searchResults.filter((r) => r.type === "folder");

  // Flat list for combined navigation
  const combinedResultsCount = query.trim()
    ? filteredActions.length + searchFiles.length + searchFolders.length
    : filteredActions.length;

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, combinedResultsCount - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex < filteredActions.length) {
          const selected = filteredActions[activeIndex];
          if (selected) handleExecute(selected.id);
        } else {
          const fileIndex = activeIndex - filteredActions.length;
          const searchItems = [...searchFiles, ...searchFolders];
          const selected = searchItems[fileIndex];
          if (selected) handleSelectFile(selected);
        }
      }
    },
    [combinedResultsCount, filteredActions, searchFiles, searchFolders, activeIndex],
  );

  const handleExecute = useCallback(
    (id: ActionId) => {
      handleOpenChange(false);
      setTimeout(() => {
        onAction?.(id);
      }, 50);
    },
    [handleOpenChange, onAction],
  );

  const handleSelectFile = useCallback(
    (_result: SearchResultData) => {
      // Phase 10 will wire real navigation. Mirroring SearchOverlay for now.
      handleOpenChange(false);
    },
    [handleOpenChange],
  );

  // Reset active index when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Group items for sectioned display
  const groups = filteredActions.reduce<Map<string, { meta: ActionMeta; globalIndex: number }[]>>(
    (acc, meta, i) => {
      const group = acc.get(meta.group) ?? [];
      group.push({ meta, globalIndex: i });
      acc.set(meta.group, group);
      return acc;
    },
    new Map(),
  );

  // Animation variants — same as SearchOverlay
  const panelVariants = {
    hidden: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.97, y: 6 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: shouldReduceMotion
      ? { opacity: 0, transition: exitTransition }
      : { opacity: 0, y: 4, transition: exitTransition },
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal forceMount>
        {/* Backdrop */}
        <AnimatePresence>
          {isOpen && (
            <Dialog.Overlay forceMount asChild>
              <motion.div
                key="cmd-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.14, ease: "easeIn" } }}
                transition={
                  shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }
                }
                className="fixed inset-0 z-50"
                style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
              />
            </Dialog.Overlay>
          )}
        </AnimatePresence>

        {/* Panel */}
        <AnimatePresence>
          {isOpen && (
            <Dialog.Content
              forceMount
              asChild
              onKeyDown={(e) => handleKeyDown(e as unknown as React.KeyboardEvent)}
            >
              <motion.div
                key="cmd-panel"
                variants={panelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={shouldReduceMotion ? { duration: 0 } : springGentle}
                className={cn(
                  "fixed z-50",
                  "left-1/2 -translate-x-1/2",
                  "w-[calc(100vw-48px)]",
                  "rounded-[var(--tv-radius-xl)]",
                  "border border-[var(--tv-border-strong)]",
                  "shadow-[var(--tv-shadow-lg)]",
                  "overflow-hidden outline-none",
                )}
                style={{
                  top: "clamp(60px, 15vh, 160px)",
                  maxWidth: 560,
                  background: "var(--tv-bg-overlay)",
                  backdropFilter: "blur(var(--tv-glass-blur))",
                }}
              >
                <Dialog.Title className="sr-only">Command Palette</Dialog.Title>

                {/* Filter input */}
                <div
                  className="flex items-center gap-3 px-4 py-3 transition-[box-shadow] duration-[120ms] focus-within:ring-1 focus-within:ring-inset focus-within:ring-[var(--tv-accent-ring)]"
                  style={{ borderBottom: "1px solid var(--tv-border-subtle)" }}
                >
                  <AppsListDetail20Regular
                    style={{ width: 20, height: 20, color: "var(--tv-text-secondary)", flexShrink: 0 }}
                    aria-hidden
                  />
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Type a command…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex-1 bg-transparent border-0 outline-none"
                    style={{ font: "var(--tv-type-body)", color: "var(--tv-text-primary)" }}
                    aria-label="Filter commands"
                  />
                  <Kbd>Esc</Kbd>
                </div>

                {/* Command list */}
                <div
                  ref={scrollContainerRef}
                   role="listbox"
                  aria-label="Search"
                  style={{ maxHeight: 400, overflowY: "auto", padding: "4px" }}
                >
                  {combinedResultsCount === 0 && !isFetching ? (
                    <div className="flex items-center justify-center py-10" role="status">
                      <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-disabled)" }}>
                        No results for "{query}"
                      </span>
                    </div>
                  ) : query.trim() ? (
                    <div className="flex flex-col gap-px">
                      {/* Commands Section */}
                      {filteredActions.length > 0 && (
                        <section className="mb-2">
                          {filteredActions.map((meta, i) => (
                            <CommandItem
                              key={meta.id}
                              meta={meta}
                              keybind={bindings[meta.id]}
                              isActive={activeIndex === i}
                              onSelect={handleExecute}
                            />
                          ))}
                        </section>
                      )}

                      {/* Files Section */}
                      {searchFiles.length > 0 && (
                        <section className="mb-2">
                          {searchFiles.map((result, i) => (
                            <SearchResultItem
                              key={result.id}
                              result={result}
                              isActive={activeIndex === filteredActions.length + i}
                              onSelect={handleSelectFile}
                            />
                          ))}
                        </section>
                      )}

                      {/* Folders Section */}
                      {searchFolders.length > 0 && (
                        <section className="mb-2">
                          {searchFolders.map((result, i) => (
                            <SearchResultItem
                              key={result.id}
                              result={result}
                              isActive={activeIndex === filteredActions.length + searchFiles.length + i}
                              onSelect={handleSelectFile}
                            />
                          ))}
                        </section>
                      )}

                      {/* Loading State */}
                      {isFetching && (
                        <div className="px-3 py-4 flex items-center justify-center">
                          <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-disabled)" }}>
                            Searching files...
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Grouped display when not filtering
                    Array.from(groups.entries()).map(([groupName, items]) => (
                      <section key={groupName} className="mb-2">
                        <div className="flex flex-col gap-px">
                          {items.map(({ meta, globalIndex }) => (
                            <CommandItem
                              key={meta.id}
                              meta={meta}
                              keybind={bindings[meta.id]}
                              isActive={activeIndex === globalIndex}
                              onSelect={handleExecute}
                            />
                          ))}
                        </div>
                      </section>
                    ))
                  )}
                </div>

                {/* Footer */}
                <div
                  className="flex items-center gap-4 px-4 py-2"
                  style={{
                    borderTop: "1px solid var(--tv-border-subtle)",
                    font: "var(--tv-type-label-sm)",
                    color: "var(--tv-text-disabled)",
                  }}
                >
                  <span>
                    <kbd className="inline-block px-1 py-0.5 rounded text-[10px] border border-[var(--tv-border-strong)] bg-[var(--tv-bg-subtle)]">
                      ↑↓
                    </kbd>{" "}
                    Navigate
                  </span>
                  <span>
                    <kbd className="inline-block px-1 py-0.5 rounded text-[10px] border border-[var(--tv-border-strong)] bg-[var(--tv-bg-subtle)]">
                      ↵
                    </kbd>{" "}
                    Execute
                  </span>
                </div>
              </motion.div>
            </Dialog.Content>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
