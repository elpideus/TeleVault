import { Folder20Regular, FolderOpen20Regular } from "@fluentui/react-icons";
import { useAuthenticatedImage } from "../../../hooks/useAuthenticatedImage";

// ── FolderIcon ────────────────────────────────────────────────────────────────

export interface FolderIconProps {
  /** CSS var string such as "var(--tv-accent-primary)". If not set, falls back to neutral grey. */
  iconColor?: string;
  /** Authenticated API URL for a custom folder image. Takes precedence over iconColor. */
  iconImage?: string;
  /** Show open-folder variant (when expanded in tree, or on hover). */
  open?: boolean;
  /** Size in px. Defaults to 20. */
  size?: number;
  className?: string;
}

export function FolderIcon({
  iconColor,
  iconImage,
  open = false,
  size = 20,
  className,
}: FolderIconProps) {
  const blobUrl = useAuthenticatedImage(iconImage);
  const color = iconColor ?? "var(--tv-text-secondary)";
  const Icon = open ? FolderOpen20Regular : Folder20Regular;

  return (
    <span
      className={className}
      style={{ display: "inline-flex", flexShrink: 0 }}
    >
      {blobUrl ? (
        <img
          src={blobUrl}
          alt=""
          style={{ width: size, height: size, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
        />
      ) : (
        <Icon style={{ width: size, height: size, color, flexShrink: 0 }} />
      )}
    </span>
  );
}
