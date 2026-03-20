import { motion, useReducedMotion } from "framer-motion";
import {
  Grid20Regular,
  TextBulletListLtr20Regular,
  TableSimple20Regular,
} from "@fluentui/react-icons";
import { cn } from "../../../lib/cn";
import { springSnappy } from "../../../lib/springs";
import { Tooltip } from "./Tooltip";
import type { ViewMode } from "../../../store/uiStore";

// ── ViewToggle ────────────────────────────────────────────────────────────────

export interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

const MODES: { mode: ViewMode; label: string; icon: React.ComponentType<{ style?: React.CSSProperties }> }[] = [
  { mode: "grid", label: "Grid view (Ctrl+Shift+1)", icon: Grid20Regular },
  { mode: "list", label: "List view (Ctrl+Shift+2)", icon: TextBulletListLtr20Regular },
  { mode: "details", label: "Details view (Ctrl+Shift+3)", icon: TableSimple20Regular },
];

export function ViewToggle({ mode, onChange, className }: ViewToggleProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <div
      className={cn(
        "flex items-center rounded-[var(--tv-radius-sm)]",
        "border border-[var(--tv-border-subtle)]",
        "overflow-hidden bg-[var(--tv-bg-elevated)]",
        className,
      )}
      role="group"
      aria-label="View mode"
    >
      {MODES.map(({ mode: m, label, icon: Icon }) => {
        const isActive = mode === m;
        return (
          <Tooltip key={m} content={label} side="bottom">
            <motion.button
              type="button"
              aria-label={label}
              aria-pressed={isActive}
              onClick={() => onChange(m)}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
              transition={springSnappy}
              className={cn(
                "relative flex items-center justify-center w-8 h-8",
                "border-0 cursor-pointer transition-colors duration-[120ms]",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset",
                "focus-visible:ring-[var(--tv-accent-primary)]",
                isActive
                  ? "bg-[var(--tv-accent-container)] text-[var(--tv-accent-on-container)]"
                  : "bg-transparent text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)]",
                // M3 state layer
                "after:absolute after:inset-0 after:pointer-events-none after:content-['']",
                "after:transition-[background] after:duration-[120ms]",
                !isActive && "hover:after:bg-[rgba(255,255,255,0.06)] active:after:bg-[rgba(255,255,255,0.10)]",
              )}
            >
              <Icon style={{ width: 16, height: 16 }} />
            </motion.button>
          </Tooltip>
        );
      })}
    </div>
  );
}
