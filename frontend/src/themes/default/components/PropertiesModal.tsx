// Properties modal — Windows Properties-style with file and folder variants.
// File: filename, SHA-256 hash, size, MIME, status, split count, created date.
// Folder: name (editable), slug, depth, created date, file/subfolder count,
//         icon image upload, icon_color picker (ColorSwatchRow).

import { useState, useRef, useCallback } from "react";
import { useAuthenticatedImage } from "../../../hooks/useAuthenticatedImage";
import {
  Document20Regular,
  Folder20Regular,
  Copy20Regular,
  Info20Regular,
  ArrowUpload20Regular,
  Dismiss20Regular,
} from "@fluentui/react-icons";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { springGentle, exitTransition } from "../../../lib/springs";
import { Button } from "./Button";
import { Input } from "./Input";
import { Badge } from "./Badge";
import { Tooltip } from "./Tooltip";
import { ColorSwatchRow } from "./ColorSwatchRow";
import { cn } from "../../../lib/cn";
import type { FileItem, FolderItem } from "../../../types/files";
import { formatBytes } from "../../../lib/formatBytes";
import { getFileTypeDisplay } from "../../../lib/fileType";

// ── Shared row component ──────────────────────────────────────────────────────

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div
      className="flex items-start justify-between gap-4 py-2"
      style={{ borderBottom: "1px solid var(--tv-border-subtle)" }}
    >
      <span
        className="flex-shrink-0"
        style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)", minWidth: 100 }}
      >
        {label}
      </span>
      <span
        className="text-right break-all"
        style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Tooltip content={copied ? "Copied!" : "Copy"} side="top">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy to clipboard"
        className={cn(
          "flex-shrink-0 flex items-center justify-center w-6 h-6",
          "rounded border-0 bg-transparent cursor-pointer",
          "text-[var(--tv-text-secondary)]",
          "transition-colors duration-[120ms]",
          "hover:text-[var(--tv-text-primary)] hover:bg-[rgba(255,255,255,0.06)]",
        )}
      >
        <Copy20Regular style={{ width: 14, height: 14 }} />
      </button>
    </Tooltip>
  );
}

// ── File status badge ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FileItem["status"] }) {
  const map = {
    ready: { variant: "success" as const, label: "Ready" },
    processing: { variant: "info" as const, label: "Processing" },
    error: { variant: "error" as const, label: "Error" },
  };
  const { variant, label } = map[status] ?? { variant: "default" as const, label: status };
  return <Badge variant={variant}>{label}</Badge>;
}

// ── Format date ───────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Shared dialog wrapper (full Radix Dialog without DialogContent to avoid double Root) ──

interface PropertiesDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

