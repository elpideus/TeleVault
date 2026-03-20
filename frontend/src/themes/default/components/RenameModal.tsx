// Rename modal — pre-filled input, submits on Enter.
// Used for both file and folder rename actions.

import { useState, useEffect, useRef } from "react";
import { Input } from "./Input";
import { Button } from "./Button";
import { DialogContent, DialogHeader, DialogFooter } from "./DialogBase";

export interface RenameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current name to pre-fill the input */
  initialName: string;
  /** Whether renaming a file (true) or folder (false) */
  isFile?: boolean;
  loading?: boolean;
  onRename: (newName: string) => void;
}

export function RenameModal({
  open,
  onOpenChange,
  initialName,
  isFile = false,
  loading = false,
  onRename,
}: RenameModalProps) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset and focus when opened
  useEffect(() => {
    if (open) {
      setValue(initialName);
      // Defer focus so the animation has started
      setTimeout(() => {
        inputRef.current?.focus();
        // Select just the filename, not the extension for files
        if (isFile) {
          const dotIndex = initialName.lastIndexOf(".");
          if (dotIndex > 0) {
            inputRef.current?.setSelectionRange(0, dotIndex);
          } else {
            inputRef.current?.select();
          }
        } else {
          inputRef.current?.select();
        }
      }, 80);
    }
  }, [open, initialName, isFile]);

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== initialName;

  function handleSubmit() {
    if (!canSubmit || loading) return;
    onRename(trimmed);
  }

  return (
    <DialogContent
      open={open}
      onOpenChange={onOpenChange}
      title={isFile ? "Rename File" : "Rename Folder"}
      hideTitle
      maxWidth="400px"
      closeOnOutsideClick={!loading}
      closeOnEscape={!loading}
    >
      <DialogHeader
        title={isFile ? "Rename File" : "Rename Folder"}
        onClose={() => onOpenChange(false)}
      />
      <div className="px-6 py-4">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onOpenChange(false);
          }}
          placeholder={isFile ? "File name" : "Folder name"}
          aria-label="New name"
          disabled={loading}
        />
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
          Rename
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
