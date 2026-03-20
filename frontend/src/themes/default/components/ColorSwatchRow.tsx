import { useRef, useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Eyedropper20Regular } from "@fluentui/react-icons";
import { springSnappy } from "../../../lib/springs";
import { cn } from "../../../lib/cn";

// ── Preset palette ────────────────────────────────────────────────────────────

// These use raw hex values because the user picks a color, not a token.
// The selected value is stored as a hex string and referenced as an inline style.
const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue (accent)
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6b7280", // grey
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ColorSwatchRowProps {
  /** Currently selected color hex (e.g. "#3b82f6") or undefined for none. */
  value?: string;
  onChange: (hex: string | undefined) => void;
  className?: string;
}

// ── Swatch ────────────────────────────────────────────────────────────────────

interface SwatchProps {
  color: string;
  isSelected: boolean;
  onClick: () => void;
  shouldReduceMotion: boolean;
  label: string;
}

function Swatch({
  color,
  isSelected,
  onClick,
  shouldReduceMotion,
  label,
}: SwatchProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={`Set color to ${label}`}
      aria-pressed={isSelected}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.88 }}
      transition={springSnappy}
      className={cn(
        "relative flex-shrink-0 rounded-full border-0 p-0 cursor-pointer",
        "w-5 h-5",
        "focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--tv-accent-primary)] focus-visible:ring-offset-1",
        "focus-visible:ring-offset-[var(--tv-bg-overlay)]",
      )}
      style={{ background: color }}
    >
      {/* Selected ring */}
      {isSelected && (
        <motion.span
          initial={shouldReduceMotion ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springSnappy}
          className="absolute -inset-[3px] rounded-full border-2 pointer-events-none"
          style={{ borderColor: color }}
        />
      )}
    </motion.button>
  );
}

// ── ColorSwatchRow ────────────────────────────────────────────────────────────

export function ColorSwatchRow({ value, onChange, className }: ColorSwatchRowProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const pickerRef = useRef<HTMLInputElement>(null);

  // Local state for the custom picker to avoid laggy updates/API flooding.
  const [displayColor, setDisplayColor] = useState(value || "#ffffff");

  // Sync local state when value prop changes (e.g. from preset selection or external reset).
  useEffect(() => {
    if (value) setDisplayColor(value);
  }, [value]);

  // Debounce the actual change propagation.
  useEffect(() => {
    if (!value && displayColor === "#ffffff") return; // initial state
    if (displayColor === value) return; // already synced

    const timer = setTimeout(() => {
      onChange(displayColor);
    }, 200);

    return () => clearTimeout(timer);
  }, [displayColor, onChange, value]);

  const isCustom = value !== undefined && !PRESET_COLORS.includes(value);

  return (
    <div
      className={cn("flex items-center gap-2 flex-wrap", className)}
      role="radiogroup"
      aria-label="Folder color"
    >
      {PRESET_COLORS.map((hex) => (
        <Swatch
          key={hex}
          color={hex}
          isSelected={value === hex}
          onClick={() => onChange(value === hex ? undefined : hex)}
          shouldReduceMotion={shouldReduceMotion}
          label={hex}
        />
      ))}

      {/* Custom color picker trigger */}
      <div className="relative flex-shrink-0">
        <motion.button
          type="button"
          aria-label="Choose custom color"
          aria-pressed={isCustom}
          onClick={() => pickerRef.current?.click()}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.88 }}
          transition={springSnappy}
          className={cn(
            "w-5 h-5 rounded-full border cursor-pointer",
            "flex items-center justify-center",
            "focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[var(--tv-accent-primary)]",
            isCustom
              ? "border-[var(--tv-accent-primary)]"
              : "border-[var(--tv-border-strong)] bg-[var(--tv-bg-subtle)]",
          )}
          style={isCustom ? { background: displayColor } : undefined}
        >
          {!isCustom && (
            <Eyedropper20Regular
              style={{ width: 10, height: 10, color: "var(--tv-text-secondary)" }}
            />
          )}
        </motion.button>

        {/* Hidden native color input */}
        <input
          ref={pickerRef}
          type="color"
          value={displayColor}
          onInput={(e) => setDisplayColor((e.target as HTMLInputElement).value)}
          onChange={(e) => setDisplayColor((e.target as HTMLInputElement).value)}
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0,
            width: "100%",
            height: "100%",
            cursor: "pointer",
            padding: 0,
            border: "none",
          }}
        />
      </div>
    </div>
  );
}
