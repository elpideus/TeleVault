// Shared Radix Dialog primitives styled to the TeleVault design system.
// All modals compose from these atoms — never from @radix-ui/react-dialog directly.

import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Dismiss20Regular } from "@fluentui/react-icons";
import { springGentle, exitTransition } from "../../../lib/springs";
import { cn } from "../../../lib/cn";

// ── Re-exports ────────────────────────────────────────────────────────────────

export const DialogRoot = Dialog.Root;
export const DialogTrigger = Dialog.Trigger;
export const DialogClose = Dialog.Close;

// ── Overlay ───────────────────────────────────────────────────────────────────

function DialogOverlay({ visible }: { visible: boolean }) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  return (
    <AnimatePresence>
      {visible && (
        <Dialog.Overlay forceMount asChild>
          <motion.div
            key="dialog-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.14, ease: "easeIn" } }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
            className="fixed inset-0 z-40"
            style={{
              background: "var(--tv-overlay-bg)",
              backdropFilter: "blur(var(--tv-overlay-blur))",
            }}
          />
        </Dialog.Overlay>
      )}
    </AnimatePresence>
  );
}

// ── Content wrapper ───────────────────────────────────────────────────────────

export interface DialogContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  /** Max width CSS value. Default: 480px */
  maxWidth?: string;
  /** Allow closing by clicking outside. Default: true */
  closeOnOutsideClick?: boolean;
  /** Allow closing by pressing Escape. Default: true */
  closeOnEscape?: boolean;
  /** Visual label for a11y. Required. */
  title: string;
  /** Visually hide the built-in title (when using a custom header). Default: false */
  hideTitle?: boolean;
}

export function DialogContent({
  open,
  onOpenChange,
  children,
  className,
  maxWidth = "480px",
  closeOnOutsideClick = true,
  closeOnEscape = true,
  title,
  hideTitle = false,
}: DialogContentProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  const contentVariants = {
    hidden: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.96, y: 4 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: shouldReduceMotion
      ? { opacity: 0, transition: exitTransition }
      : { opacity: 0, scale: 0.96, y: 4, transition: exitTransition },
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal forceMount>
        <DialogOverlay visible={open} />
        <AnimatePresence>
          {open && (
            <Dialog.Content
              forceMount
              asChild
              aria-describedby={undefined}
              onEscapeKeyDown={(e) => { if (!closeOnEscape) e.preventDefault(); }}
              onInteractOutside={(e) => { if (!closeOnOutsideClick) e.preventDefault(); }}
            >
              <motion.div
                key="dialog-content"
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={shouldReduceMotion ? { duration: 0 } : springGentle}
                className={cn(
                  "fixed z-50",
                  "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                  "w-[calc(100vw-48px)]",
                  "rounded-[var(--tv-radius-lg)]",
                  "border border-[var(--tv-border-strong)]",
                  "shadow-[var(--tv-shadow-lg)]",
                  "outline-none",
                  className,
                )}
                style={{
                  maxWidth,
                  background: "var(--tv-bg-overlay)",
                  backdropFilter: "blur(var(--tv-glass-blur))",
                }}
              >
                <Dialog.Title
                  className={cn(hideTitle && "sr-only")}
                  style={{ font: "var(--tv-type-headline)", color: "var(--tv-text-primary)", margin: 0 }}
                >
                  {title}
                </Dialog.Title>
                {children}
              </motion.div>
            </Dialog.Content>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Composed header row ───────────────────────────────────────────────────────

export interface DialogHeaderProps {
  title: string;
  description?: string;
  onClose: () => void;
}

export function DialogHeader({ title, description, onClose }: DialogHeaderProps) {
  return (
    <div
      className="flex items-start justify-between gap-4 px-6 pt-6 pb-4"
      style={{ borderBottom: "1px solid var(--tv-border-subtle)" }}
    >
      <div className="flex-1 min-w-0">
        <h2
          style={{ font: "var(--tv-type-headline)", color: "var(--tv-text-primary)", margin: 0 }}
          className="truncate"
        >
          {title}
        </h2>
        {description && (
          <Dialog.Description
            style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)", margin: "4px 0 0" }}
          >
            {description}
          </Dialog.Description>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close dialog"
        className={cn(
          "flex-shrink-0 flex items-center justify-center w-8 h-8",
          "rounded-[var(--tv-radius-sm)] border-0 cursor-pointer bg-transparent",
          "text-[var(--tv-text-secondary)]",
          "transition-colors duration-[120ms]",
          "hover:text-[var(--tv-text-primary)] hover:bg-[rgba(255,255,255,0.06)]",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--tv-accent-primary)]",
        )}
      >
        <Dismiss20Regular style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
}

// ── Dialog footer ─────────────────────────────────────────────────────────────

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-end gap-2 px-6 py-4"
      style={{ borderTop: "1px solid var(--tv-border-subtle)" }}
    >
      {children}
    </div>
  );
}
