// Move modal — folder tree picker to select destination.
// Used for both file and folder move actions.
// Self-loads root folders and lazily fetches children on expand.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Folder20Regular,
  FolderOpen20Regular,
  ChevronRight20Regular,
  Home20Regular,
} from "@fluentui/react-icons";
import { Button } from "./Button";
import { DialogContent, DialogHeader, DialogFooter } from "./DialogBase";
import { cn } from "../../../lib/cn";
import { springStandard } from "../../../lib/springs";
import { getRootChildren, getFolderChildren, folderKeys } from "../../../api/folders";

// ── FolderNode ────────────────────────────────────────────────────────────────

interface FolderNode {
  id: string;
  name: string;
  slug: string;
  iconColor?: string;
  /** undefined = not yet loaded; null = confirmed leaf; array = loaded children */
  children?: FolderNode[] | null;
}

// ── Picker tree item ──────────────────────────────────────────────────────────

interface PickerTreeItemProps {
  node: FolderNode;
  depth: number;
  selectedSlug: string | null;
  disabledIds?: string[]; // The items being moved — cannot move into themselves
  onSelect: (slug: string) => void;
  shouldReduceMotion: boolean;
}

function PickerTreeItem({
  node,
  depth,
  selectedSlug,
  disabledIds,
  onSelect,
  shouldReduceMotion,
}: PickerTreeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const isSelected = selectedSlug === node.slug;
  const isDisabled = disabledIds?.includes(node.id) ?? false;

  // Lazy-load children when expanded and not yet fetched
  const { data: childrenData } = useQuery({
    queryKey: folderKeys.sidebarChildren(node.slug),
    queryFn: () => getFolderChildren(node.slug, 1, 200),
    enabled: expanded && node.children === undefined,
  });

  // Resolve children: prefer already-set children on node, fallback to fetched data
  const resolvedChildren: FolderNode[] | null | undefined =
    node.children !== undefined
      ? node.children
      : childrenData
        ? childrenData.items.map((f) => ({
            id: f.id,
            name: f.name,
            slug: f.slug,
            iconColor: f.icon_color ?? undefined,
            children: undefined,
          }))
        : undefined;

  const hasChildren =
    resolvedChildren === undefined // not fetched yet — show chevron optimistically if never checked
      ? true // show chevron until we know; once fetched empty, it will hide
      : Array.isArray(resolvedChildren) && resolvedChildren.length > 0;

  // After fetch, if we got 0 children, treat as leaf
  const definitelyNoChildren =
    node.children === null ||
    (childrenData !== undefined && childrenData.items.length === 0 && node.children === undefined);

  const showChevron = !definitelyNoChildren;

  return (
    <div>
      <div
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-selected={isSelected}
        aria-disabled={isDisabled}
        onClick={() => {
          if (isDisabled) return;
          onSelect(node.slug);
        }}
        onKeyDown={(e) => {
          if (isDisabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(node.slug);
          }
          if (e.key === "ArrowRight" && showChevron) setExpanded(true);
          if (e.key === "ArrowLeft") setExpanded(false);
        }}
        className={cn(
          "relative flex items-center gap-1.5 h-8",
          "rounded-[var(--tv-radius-sm)]",
          "select-none outline-none",
          "overflow-hidden",
          "after:absolute after:inset-0 after:rounded-[inherit]",
          "after:content-[''] after:pointer-events-none",
          "after:transition-[background-color] after:duration-[120ms]",
          isDisabled
            ? "opacity-40 cursor-not-allowed"
            : "cursor-pointer hover:after:bg-[rgba(255,255,255,0.06)] focus-visible:ring-1 focus-visible:ring-[var(--tv-accent-primary)]",
          isSelected && !isDisabled
            ? "bg-[var(--tv-accent-container)] text-[var(--tv-accent-on-container)]"
            : "text-[var(--tv-text-secondary)]",
        )}
        style={{
          paddingLeft: `${8 + depth * 16}px`,
          paddingRight: "8px",
          font: "var(--tv-type-body-sm)",
        }}
      >
        {/* Expand chevron */}
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            if (showChevron) setExpanded((v) => !v);
          }}
          className={cn(
            "flex-shrink-0 flex items-center justify-center w-5 h-5",
            "rounded border-0 bg-transparent cursor-pointer relative z-10",
            !showChevron && "invisible",
          )}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : springStandard}
          >
            <ChevronRight20Regular style={{ width: 14, height: 14 }} />
          </motion.div>
        </button>

        {/* Folder icon */}
        <span className="flex-shrink-0" style={{ width: 16, height: 16 }}>
          {expanded && hasChildren ? (
            <FolderOpen20Regular
              style={{ color: node.iconColor ?? "var(--tv-text-disabled)" }}
            />
          ) : (
            <Folder20Regular
              style={{ color: node.iconColor ?? "var(--tv-text-disabled)" }}
            />
          )}
        </span>

        {/* Name */}
        <span className="flex-1 truncate">{node.name}</span>
      </div>

      {/* Children */}
      <AnimatePresence initial={false}>
        {expanded && Array.isArray(resolvedChildren) && resolvedChildren.length > 0 && (
          <motion.div
            key={`${node.id}-children`}
            initial={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : springStandard}
            style={{ overflow: "hidden" }}
          >
            {resolvedChildren.map((child) => (
              <PickerTreeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedSlug={selectedSlug}
                disabledIds={disabledIds}
                onSelect={onSelect}
                shouldReduceMotion={shouldReduceMotion}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── MoveModal ─────────────────────────────────────────────────────────────────

export interface MoveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Name of the item being moved (for display) */
  itemName: string;
  /** IDs of the items being moved — cannot be selected as destination */
  disabledIds?: string[];
  loading?: boolean;
  /** Called with the target folder slug, or null to move to root */
  onMove: (targetFolderSlug: string | null) => void;
}

export function MoveModal({
  open,
  onOpenChange,
  itemName,
  disabledIds,
  loading = false,
  onMove,
}: MoveModalProps) {
  // null = root selected; string = folder slug selected; undefined = nothing selected
  const [selectedSlug, setSelectedSlug] = useState<string | null | undefined>(undefined);
  const shouldReduceMotion = useReducedMotion() ?? false;

  const { data: rootData } = useQuery({
    queryKey: folderKeys.sidebarRoot(),
    queryFn: () => getRootChildren(1, 200),
    enabled: open,
  });

  const rootNodes: FolderNode[] = (rootData?.items ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    slug: f.slug,
    iconColor: f.icon_color ?? undefined,
    children: undefined,
  }));

  function handleMove() {
    if (selectedSlug === undefined || loading) return;
    onMove(selectedSlug);
  }

  const hasSelection = selectedSlug !== undefined;

  return (
    <DialogContent
      open={open}
      onOpenChange={onOpenChange}
      title={`Move "${itemName}"`}
      hideTitle
      maxWidth="440px"
      closeOnOutsideClick={!loading}
      closeOnEscape={!loading}
    >
      <DialogHeader
        title={`Move "${itemName}"`}
        description="Select a destination folder"
        onClose={() => onOpenChange(false)}
      />

      {/* Folder picker */}
      <div
        className="mx-4 my-3 overflow-y-auto"
        style={{
          maxHeight: 280,
          background: "var(--tv-bg-base)",
          borderRadius: "var(--tv-radius-md)",
          border: "1px solid var(--tv-border-subtle)",
          padding: "4px",
        }}
      >
        {/* Root option */}
        <div
          role="button"
          tabIndex={0}
          aria-selected={selectedSlug === null}
          onClick={() => setSelectedSlug(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSelectedSlug(null);
            }
          }}
          className={cn(
            "relative flex items-center gap-1.5 h-8",
            "rounded-[var(--tv-radius-sm)]",
            "select-none outline-none cursor-pointer",
            "overflow-hidden",
            "after:absolute after:inset-0 after:rounded-[inherit]",
            "after:content-[''] after:pointer-events-none",
            "after:transition-[background-color] after:duration-[120ms]",
            "hover:after:bg-[rgba(255,255,255,0.06)] focus-visible:ring-1 focus-visible:ring-[var(--tv-accent-primary)]",
            selectedSlug === null
              ? "bg-[var(--tv-accent-container)] text-[var(--tv-accent-on-container)]"
              : "text-[var(--tv-text-secondary)]",
          )}
          style={{
            paddingLeft: "8px",
            paddingRight: "8px",
            font: "var(--tv-type-body-sm)",
          }}
        >
          {/* Chevron placeholder for alignment */}
          <span className="flex-shrink-0 invisible" style={{ width: 20, height: 20 }} />
          {/* Home icon */}
          <span className="flex-shrink-0" style={{ width: 16, height: 16 }}>
            <Home20Regular style={{ color: "var(--tv-accent-primary)" }} />
          </span>
          <span className="flex-1 truncate">My Vault (root)</span>
        </div>

        {rootNodes.length === 0 && rootData !== undefined ? (
          <div
            className="flex items-center justify-center h-16"
            style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-disabled)" }}
          >
            No folders available
          </div>
        ) : (
          rootNodes.map((node) => (
            <PickerTreeItem
              key={node.id}
              node={node}
              depth={0}
              selectedSlug={typeof selectedSlug === "string" ? selectedSlug : null}
              disabledIds={disabledIds}
              onSelect={(slug) => setSelectedSlug(slug)}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))
        )}
      </div>

      <DialogFooter>
        <Button
          variant="ghost"
          size="md"
          onClick={() => onOpenChange(false)}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          loading={loading}
          disabled={!hasSelection}
          onClick={handleMove}
        >
          Move Here
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
