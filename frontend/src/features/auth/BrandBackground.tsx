// src/features/auth/BrandBackground.tsx
import { motion, useReducedMotion } from "framer-motion";
import { springFluid } from "../../lib/springs";

// Each blob: base position (viewport-relative) + 3 drift waypoints (px offsets).
const BLOBS: {
  base: { left: string; top: string };
  waypoints: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
}[] = [
  {
    base: { left: "-10%", top: "-10%" },
    waypoints: [{ x: -100, y: -100 }, { x: 50, y: 100 }, { x: -80, y: 200 }],
  },
  {
    base: { left: "60%", top: "-5%" },
    waypoints: [{ x: 100, y: 50 }, { x: -60, y: -80 }, { x: 120, y: 160 }],
  },
  {
    base: { left: "30%", top: "55%" },
    waypoints: [{ x: -40, y: 120 }, { x: 80, y: -60 }, { x: -100, y: -40 }],
  },
];

function AnimatedBlob({
  base,
  waypoints,
  delaySeconds,
}: {
  base: { left: string; top: string };
  waypoints: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  delaySeconds: number;
}) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      initial={{ x: 0, y: 0 }}
      animate={
        shouldReduce
          ? { x: 0, y: 0 }
          : {
              x: [waypoints[0].x, waypoints[1].x, waypoints[2].x],
              y: [waypoints[0].y, waypoints[1].y, waypoints[2].y],
            }
      }
      transition={
        shouldReduce
          ? { duration: 0 }
          : {
              ...springFluid,
              duration: 18,
              repeat: Infinity,
              repeatType: "reverse",
              delay: delaySeconds,
            }
      }
      style={{
        position: "absolute",
        left: base.left,
        top: base.top,
        width: 600,
        height: 600,
        borderRadius: "50%",
        background:
          "radial-gradient(circle, var(--tv-accent-subtle) 0%, transparent 70%)",
        mixBlendMode: "screen",
        pointerEvents: "none",
        transform: "translate(-50%, -50%)",
        willChange: "transform",
      }}
    />
  );
}

export function BrandBackground() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        background: "var(--tv-bg-base)",
        overflow: "hidden",
      }}
    >
      {/* SVG noise layer */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.04,
          pointerEvents: "none",
        }}
      >
        <filter id="tv-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves={3}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#tv-noise)" />
      </svg>

      {/* Animated accent blobs */}
      {BLOBS.map((blob, i) => (
        <AnimatedBlob
          key={i}
          base={blob.base}
          waypoints={blob.waypoints}
          delaySeconds={i * 3}
        />
      ))}
    </div>
  );
}
