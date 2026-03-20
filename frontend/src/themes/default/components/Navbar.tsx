import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, useReducedMotion } from "framer-motion";
import {
  Alert20Regular,
  Settings20Regular,
  Search20Regular,
  SignOut20Regular,
  Heart20Regular,
} from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../../store/authStore";
import { useUIStore } from "../../../store/uiStore";
import { Button, IconButton } from "./Button";
import { Tooltip } from "./Tooltip";
import { Separator } from "./Separator";
import { cn } from "../../../lib/cn";
import { springSnappy } from "../../../lib/springs";

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ src, initial }: { src?: string | null; initial: string }) {
  const [imgError, setImgError] = useState(false);
  if (src && !imgError) {
    return (
      <img
        src={src}
        alt="avatar"
        width={28}
        height={28}
        style={{
          borderRadius: "var(--tv-radius-full)",
          objectFit: "cover",
          flexShrink: 0,
        }}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "var(--tv-radius-full)",
        background: "var(--tv-accent-container)",
        border: "1px solid var(--tv-accent-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        font: "var(--tv-type-label)",
        color: "var(--tv-accent-on-container)",
        flexShrink: 0,
      }}
    >
      {initial.toUpperCase()}
    </div>
  );
}

// ── Navbar ─────────────────────────────────────────────────────────────────────

export interface NavbarProps {
  /** Called when the Settings menu item is clicked */
  onSettingsClick?: () => void;
}

export function Navbar({ onSettingsClick }: NavbarProps) {
  const shouldReduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { user, logout, avatarDataUrl } = useAuthStore();
  const { setSearchOpen, setActivePanel, activePanel } = useUIStore();

  const userInitial =
    user?.first_name?.charAt(0) ??
    user?.username?.charAt(0) ??
    "T";
  const activityOpen = activePanel === "activity";

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: "var(--tv-navbar-height)",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "0 16px",
        background: "var(--tv-bg-glass)",
        backdropFilter: "blur(var(--tv-glass-blur))",
        borderBottom: "1px solid var(--tv-border-subtle)",
        flexShrink: 0,
      }}
    >
      {/* Left — logo/wordmark */}
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
        <button
          type="button"
          onClick={() => navigate("/browse")}
          aria-label="TeleVault — go to browse"
          style={{
            font: "var(--tv-type-title-lg)",
            color: "var(--tv-text-primary)",
            cursor: "pointer",
            userSelect: "none",
            flexShrink: 0,
            letterSpacing: "-0.02em",
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          TeleVault
        </button>
      </div>

      {/* Center — search trigger */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className={cn(
            "relative flex items-center gap-2",
            "h-7 px-3 rounded-[var(--tv-radius-sm)]",
            "border border-[var(--tv-border-subtle)]",
            "bg-[var(--tv-bg-subtle)] cursor-pointer",
            "overflow-hidden",
            "after:absolute after:inset-0 after:rounded-[inherit]",
            "after:content-[''] after:pointer-events-none",
            "after:transition-[background-color] after:duration-[120ms]",
            "hover:after:bg-[rgba(255,255,255,0.06)]",
          )}
          style={{
            font: "var(--tv-type-body-sm)",
            color: "var(--tv-text-disabled)",
            width: "clamp(160px, 30vw, 320px)",
          }}
        >
          <Search20Regular style={{ width: 14, height: 14, flexShrink: 0 }} />
          Search files and folders…
        </button>
      </div>

      {/* Right — actions */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
        <Tooltip content="Support the project">
          <Button
            variant="secondary"
            size="sm"
            icon={<Heart20Regular className="text-[var(--tv-accent-primary)]" />}
            onClick={() => window.open("https://revolut.me/elpideus", "_blank")}
            className="px-3 font-semibold"
          >
            Donate
          </Button>
        </Tooltip>

        <Tooltip content="Toggle activity panel">
          <IconButton
            icon={<Alert20Regular />}
            label="Activity feed"
            size="sm"
            onClick={() => setActivePanel(activityOpen ? null : "activity")}
            onMouseDown={(e) => e.stopPropagation()}
            style={
              activityOpen
                ? {
                    background: "var(--tv-accent-container)",
                    color: "var(--tv-accent-on-container)",
                  }
                : undefined
            }
          />
        </Tooltip>

        {/* Vertical separator — use wrapper div since Separator doesn't accept style */}
        <div className="w-px bg-[var(--tv-border-subtle)] shrink-0 mx-1" style={{ height: 20 }} />

        {/* Avatar dropdown */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="User menu"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              <Avatar src={avatarDataUrl} initial={userInitial} />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              asChild
            >
              <motion.div
                initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.94, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.94, y: -4 }}
                transition={springSnappy}
                style={{
                  minWidth: 180,
                  padding: "4px",
                  borderRadius: "var(--tv-radius-md)",
                  background: "var(--tv-bg-overlay)",
                  border: "1px solid var(--tv-border-default)",
                  boxShadow: "var(--tv-shadow-md)",
                  zIndex: 200,
                }}
              >
                {user && (
                  <>
                    <div
                      style={{
                        padding: "8px 10px",
                        font: "var(--tv-type-label-sm)",
                        color: "var(--tv-text-disabled)",
                      }}
                    >
                      {user.username ? `@${user.username}` : (user.first_name ?? "Telegram User")}
                    </div>
                    {/* Separator between user info and menu items */}
                    <Separator className="my-1" />
                  </>
                )}

                <DropdownMenu.Item asChild>
                  <button
                    type="button"
                    onClick={onSettingsClick}
                    className={cn(
                      "relative w-full flex items-center gap-2",
                      "h-8 px-3 rounded-[var(--tv-radius-sm)]",
                      "cursor-pointer border-0 text-left",
                      "overflow-hidden",
                      "after:absolute after:inset-0 after:rounded-[inherit]",
                      "after:content-[''] after:pointer-events-none",
                      "after:transition-[background-color] after:duration-[120ms]",
                      "hover:after:bg-[rgba(255,255,255,0.06)]",
                    )}
                    style={{
                      background: "none",
                      font: "var(--tv-type-body-sm)",
                      color: "var(--tv-text-primary)",
                    }}
                  >
                    <Settings20Regular style={{ width: 16, height: 16 }} />
                    Settings
                  </button>
                </DropdownMenu.Item>

                {/* Separator between menu sections */}
                <Separator className="my-1" />

                <DropdownMenu.Item asChild>
                  <button
                    type="button"
                    onClick={logout}
                    className={cn(
                      "relative w-full flex items-center gap-2",
                      "h-8 px-3 rounded-[var(--tv-radius-sm)]",
                      "cursor-pointer border-0 text-left",
                      "overflow-hidden",
                      "after:absolute after:inset-0 after:rounded-[inherit]",
                      "after:content-[''] after:pointer-events-none",
                      "after:transition-[background-color] after:duration-[120ms]",
                      "hover:after:bg-[rgba(255,255,255,0.06)]",
                    )}
                    style={{
                      background: "none",
                      font: "var(--tv-type-body-sm)",
                      color: "var(--tv-error)",
                    }}
                  >
                    <SignOut20Regular style={{ width: 16, height: 16 }} />
                    Log out
                  </button>
                </DropdownMenu.Item>
              </motion.div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
