// Spotlight-style search overlay.
// Triggered by Ctrl+F or the navbar search button (searchOpen from uiStore).
// Animation: scale 0.97→1, opacity 0→1, y +6px→0 (springGentle).

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Search20Regular,
  Document20Regular,
  Folder20Regular,
  Dismiss20Regular,
} from "@fluentui/react-icons";
import { cn } from "../../../lib/cn";
import { springGentle, exitTransition } from "../../../lib/springs";
import { useUIStore } from "../../../store/uiStore";
import { search, searchKeys } from "../../../api/search";
import type { SearchResultItem as SearchResultData } from "../../../api/schema";

// ── Highlight ─────────────────────────────────────────────────────────────────

/** Splits `text` into parts — each part is either plain or a match segment. */
function highlightMatches(
  text: string,
  query: string,
): { text: string; highlighted: boolean }[] {
  if (!query.trim()) return [{ text, highlighted: false }];

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  return parts.map((part) => ({
    text: part,
    highlighted: regex.test(part),
  }));
}

// ── SearchResultItem ───────────────────────────────────────────────────────────

export interface SearchResultItemProps {
  result: SearchResultData;
  query: string;
  isActive: boolean;
  onSelect: (result: SearchResultData) => void;
}

export function SearchResultItem({
  result,
  query,
  isActive,
  onSelect,
}: SearchResultItemProps) {
  const isFolder = result.type === "folder";
  const parts = highlightMatches(result.name, query);

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
        // State layer
        "after:absolute after:inset-0 after:rounded-[inherit]",
        "after:content-[''] after:pointer-events-none",
        "after:transition-[background-color] after:duration-[120ms]",
        isActive
          ? "after:bg-[rgba(255,255,255,0.08)]"
          : "hover:after:bg-[rgba(255,255,255,0.05)]",
      )}
      style={{
        background: isActive
          ? "var(--tv-accent-container)"
          : "transparent",
      }}
    >
      {/* Icon */}
      <span
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--tv-radius-xs)",
          background: isFolder
            ? "rgba(59, 130, 246, 0.12)"
            : "rgba(255,255,255,0.06)",
          color: isFolder ? "var(--tv-accent-on-container)" : "var(--tv-text-secondary)",
        }}
        aria-hidden
      >
        {isFolder ? (
          <Folder20Regular style={{ width: 16, height: 16 }} />
        ) : (
          <Document20Regular style={{ width: 16, height: 16 }} />
        )}
      </span>

      {/* Text */}
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* Name with highlighted match */}
        <span
          className="truncate"
          style={{ font: "var(--tv-type-body)", color: "var(--tv-text-primary)" }}
        >
          {parts.map((part, i) =>
            part.highlighted ? (
              <mark
                key={i}
                style={{
                  background: "var(--tv-accent-container)",
                  color: "var(--tv-accent-on-container)",
                  borderRadius: 2,
                  padding: "0 2px",
                }}
              >
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </span>

        {/* Folder path */}
        {result.folder_slug && (
          <span
            className="truncate"
            style={{ font: "var(--tv-type-label-sm)", color: "var(--tv-text-secondary)" }}
          >
            /{result.folder_slug}
          </span>
        )}
        {!result.folder_slug && isFolder && (
          <span
            className="truncate"
            style={{ font: "var(--tv-type-label-sm)", color: "var(--tv-text-secondary)" }}
          >
            Root
          </span>
        )}
      </span>

      {/* Type badge */}
      <span
        className="flex-shrink-0"
        style={{
          font: "var(--tv-type-label-sm)",
          color: "var(--tv-text-disabled)",
          textTransform: "capitalize",
        }}
      >
        {result.type}
      </span>
    </button>
  );
}

// ── SearchResults ─────────────────────────────────────────────────────────────

export interface SearchResultsProps {
  results: SearchResultData[];
  query: string;
  activeIndex: number;
  onSelect: (result: SearchResultData) => void;
}

export function SearchResults({
  results,
  query,
  activeIndex,
  onSelect,
}: SearchResultsProps) {
  const files = results.filter((r) => r.type === "file");
  const folders = results.filter((r) => r.type === "folder");

  if (results.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-10 gap-2"
        role="status"
        aria-live="polite"
      >
        <Search20Regular style={{ width: 28, height: 28, color: "var(--tv-text-disabled)" }} />
        <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-disabled)" }}>
          No results for "{query}"
        </span>
      </div>
    );
  }

  // Compute global index offset so isActive comparison works across groups
  const fileOffset = 0;
  const folderOffset = files.length;

  return (
    <div className="flex flex-col gap-2 p-2" role="listbox" aria-label="Search results">
      {files.length > 0 && (
        <section>
          <div
            className="px-3 py-1"
            style={{ font: "var(--tv-type-title-sm)", color: "var(--tv-text-secondary)" }}
          >
            Files
          </div>
          {files.map((result, i) => (
            <SearchResultItem
              key={result.id}
              result={result}
              query={query}
              isActive={activeIndex === fileOffset + i}
              onSelect={onSelect}
            />
          ))}
        </section>
      )}

      {folders.length > 0 && (
        <section>
          <div
            className="px-3 py-1"
            style={{ font: "var(--tv-type-title-sm)", color: "var(--tv-text-secondary)" }}
          >
            Folders
          </div>
          {folders.map((result, i) => (
            <SearchResultItem
              key={result.id}
              result={result}
              query={query}
              isActive={activeIndex === folderOffset + i}
              onSelect={onSelect}
            />
          ))}
        </section>
      )}
    </div>
  );
}

