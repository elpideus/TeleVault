import { forwardRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../../lib/cn";
import { springSnappy } from "../../../lib/springs";
import { Spinner } from "./Spinner";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

// Framer Motion's motion.button overrides these HTML event types with its own
// definitions. Omitting them from HTMLButtonElement props prevents type conflicts
// when spreading rest props onto motion.button.
type MotionSafeButtonProps = Omit<
  React.ComponentPropsWithoutRef<"button">,
  "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart"
>;

export interface ButtonProps extends MotionSafeButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Leading icon slot */
  icon?: React.ReactNode;
}

export interface IconButtonProps extends MotionSafeButtonProps {
  /** The icon to display */
  icon: React.ReactNode;
  /** Required for accessibility */
  label: string;
  size?: ButtonSize;
  variant?: "ghost" | "secondary";
}

// ── Variant styles ────────────────────────────────────────────────────────────

const variantBase =
  // Layout, overflow, and the M3 state-layer ::after overlay
  "relative inline-flex items-center justify-center overflow-hidden " +
  "select-none cursor-pointer font-medium " +
  "border transition-[border-color,opacity] " +
  // State layer via ::after pseudo-element
  "after:absolute after:inset-0 after:rounded-[inherit] " +
  "after:content-[''] after:pointer-events-none " +
  "after:transition-[background-color] after:duration-[120ms] " +
  "hover:after:bg-[rgba(255,255,255,0.06)] " +
  "active:after:bg-[rgba(255,255,255,0.10)] " +
  "focus-visible:after:bg-[rgba(255,255,255,0.10)] " +
  // Focus ring
  "focus-visible:outline-none focus-visible:ring-1 " +
  "focus-visible:ring-[var(--tv-accent-ring)] " +
  "focus-visible:ring-offset-0 " +
  "focus-visible:ring-offset-transparent " +
  // Disabled
  "disabled:cursor-not-allowed disabled:opacity-40";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--tv-accent-primary)] text-[var(--tv-accent-on)] border-transparent",
  secondary:
    "bg-[var(--tv-bg-elevated)] text-[var(--tv-text-primary)] border-[var(--tv-border-default)]",
  ghost: "bg-transparent text-[var(--tv-text-primary)] border-transparent",
  danger: "bg-[var(--tv-error)] text-white border-transparent",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-7 px-3 gap-1.5 rounded-[var(--tv-radius-sm)] duration-[120ms]",
  md: "h-8 px-4 gap-2   rounded-[var(--tv-radius-sm)] duration-[120ms]",
  lg: "h-10 px-5 gap-2  rounded-[var(--tv-radius-sm)] duration-[120ms]",
};

const fontStyles: Record<ButtonSize, string> = {
  sm: "var(--tv-type-body-sm)",
  md: "var(--tv-type-body)",
  lg: "var(--tv-type-title-sm)",
};

// ── Button ────────────────────────────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      icon,
      children,
      className,
      ...rest
    },
    ref,
  ) => {
    const shouldReduceMotion = useReducedMotion();
    const isDisabled = disabled ?? false;
    const isLoading = loading;

    return (
      <motion.button
        ref={ref as React.Ref<HTMLButtonElement>}
        disabled={isDisabled || isLoading}
        whileTap={
          isDisabled || isLoading || shouldReduceMotion
            ? undefined
            : { scale: 0.96 }
        }
        transition={springSnappy}
        className={cn(
          variantBase,
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        style={{ font: fontStyles[size] }}
        {...rest}
      >
        {/* Spinner overlay — keeps button size stable */}
        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Spinner
              size="sm"
              className={
                variant === "primary" || variant === "danger"
                  ? "text-white"
                  : "text-[var(--tv-text-primary)]"
              }
            />
          </span>
        )}

        {/* Content — invisible while loading keeps the button width stable */}
        <span
          className={cn(
            "inline-flex items-center gap-[inherit]",
            isLoading && "invisible",
          )}
        >
          {icon}
          {children}
        </span>
      </motion.button>
    );
  },
);
Button.displayName = "Button";

// ── IconButton ────────────────────────────────────────────────────────────────

const iconSizeStyles: Record<ButtonSize, string> = {
  sm: "w-6 h-6 rounded-[var(--tv-radius-sm)]",
  md: "w-8 h-8 rounded-[var(--tv-radius-sm)]",
  lg: "w-9 h-9 rounded-[var(--tv-radius-md)]",
};

const iconVariantStyles: Record<"ghost" | "secondary", string> = {
  ghost: "bg-transparent border-transparent text-[var(--tv-text-secondary)]",
  secondary:
    "bg-[var(--tv-bg-elevated)] border-[var(--tv-border-default)] text-[var(--tv-text-secondary)]",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { icon, label, size = "md", variant = "ghost", disabled, className, ...rest },
    ref,
  ) => {
    const shouldReduceMotion = useReducedMotion();

    return (
      <motion.button
        ref={ref as React.Ref<HTMLButtonElement>}
        aria-label={label}
        disabled={disabled}
        whileTap={disabled || shouldReduceMotion ? undefined : { scale: 0.88 }}
        transition={springSnappy}
        className={cn(
          variantBase,
          iconVariantStyles[variant],
          iconSizeStyles[size],
          "p-0",
          className,
        )}
        {...rest}
      >
        {icon}
      </motion.button>
    );
  },
);
IconButton.displayName = "IconButton";
