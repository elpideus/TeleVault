// Generic confirmation modal. Danger variant for destructive actions.
// Used for delete, overwrite, and other irreversible operations.

import { Button } from "./Button";
import { DialogContent, DialogHeader, DialogFooter } from "./DialogBase";

export interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
}: ConfirmModalProps) {
  return (
    <DialogContent
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      hideTitle
      maxWidth="400px"
      closeOnOutsideClick={!loading}
      closeOnEscape={!loading}
    >
      <DialogHeader
        title={title}
        description={description}
        onClose={() => onOpenChange(false)}
      />
      <DialogFooter>
        <Button
          variant="ghost"
          size="md"
          onClick={() => onOpenChange(false)}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          size="md"
          loading={loading}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