// ── SearchInput ───────────────────────────────────────────────────────────────

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  resultCount: number;
}

export function SearchInput({ value, onChange, onClear, resultCount }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 transition-[box-shadow] duration-[120ms] focus-within:ring-1 focus-within:ring-inset focus-within:ring-[var(--tv-accent-ring)]"
      style={{ borderBottom: "1px solid var(--tv-border-subtle)" }}
    >
      <Search20Regular
        style={{ width: 20, height: 20, color: "var(--tv-text-secondary)", flexShrink: 0 }}
        aria-hidden
      />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={resultCount > 0}
        aria-controls="search-results"
        aria-autocomplete="list"
        placeholder="Search files and folders…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent border-0 outline-none"
        style={{ font: "var(--tv-type-body)", color: "var(--tv-text-primary)" }}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className={cn(
            "flex-shrink-0 flex items-center justify-center w-6 h-6",
            "rounded-[var(--tv-radius-xs)] border-0 cursor-pointer bg-transparent",
            "text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)]",
            "transition-colors duration-[var(--tv-duration-fast)]",
          )}
        >
          <Dismiss20Regular style={{ width: 14, height: 14 }} />
        </button>
      )}
    </div>
  );
}

// ── SearchOverlay ─────────────────────────────────────────────────────────────

export interface SearchOverlayProps {
  /** Override open state — for preview/storybook use. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Override results for preview use. When provided, no debounce filtering occurs. */
  mockResults?: SearchResultData[];
}

