// New folder modal.
// Name input + channel selector (disabled with "Coming soon" tooltip in v1).

import { useState, useEffect, useRef } from "react";
import { Input } from "./Input";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";
import { Badge } from "./Badge";
import { DialogContent, DialogHeader, DialogFooter } from "./DialogBase";
import { cn } from "../../../lib/cn";

export interface NewFolderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  onCreateFolder: (name: string) => void;
}

export function NewFolderModal({
  open,
  onOpenChange,
  loading = false,
  onCreateFolder,
}: NewFolderModalProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;

  function handleSubmit() {
    if (!canSubmit || loading) return;
    onCreateFolder(trimmed);
  }

  return (
    <DialogContent
      open={open}
      onOpenChange={onOpenChange}
      title="New Folder"
      hideTitle
      maxWidth="420px"
      closeOnOutsideClick={!loading}
      closeOnEscape={!loading}
    >
      <DialogHeader
        title="New Folder"
        onClose={() => onOpenChange(false)}
      />
      <div className="px-6 py-4 flex flex-col gap-4">
        {/* Folder name */}
        <div className="flex flex-col gap-1.5">
          <label
            style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}
          >
            Folder name
          </label>
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") onOpenChange(false);
            }}
            placeholder="Untitled folder"
            disabled={loading}
          />
        </div>

        {/* Channel selector — disabled in v1 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label
              style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}
            >
              Channel
            </label>
            <Badge variant="coming-soon">Coming soon</Badge>
          </div>
          <Tooltip content="Per-folder channel selection is coming soon" side="bottom">
            <div
              className={cn(
                "flex items-center justify-between px-3 h-9",
                "rounded-[var(--tv-radius-sm)]",
                "border border-[var(--tv-border-subtle)]",
                "cursor-not-allowed opacity-50",
              )}
              style={{ background: "var(--tv-bg-subtle)" }}
            >
              <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-disabled)" }}>
                Use global default channel
              </span>
            </div>
          </Tooltip>
        </div>
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
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          Create
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
