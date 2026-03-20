import type { Transition } from "framer-motion";

// Snappy — small UI elements: badges, toggles, checkboxes, color swatches
export const springSnappy: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.8,
};

// Standard — most interactions: cards hover, button press, row selection
export const springStandard: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 30,
  mass: 1,
};

// Gentle — panels, modals, overlays sliding into view
export const springGentle: Transition = {
  type: "spring",
  stiffness: 280,
  damping: 26,
  mass: 1,
};

// Fluid — large surface transitions: page changes, sidebar expand
export const springFluid: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 32,
  mass: 1.0,
};

// Exit — always faster, no spring (exits should never overshoot)
export const exitTransition = {
  type: "tween",
  duration: 0.14,
  ease: [0.32, 0, 0.67, 0],
} as const;
