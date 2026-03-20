import { Separator as PanelSeparator } from "react-resizable-panels";
import { cn } from "../../../lib/cn";

export interface ResizeHandleProps {
  className?: string;
}

export function ResizeHandle({ className }: ResizeHandleProps) {
  return (
    <PanelSeparator
      className={cn(
        "w-[1px] relative",
        "bg-[var(--tv-border-subtle)]",
        "transition-colors duration-[120ms]",
        "data-[separator=hover]:bg-[var(--tv-border-default)]",
        "data-[separator=active]:bg-[var(--tv-accent-primary)]",
        "before:absolute before:inset-y-0 before:-left-[3px] before:w-[7px]",
        "before:content-[''] before:cursor-col-resize",
        className,
      )}
    />
  );
}
