import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ChevronRight20Regular,
  Home20Regular,
} from "@fluentui/react-icons";
import { useQuery } from "@tanstack/react-query";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "../../../lib/cn";
import { springStandard } from "../../../lib/springs";
import { getFolderChildren, folderKeys } from "../../../api/folders";
import { Spinner } from "./Spinner";
import { FolderIcon } from "./FolderIcon";
import { FolderContextMenu } from "./FolderContextMenu";
import { useExplorerStore } from "../../../store/explorerStore";
import { useExplorerActions } from "../../../hooks/useExplorerActions";
import { useClipboardStore } from "../../../store/clipboardStore";
import { toast } from "../../../lib/toast";
import type { FolderItem } from "../../../types/files";

// ── FolderNode ──────────────────────────────────────────────────────────────

export interface FolderNode {
  id: string;
  name: string;
  slug: string;
  iconColor?: string;
  iconImage?: string;
  // undefined = not yet loaded; null = no children; FolderNode[] = loaded
  children?: FolderNode[] | null;
}

// ── FolderTreeItem ─────────────────────────────────────────────────────────────

interface FolderTreeItemProps {
  node: FolderNode;
  depth: number;
  shouldReduceMotion: boolean;
}

function FolderTreeItem({ node, depth, shouldReduceMotion }: FolderTreeItemProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const explorerStore = useExplorerStore();
  const explorerActions = useExplorerActions(node.slug);
  const clipboard = useClipboardStore();

  const isActive = pathname === `/browse/${node.slug}` || pathname === `/browse/${node.slug}/`;
  const isExpanded = explorerStore.expandedSlugs.has(node.slug);

  // Load children when expanded and not yet fetched.
  const shouldFetch = isExpanded && node.children === undefined;
  const childQuery = useQuery({
    queryKey: folderKeys.sidebarChildren(node.slug),
    queryFn: () => getFolderChildren(node.slug, 1, 200),
    enabled: shouldFetch,
  });

  // Resolve displayed children
  const displayedChildren: FolderNode[] | null | undefined = (() => {
    if (node.children !== undefined) return node.children; // pre-loaded
    if (!isExpanded) return undefined;
    if (childQuery.isLoading) return undefined;
    if (childQuery.isError) return null;
    return (childQuery.data?.items ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      iconColor: f.icon_color ?? undefined,
      iconImage: f.icon_image ?? undefined,
      children: undefined, // not yet loaded — will lazy-load on expand
    }));
  })();

  const { setNodeRef, isOver } = useDroppable({
    id: `drop-tree-${node.slug}`,
    data: { folderSlug: node.slug },
  });

  const hasChildren = node.children !== null; // null = definitely no children; undefined = unknown

  // Context menu handlers
  const handleRename = () => {
    const folderItem: FolderItem = {
      id: node.id,
      name: node.name,
      slug: node.slug,
      icon_color: node.iconColor ?? undefined,
      icon_image: node.iconImage ?? undefined,
      depth,
      created_at: new Date().toISOString(),
    };
    explorerStore.setRenameTarget({ type: "folder", item: folderItem });
  };

  const handleMove = () => {
    const folderItem: FolderItem = {
      id: node.id,
      name: node.name,
      slug: node.slug,
      icon_color: node.iconColor ?? undefined,
      icon_image: node.iconImage ?? undefined,
      depth,
      created_at: new Date().toISOString(),
    };
    explorerStore.setMoveTarget({ type: "folder", item: folderItem });
  };

  const handleDelete = () => {
    const folderItem: FolderItem = {
      id: node.id,
      name: node.name,
      slug: node.slug,
      icon_color: node.iconColor ?? undefined,
      icon_image: node.iconImage ?? undefined,
      depth,
      created_at: new Date().toISOString(),
    };
    explorerStore.setDeleteTarget({ type: "folder", item: folderItem });
  };

  const handleProperties = () => {
    const folderItem: FolderItem = {
      id: node.id,
      name: node.name,
      slug: node.slug,
      icon_color: node.iconColor ?? undefined,
      icon_image: node.iconImage ?? undefined,
      depth,
      created_at: new Date().toISOString(),
    };
    explorerStore.setPropertiesTarget({ type: "folder", item: folderItem });
  };

  const handleCopy = () => {
    clipboard.copy([{ id: node.id, type: "folder", name: node.name }], "");
    toast.success("Copied to clipboard");
  };

  return (
    <div>
      <FolderContextMenu
        currentColor={node.iconColor}
        onRename={handleRename}
        onNewFolder={() => {
          explorerStore.setExpanded(node.slug, true);
          explorerStore.setNewFolderParentSlug(node.slug);
          explorerStore.setNewFolderOpen(true);
        }}
        onMove={handleMove}
        onDelete={handleDelete}
        onProperties={handleProperties}
        onColorChange={(color) => explorerActions.changeFolderColor.mutate({ slug: node.slug, color })}
        onCopy={handleCopy}
        onPaste={() => explorerActions.handlePaste(node.slug)}
      >
        <div
          ref={setNodeRef}
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/browse/${node.slug}`)}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate(`/browse/${node.slug}`);
            }
          }}
          className={cn(
            "relative flex items-center gap-1",
            "h-8 rounded-[var(--tv-radius-sm)]",
            "cursor-pointer select-none",
            "overflow-hidden",
            "after:absolute after:inset-0 after:rounded-[inherit]",
            "after:content-[''] after:pointer-events-none",
            "after:transition-[background-color] after:duration-[120ms]",
            "hover:after:bg-[rgba(255,255,255,0.06)]",
            "active:after:bg-[rgba(255,255,255,0.10)]",
            isActive
              ? "bg-[var(--tv-accent-container)] text-[var(--tv-accent-on-container)]"
              : "bg-transparent text-[var(--tv-text-secondary)]",
          )}
          style={{
            paddingLeft: `${8 + depth * 16}px`,
            paddingRight: "8px",
            font: "var(--tv-type-body-sm)",
            outline: isOver ? "2px solid var(--tv-accent)" : "2px solid transparent",
            background: isOver ? "color-mix(in srgb, var(--tv-accent-container) 12%, transparent)" : undefined,
            transition: "outline 80ms, background 80ms",
            borderRadius: "6px",
          }}
        >
          {/* Chevron */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) explorerStore.toggleExpanded(node.slug);
            }}
            className={cn(
              "relative z-10 flex-shrink-0 flex items-center justify-center",
              "w-4 h-4 rounded-[var(--tv-radius-xs)]",
              "border-0 bg-transparent cursor-pointer p-0",
              hasChildren ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            tabIndex={hasChildren ? 0 : -1}
          >
            <motion.span
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : springStandard}
              style={{ display: "flex" }}
            >
              <ChevronRight20Regular style={{ width: 12, height: 12 }} />
            </motion.span>
          </button>

          {/* Icon */}
          <span className="flex-shrink-0 flex items-center pointer-events-none">
            <FolderIcon
              iconColor={node.iconColor}
              iconImage={node.iconImage}
              open={isExpanded && hasChildren}
              size={16}
            />
          </span>

          {/* Name */}
          <span className="truncate flex-1 pointer-events-none">{node.name}</span>

          {(childQuery.isLoading) && (
            <span className="flex-shrink-0 pointer-events-none opacity-50">
              <Spinner size="sm" />
            </span>
          )}
        </div>
      </FolderContextMenu>

      <AnimatePresence initial={false}>
        {isExpanded && displayedChildren != null && displayedChildren.length > 0 && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : springStandard}
            style={{ overflow: "hidden" }}
          >
            {displayedChildren.map((child) => (
              <FolderTreeItem key={child.id} node={child} depth={depth + 1} shouldReduceMotion={shouldReduceMotion} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── FolderTree ─────────────────────────────────────────────────────────────────

export interface FolderTreeProps {
  nodes: FolderNode[];
}

export function FolderTree({ nodes }: FolderTreeProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const { setNodeRef: setRootRef, isOver: isRootOver } = useDroppable({
    id: "drop-root",
    data: { folderSlug: null },
  });
  const navigate = useNavigate();
  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        padding: "4px 8px",
        scrollbarWidth: "thin",
        scrollbarColor: "var(--tv-border-default) transparent",
      }}
    >
      <div
        ref={setRootRef}
        role="button"
        tabIndex={0}
        onClick={() => navigate("/browse")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate("/browse");
          }
        }}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer select-none transition-colors",
          "text-[13px] font-medium text-[var(--tv-on-surface-variant)]",
          "hover:bg-[rgba(255,255,255,0.06)] active:bg-[rgba(255,255,255,0.1)]",
        )}
        style={{
          outline: isRootOver ? "2px solid var(--tv-accent)" : "2px solid transparent",
          background: isRootOver
            ? "color-mix(in srgb, var(--tv-accent-container) 12%, transparent)"
            : undefined,
          marginBottom: "2px",
        }}
      >
        <Home20Regular style={{ width: 14, height: 14 }} />
        My Vault
      </div>
      {nodes.map((node) => (
        <FolderTreeItem key={node.id} node={node} depth={0} shouldReduceMotion={shouldReduceMotion} />
      ))}
    </div>
  );
}
