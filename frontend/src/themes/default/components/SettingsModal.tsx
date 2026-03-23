import { useState, useEffect } from "react";
import { Dismiss20Regular } from "@fluentui/react-icons";
import { AnimatePresence, motion } from "framer-motion";
import { DialogContent } from "./DialogBase";
import { IconButton } from "./Button";
import { cn } from "../../../lib/cn";
import {
  AppearancePanel,
  ChannelsPanel,
  AccountsPanel,
  KeybindsPanel,
  AboutPanel,
} from "./SettingsPanels";

// ── Panel type ─────────────────────────────────────────────────────────────────

export type SettingsPanel =
  | "appearance"
  | "channels"
  | "accounts"
  | "keybinds"
  | "about";

const NAV_ITEMS: { id: SettingsPanel; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "channels",   label: "Channels" },
  { id: "accounts",   label: "Accounts" },
  { id: "keybinds",   label: "Keybinds" },
  { id: "about",      label: "About" },
];

// ── Props ──────────────────────────────────────────────────────────────────────

export interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── SettingsModal ──────────────────────────────────────────────────────────────

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [activePanel, setActivePanel] = useState<SettingsPanel>("appearance");

  // Reset to "appearance" whenever the modal closes
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => setActivePanel("appearance"), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  return (
    <DialogContent
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      hideTitle={true}
      maxWidth="min(92vw, 960px)"
      closeOnOutsideClick={true}
    >
      {/* Inner wrapper sets the height — DialogContent has no height prop */}
      <div
        style={{
          height: "min(92vh, 640px)",
          display: "flex",
          overflow: "hidden",
          borderRadius: "var(--tv-radius-lg)",
          position: "relative",
        }}
      >
        {/* ── Left nav ──────────────────────────────────────────────── */}
        <nav
          style={{
            width: 200,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--tv-bg-elevated)",
            borderRight: "1px solid var(--tv-border-subtle)",
            borderRadius: "var(--tv-radius-lg) 0 0 var(--tv-radius-lg)",
            padding: "0 8px 8px",
          }}
          aria-label="Settings navigation"
        >
          <p
            style={{
              font: "var(--tv-type-label-sm)",
              color: "var(--tv-text-disabled)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "16px 8px 8px",
              margin: 0,
              flexShrink: 0,
            }}
          >
            Settings
          </p>

          <div style={{ flex: 1 }}>
            {NAV_ITEMS.map((item) => {
              const isActive = activePanel === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivePanel(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative w-full text-left border-0 cursor-pointer",
                    "h-9 px-3 rounded-[var(--tv-radius-sm)]",
                    "overflow-hidden",
                    !isActive && [
                      "after:absolute after:inset-0 after:rounded-[inherit]",
                      "after:content-[''] after:pointer-events-none",
                      "after:transition-[background-color] after:duration-[120ms]",
                      "hover:after:bg-[rgba(255,255,255,0.06)]",
                    ],
                  )}
                  style={{
                    font: "var(--tv-type-body-sm)",
                    background: isActive ? "var(--tv-accent-container)" : "transparent",
                    color: isActive
                      ? "var(--tv-accent-on-container)"
                      : "var(--tv-text-primary)",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

        </nav>

        {/* ── Right panel slot ─────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 28px",
            background: "var(--tv-bg-overlay)",
            borderRadius: "0 var(--tv-radius-lg) var(--tv-radius-lg) 0",
          }}
        >
          {/* Panel switcher with fade transition */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activePanel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeInOut" }}
              style={{ minHeight: "100%" }}
            >
              {activePanel === "appearance" && <AppearancePanel />}
              {activePanel === "channels"   && <ChannelsPanel />}
              {activePanel === "accounts"   && <AccountsPanel />}
              {activePanel === "keybinds"   && <KeybindsPanel />}
              {activePanel === "about"      && <AboutPanel />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Global close button (top right) */}
        <div style={{ position: "absolute", top: 16, right: 16, zIndex: 50 }}>
          <IconButton
            icon={<Dismiss20Regular />}
            label="Close settings"
            size="sm"
            onClick={() => onOpenChange(false)}
          />
        </div>
      </div>
    </DialogContent>
  );
}
