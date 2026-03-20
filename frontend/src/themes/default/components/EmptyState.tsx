import { motion, useReducedMotion } from "framer-motion";
import {
  FolderOpen24Regular,
  Search24Regular,
  PlugConnectedSettings24Regular,
  CloudArrowUp24Regular,
} from "@fluentui/react-icons";
import { springGentle } from "../../../lib/springs";
import { Button } from "./Button";
import { cn } from "../../../lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmptyStateVariant =
  | "empty-folder"
  | "no-results"
  | "no-channels"
  | "welcome";

export interface EmptyStateProps {
  variant: EmptyStateVariant;
  /** For "no-results" — the query string to display */
  query?: string;
  onAction?: () => void;
  onSecondaryAction?: () => void;
  onDismiss?: () => void; // for "welcome"
  className?: string;
}

// ── Config per variant ────────────────────────────────────────────────────────

interface VariantConfig {
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  iconColor: string;
  title: string;
  description: string;
  actionLabel?: string;
  secondaryActionLabel?: string;
}

function getConfig(variant: EmptyStateVariant, query?: string): VariantConfig {
  switch (variant) {
    case "empty-folder":
      return {
        icon: FolderOpen24Regular,
        iconColor: "var(--tv-text-disabled)",
        title: "This folder is empty",
        description: "Drop files here or use the Upload button to add files.",
        actionLabel: "Upload files",
        secondaryActionLabel: "New Folder",
      };

    case "no-results":
      return {
        icon: Search24Regular,
        iconColor: "var(--tv-text-disabled)",
        title: query ? `No results for "${query}"` : "No results",
        description:
          "Try a different search term or check the spelling.",
      };

    case "no-channels":
      return {
        icon: PlugConnectedSettings24Regular,
        iconColor: "var(--tv-accent-primary)",
        title: "No channels configured",
        description:
          "Connect a Telegram channel to start uploading and managing your files.",
        actionLabel: "Add a channel",
      };

    case "welcome":
      return {
        icon: CloudArrowUp24Regular,
        iconColor: "var(--tv-accent-primary)",
        title: "Welcome to TeleVault",
        description:
          "Your encrypted cloud vault powered by Telegram. Upload your first file to get started.",
        actionLabel: "Upload your first file",
      };
  }
}

// ── EmptyState ────────────────────────────────────────────────────────────────

export function EmptyState({
  variant,
  query,
  onAction,
  onSecondaryAction,
  onDismiss,
  className,
}: EmptyStateProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const config = getConfig(variant, query);
  const Icon = config.icon;

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springGentle}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "px-8 py-16 gap-4",
        className,
      )}
    >
      {/* Icon in a subtle container circle */}
      <motion.div
        initial={shouldReduceMotion ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...springGentle, delay: shouldReduceMotion ? 0 : 0.06 }}
        className={cn(
          "flex items-center justify-center",
          "w-16 h-16 rounded-full",
          "bg-[var(--tv-bg-elevated)] border border-[var(--tv-border-subtle)]",
        )}
      >
        <Icon style={{ width: 28, height: 28, color: config.iconColor }} />
      </motion.div>

      {/* Text */}
      <div className="flex flex-col gap-2 max-w-xs">
        <h3
          style={{
            font: "var(--tv-type-title-lg)",
            color: "var(--tv-text-primary)",
            margin: 0,
          }}
        >
          {config.title}
        </h3>
        <p
          style={{
            font: "var(--tv-type-body-sm)",
            color: "var(--tv-text-secondary)",
            margin: 0,
          }}
        >
          {config.description}
        </p>
      </div>

      {/* Actions */}
      {(config.actionLabel || config.secondaryActionLabel || variant === "welcome") && (
        <div className="flex items-center gap-2 mt-1">
          {config.actionLabel && onAction && (
            <Button variant="primary" onClick={onAction}>
              {config.actionLabel}
            </Button>
          )}
          {config.secondaryActionLabel && onSecondaryAction && (
            <Button variant="secondary" onClick={onSecondaryAction}>
              {config.secondaryActionLabel}
            </Button>
          )}
          {variant === "welcome" && onDismiss && (
            <Button variant="ghost" onClick={onDismiss}>
              Maybe later
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