function PropertiesDialogShell({
  open,
  onOpenChange,
  title,
  children,
}: PropertiesDialogShellProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  const contentVariants = {
    hidden: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: shouldReduceMotion
      ? { opacity: 0, transition: exitTransition }
      : { opacity: 0, scale: 0.96, y: 4, transition: exitTransition },
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open && (
            <Dialog.Overlay forceMount asChild>
              <motion.div
                key="props-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.14 } }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
                className="fixed inset-0 z-40"
                style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
              />
            </Dialog.Overlay>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {open && (
            <Dialog.Content forceMount asChild>
              <motion.div
                key="props-content"
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={shouldReduceMotion ? { duration: 0 } : springGentle}
                className={cn(
                  "fixed z-50",
                  "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                  "w-[calc(100vw-48px)] max-w-[520px]",
                  "rounded-[var(--tv-radius-lg)]",
                  "border border-[var(--tv-border-strong)]",
                  "shadow-[var(--tv-shadow-lg)]",
                  "outline-none overflow-hidden",
                )}
                style={{
                  background: "var(--tv-bg-overlay)",
                  backdropFilter: "blur(var(--tv-glass-blur))",
                }}
              >
                <Dialog.Title className="sr-only">{title}</Dialog.Title>
                {children}
              </motion.div>
            </Dialog.Content>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── File Properties ────────────────────────────────────────────────────────────

export interface FilePropertiesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileItem;
  onRename?: (newName: string) => void;
}

export function FilePropertiesModal({
  open,
  onOpenChange,
  file,
  onRename,
}: FilePropertiesModalProps) {
  const displayName = file.name ?? file.original_name;
  const [editName, setEditName] = useState(displayName);
  const hasNameChanged = editName.trim() !== displayName && editName.trim().length > 0;
  const truncatedHash = file.sha256 ? file.sha256.slice(0, 12) : null;

  return (
    <PropertiesDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="File Properties"
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 pt-5 pb-4"
        style={{ borderBottom: "1px solid var(--tv-border-subtle)" }}
      >
        <div
          className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-[var(--tv-radius-md)]"
          style={{ background: "var(--tv-accent-container)" }}
        >
          <Document20Regular style={{ width: 20, height: 20, color: "var(--tv-accent-on-container)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 style={{ font: "var(--tv-type-headline)", color: "var(--tv-text-primary)", margin: 0 }}>
            Properties
          </h2>
          <p style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)", margin: "2px 0 0" }}>
            File
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className={cn(
            "flex-shrink-0 flex items-center justify-center w-8 h-8",
            "rounded-[var(--tv-radius-sm)] border-0 cursor-pointer bg-transparent",
            "text-[var(--tv-text-secondary)]",
            "transition-colors duration-[120ms]",
            "hover:text-[var(--tv-text-primary)] hover:bg-[rgba(255,255,255,0.06)]",
          )}
        >
          <Dismiss20Regular style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Body */}
      <div className="px-6 py-4 flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: "60vh" }}>
        {/* Editable filename */}
        <div className="flex flex-col gap-1.5 mb-3">
          <label style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
            Name
          </label>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Filename"
          />
        </div>

        <InfoRow label="Size" value={formatBytes(file.size)} />
        <InfoRow label="Type" value={getFileTypeDisplay(displayName, file.mime_type)} />
        <InfoRow label="Status" value={<StatusBadge status={file.status} />} />
        {file.split_count != null && (
          <InfoRow label="Parts" value={String(file.split_count)} />
        )}
        <InfoRow label="Created" value={formatDate(file.created_at)} />

        {/* Info rows */}
        {truncatedHash && (
          <div
            className="flex items-center justify-between py-2"
          >
            <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)", minWidth: 100 }}>
              SHA-256
            </span>
            <div className="flex items-center gap-1.5">
              <code
                style={{
                  font: "var(--tv-type-mono)",
                  color: "var(--tv-text-primary)",
                  background: "var(--tv-bg-subtle)",
                  padding: "2px 6px",
                  borderRadius: "var(--tv-radius-xs)",
                }}
              >
                {truncatedHash}…
              </code>
              <CopyButton text={file.sha256!} />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-end gap-2 px-6 py-4"
        style={{ borderTop: "1px solid var(--tv-border-subtle)" }}
      >
        <Button variant="ghost" size="md" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        {hasNameChanged && onRename ? (
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              onRename(editName.trim());
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        ) : (
          <Button variant="secondary" size="md" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        )}
      </div>
    </PropertiesDialogShell>
  );
}

// ── Folder Properties ─────────────────────────────────────────────────────────

export interface FolderPropertiesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: FolderItem;
  onSave?: (updates: { name?: string; icon_color?: string; icon_image?: string | null; icon_image_file?: File | null }) => void;
}

export function FolderPropertiesModal({
  open,
  onOpenChange,
  folder,
  onSave,
}: FolderPropertiesModalProps) {
  const [editName, setEditName] = useState(folder.name);
  const [editColor, setEditColor] = useState(folder.icon_color ?? "");
  const [editIconImage, setEditIconImage] = useState<string | null>(folder.icon_image ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iconFileRef = useRef<File | null>(null);

  // editIconImage is either an API URL (needs auth) or a local data: URL (from FileReader).
  const apiIconUrl = editIconImage?.startsWith("http") ? editIconImage : undefined;
  const authenticatedIconUrl = useAuthenticatedImage(apiIconUrl);
  const previewSrc = apiIconUrl ? authenticatedIconUrl : (editIconImage ?? undefined);

  const hasChanges =
    editName.trim() !== folder.name ||
    editColor !== (folder.icon_color ?? "") ||
    editIconImage !== (folder.icon_image ?? null);

  const handleIconUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      iconFileRef.current = file;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (typeof ev.target?.result === "string") {
          setEditIconImage(ev.target.result);
        }
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  function handleSave() {
    const iconChanged = editIconImage !== (folder.icon_image ?? null);
    onSave?.({
      name: editName.trim() !== folder.name ? editName.trim() : undefined,
      icon_color: editColor !== (folder.icon_color ?? "") ? editColor : undefined,
      icon_image: iconChanged ? editIconImage : undefined,
      icon_image_file: iconChanged ? (iconFileRef.current ?? null) : undefined,
    });
    onOpenChange(false);
  }

  return (
    <PropertiesDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Folder Properties"
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 pt-5 pb-4"
        style={{ borderBottom: "1px solid var(--tv-border-subtle)" }}
      >
        <div
          className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-[var(--tv-radius-md)]"
          style={{ background: "var(--tv-accent-container)" }}
        >
          <Folder20Regular style={{ width: 20, height: 20, color: "var(--tv-accent-on-container)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 style={{ font: "var(--tv-type-headline)", color: "var(--tv-text-primary)", margin: 0 }}>
            Properties
          </h2>
          <p style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)", margin: "2px 0 0" }}>
            Folder
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className={cn(
            "flex-shrink-0 flex items-center justify-center w-8 h-8",
            "rounded-[var(--tv-radius-sm)] border-0 cursor-pointer bg-transparent",
            "text-[var(--tv-text-secondary)]",
            "transition-colors duration-[120ms]",
            "hover:text-[var(--tv-text-primary)] hover:bg-[rgba(255,255,255,0.06)]",
          )}
        >
          <Dismiss20Regular style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Body */}
      <div className="px-6 py-4 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: "60vh" }}>
        {/* Editable name */}
        <div className="flex flex-col gap-1.5">
          <label style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
            Name
          </label>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Folder name"
          />
        </div>

        {/* Read-only info */}
        <div className="flex flex-col gap-0">
          <InfoRow
            label="Slug"
            value={
              <code
                style={{
                  font: "var(--tv-type-mono)",
                  background: "var(--tv-bg-subtle)",
                  padding: "2px 6px",
                  borderRadius: "var(--tv-radius-xs)",
                }}
              >
                {folder.slug}
              </code>
            }
          />
          <InfoRow label="Depth" value={String(folder.depth)} />
          <InfoRow label="Created" value={formatDate(folder.created_at)} />
          {folder.total_size != null && (
            <InfoRow label="Size" value={formatBytes(folder.total_size)} />
          )}
          {folder.file_count != null && (
            <InfoRow label="Files" value={String(folder.file_count)} />
          )}
          {folder.subfolder_count != null && (
            <InfoRow label="Subfolders" value={String(folder.subfolder_count)} />
          )}
        </div>

        {/* Icon color */}
        <div className="flex flex-col gap-2">
          <label style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
            Folder color
          </label>
          <ColorSwatchRow
            value={editColor}
            onChange={(hex) => setEditColor(hex ?? "")}
          />
        </div>

        {/* Icon image */}
        <div className="flex flex-col gap-2">
          <label style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
            Folder icon image
          </label>
          <div className="flex items-center gap-3">
            {editIconImage ? (
              <div className="relative">
                <img
                  src={previewSrc}
                  alt="Folder icon"
                  className="w-10 h-10 rounded-[var(--tv-radius-sm)] object-cover"
                  style={{ border: "1px solid var(--tv-border-default)" }}
                />
                <button
                  type="button"
                  onClick={() => { setEditIconImage(null); iconFileRef.current = null; }}
                  aria-label="Remove icon"
                  className={cn(
                    "absolute -top-1.5 -right-1.5",
                    "flex items-center justify-center w-4 h-4",
                    "rounded-full border-0 cursor-pointer",
                    "text-white",
                  )}
                  style={{ background: "var(--tv-error)" }}
                >
                  <Dismiss20Regular style={{ width: 10, height: 10 }} />
                </button>
              </div>
            ) : (
              <div
                className="flex items-center justify-center w-10 h-10 rounded-[var(--tv-radius-sm)]"
                style={{
                  background: "var(--tv-bg-subtle)",
                  border: "1px dashed var(--tv-border-default)",
                }}
              >
                <Folder20Regular style={{ width: 18, height: 18, color: "var(--tv-text-disabled)" }} />
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <ArrowUpload20Regular style={{ width: 14, height: 14, marginRight: 4 }} />
                Upload
              </Button>
              {editIconImage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditIconImage(null); iconFileRef.current = null; }}
                >
                  Remove
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleIconUpload}
            />
          </div>
        </div>

        {/* Channel — coming soon */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
              Channel
            </label>
            <Badge variant="coming-soon">Coming soon</Badge>
          </div>
          <Tooltip content="Per-folder channel selection is coming soon" side="bottom">
            <div
              className="flex items-center justify-between px-3 h-9 rounded-[var(--tv-radius-sm)] opacity-50 cursor-not-allowed"
              style={{
                background: "var(--tv-bg-subtle)",
                border: "1px solid var(--tv-border-subtle)",
              }}
            >
              <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-disabled)" }}>
                Use global default channel
              </span>
              <Info20Regular style={{ width: 14, height: 14, color: "var(--tv-text-disabled)" }} />
            </div>
          </Tooltip>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-end gap-2 px-6 py-4"
        style={{ borderTop: "1px solid var(--tv-border-subtle)" }}
      >
        <Button variant="ghost" size="md" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        {hasChanges && onSave ? (
          <Button variant="primary" size="md" onClick={handleSave}>
            Save
          </Button>
        ) : (
          <Button variant="secondary" size="md" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        )}
      </div>
    </PropertiesDialogShell>
  );
}
