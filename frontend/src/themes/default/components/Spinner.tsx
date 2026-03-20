import { motion, useReducedMotion } from "framer-motion";

type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

const dimensions: Record<SpinnerSize, { d: number; sw: number }> = {
  sm: { d: 14, sw: 1.5 },
  md: { d: 20, sw: 2 },
  lg: { d: 28, sw: 2.5 },
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  const shouldReduceMotion = useReducedMotion();
  const { d, sw } = dimensions[size];
  const r = (d - sw * 2) / 2;
  const cx = d / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <motion.svg
      width={d}
      height={d}
      viewBox={`0 0 ${d} ${d}`}
      fill="none"
      className={className}
      style={{ display: "block", color: "inherit", flexShrink: 0 }}
      animate={shouldReduceMotion ? undefined : { rotate: 360 }}
      transition={
        shouldReduceMotion
          ? undefined
          : { repeat: Infinity, duration: 0.75, ease: "linear" }
      }
    >
      {/* Background track */}
      <circle
        cx={cx}
        cy={cx}
        r={r}
        stroke="currentColor"
        strokeWidth={sw}
        opacity={0.2}
      />
      {/* Spinning arc */}
      <circle
        cx={cx}
        cy={cx}
        r={r}
        stroke="currentColor"
        strokeWidth={sw}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * 0.72}
        strokeLinecap="round"
      />
    </motion.svg>
  );
}