export function SearchOverlay({ open: controlledOpen, onOpenChange, mockResults }: SearchOverlayProps) {
  const shouldReduceMotion = useReducedMotion();

  const { searchOpen, setSearchOpen } = useUIStore();
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? (controlledOpen ?? false) : searchOpen;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!isControlled) setSearchOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, setSearchOpen, onOpenChange],
  );

  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setRawQuery("");
      setDebouncedQuery("");
      setActiveIndex(-1);
    }
  }, [isOpen]);

  // 300ms debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(rawQuery), 300);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  // Live search query — skipped when mockResults prop is provided (preview mode)
  const { data: searchData, isFetching } = useQuery({
    queryKey: searchKeys.query(debouncedQuery),
    queryFn: () => search(debouncedQuery, 1, 20),
    enabled: !mockResults && debouncedQuery.length >= 2,
    placeholderData: (prev) => prev,
  });

  const filteredResults: SearchResultData[] = mockResults
    ? mockResults.filter((r) =>
        r.name.toLowerCase().includes(debouncedQuery.toLowerCase()),
      )
    : searchData?.items ?? [];

  const showResults = debouncedQuery.trim().length >= 2;
  const isSearching = isFetching && debouncedQuery.length >= 2;

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showResults) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filteredResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        const selected = filteredResults[activeIndex];
        if (selected) handleSelect(selected);
      }
    },
    [showResults, filteredResults, activeIndex],
  );

  const handleSelect = useCallback(
    (_result: SearchResultData) => {
      // Phase 10 will wire real navigation. For now close the overlay.
      handleOpenChange(false);
    },
    [handleOpenChange],
  );

  // Overlay animation variants (spec §9.3 — search overlay)
  const overlayVariants = {
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
                key="search-backdrop"
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

        {/* Modal */}
        <AnimatePresence>
          {isOpen && (
            <Dialog.Content
              forceMount
              asChild
              onKeyDown={(e) => {
                // Let arrow keys and enter pass through to our handler
                handleKeyDown(e as unknown as React.KeyboardEvent);
              }}
            >
              <motion.div
                key="search-modal"
                variants={overlayVariants}
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
                  maxWidth: 640,
                  background: "var(--tv-bg-overlay)",
                  backdropFilter: "blur(var(--tv-glass-blur))",
                }}
              >
                <Dialog.Title className="sr-only">Search</Dialog.Title>

                <SearchInput
                  value={rawQuery}
                  onChange={(v) => {
                    setRawQuery(v);
                    setActiveIndex(-1);
                  }}
                  onClear={() => {
                    setRawQuery("");
                    setDebouncedQuery("");
                    setActiveIndex(-1);
                  }}
                  resultCount={filteredResults.length}
                />

                {/* Loading indicator */}
                {isSearching && (
                  <div
                    className="flex items-center justify-center py-6"
                    role="status"
                    aria-label="Searching…"
                  >
                    <span
                      style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-disabled)" }}
                    >
                      Searching…
                    </span>
                  </div>
                )}

                {/* Results — animate in/out */}
                <AnimatePresence>
                  {showResults && !isSearching && (
                    <motion.div
                      key="results"
                      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, transition: { ...exitTransition } }}
                      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      style={{ maxHeight: 480, overflowY: "auto" }}
                      id="search-results"
                    >
                      <SearchResults
                        results={filteredResults}
                        query={debouncedQuery}
                        activeIndex={activeIndex}
                        onSelect={handleSelect}
                      />

                      {/* Footer hint */}
                      <div
                        className="flex items-center gap-4 px-4 py-2"
                        style={{
                          borderTop: "1px solid var(--tv-border-subtle)",
                          font: "var(--tv-type-label-sm)",
                          color: "var(--tv-text-disabled)",
                        }}
                      >
                        <span>
                          <kbd
                            className="inline-block px-1 py-0.5 rounded text-[10px] border border-[var(--tv-border-strong)] bg-[var(--tv-bg-subtle)]"
                          >
                            ↑↓
                          </kbd>{" "}
                          Navigate
                        </span>
                        <span>
                          <kbd
                            className="inline-block px-1 py-0.5 rounded text-[10px] border border-[var(--tv-border-strong)] bg-[var(--tv-bg-subtle)]"
                          >
                            ↵
                          </kbd>{" "}
                          Open
                        </span>
                        <span>
                          <kbd
                            className="inline-block px-1 py-0.5 rounded text-[10px] border border-[var(--tv-border-strong)] bg-[var(--tv-bg-subtle)]"
                          >
                            Esc
                          </kbd>{" "}
                          Close
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Empty input state — hint */}
                {!showResults && (
                  <div
                    className="flex flex-col items-center justify-center py-10 gap-1"
                  >
                    <span
                      style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-disabled)" }}
                    >
                      Type to search your vault
                    </span>
                  </div>
                )}
              </motion.div>
            </Dialog.Content>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
