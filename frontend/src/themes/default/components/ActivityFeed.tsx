import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import {
  ArrowUpload20Regular,
  ArrowDownload20Regular,
  Delete20Regular,
  Rename20Regular,
  ArrowMove20Regular,
  FolderAdd20Regular,
  History20Regular,
  Dismiss20Regular,
} from "@fluentui/react-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../../../store/uiStore";
import { useAuthStore } from "../../../store/authStore";
import { formatRelativeTime } from "../../../lib/formatRelativeTime";
import { listEvents, eventKeys, createActivitySource } from "../../../api/events";
import { springGentle, exitTransition } from "../../../lib/springs";
import { IconButton } from "./Button";
import type { EventOut } from "../../../api/schema";
import { useClickOutside } from "../../../hooks/useClickOutside";

// ── Icon resolver ──────────────────────────────────────────────────────────────

function getEventIcon(action: string): React.ReactElement {
  switch (action) {
    case "file.upload":
    case "file_uploaded":   return <ArrowUpload20Regular />;
    case "file.download":
    case "file_downloaded": return <ArrowDownload20Regular />;
    case "file.delete":
    case "file_deleted":    return <Delete20Regular />;
    case "file.rename":
    case "file_renamed":    return <Rename20Regular />;
    case "file.move":
    case "file.copy":
    case "file_moved":      return <ArrowMove20Regular />;
    case "folder.create":
    case "folder_created":  return <FolderAdd20Regular />;
    case "folder.delete":
    case "folder_deleted":  return <Delete20Regular />;
    case "folder.rename":
    case "folder_renamed":  return <Rename20Regular />;
    case "folder.move":
    case "folder.copy":     return <ArrowMove20Regular />;
    case "folder.icon_upload": return <ArrowUpload20Regular />;
    default:                return <History20Regular />;
  }
}

// ── Description builder ────────────────────────────────────────────────────────

function describeEvent(event: EventOut): string {
  const name = event.target_name ?? undefined;
  const q = (n: string | undefined, fallback: string) =>
    n ? `"${n}"` : fallback;

  switch (event.action) {
    case "file.upload":
    case "file_uploaded":      return `Uploaded ${q(name, "a file")}`;
    case "file.download":
    case "file_downloaded":    return `Downloaded ${q(name, "a file")}`;
    case "file.delete":
    case "file_deleted":       return `Deleted ${q(name, "a file")}`;
    case "file.rename":
    case "file_renamed":       return `Renamed ${q(name, "a file")}`;
    case "file.move":
    case "file_moved":         return `Moved ${q(name, "a file")}`;
    case "file.copy":          return `Copied ${q(name, "a file")}`;
    case "folder.create":
    case "folder_created":     return `Created folder ${q(name, "")}`.trimEnd();
    case "folder.delete":
    case "folder_deleted":     return `Deleted folder ${q(name, "")}`.trimEnd();
    case "folder.rename":
    case "folder_renamed":     return `Renamed folder ${q(name, "")}`.trimEnd();
    case "folder.move":        return `Moved folder ${q(name, "")}`.trimEnd();
    case "folder.copy":        return `Copied folder ${q(name, "")}`.trimEnd();
    case "folder.icon_upload": return `Updated icon for ${q(name, "a folder")}`;
    default: return event.action;
  }
}

// ── ActivityFeedEmpty ──────────────────────────────────────────────────────────

export function ActivityFeedEmpty() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 8,
        padding: "32px 16px",
      }}
    >
      <History20Regular
        style={{ width: 32, height: 32, color: "var(--tv-text-disabled)" }}
      />
      <p
        style={{
          font: "var(--tv-type-body-sm)",
          color: "var(--tv-text-secondary)",
          margin: 0,
          textAlign: "center",
        }}
      >
        No recent activity
      </p>
    </div>
  );
}

// ── ActivityItem ───────────────────────────────────────────────────────────────

export interface ActivityItemProps {
  event: EventOut;
  isLast?: boolean;
}

export function ActivityItem({ event, isLast = false }: ActivityItemProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 16px",
        borderBottom: isLast ? "none" : "1px solid var(--tv-border-subtle)",
      }}
    >
      {/* Icon circle */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "var(--tv-accent-container)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: "var(--tv-accent-on-container)",
        }}
      >
        <span style={{ display: "flex", width: 16, height: 16 }}>
          {getEventIcon(event.action)}
        </span>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            font: "var(--tv-type-body-sm)",
            color: "var(--tv-text-primary)",
            margin: 0,
            wordBreak: "break-word",
          }}
        >
          {describeEvent(event)}
        </p>
        <p
          style={{
            font: "var(--tv-type-label-sm)",
            color: "var(--tv-text-disabled)",
            margin: "2px 0 0",
          }}
        >
          {formatRelativeTime(event.created_at)}
        </p>
      </div>
    </div>
  );
}

// ── ActivityFeed ───────────────────────────────────────────────────────────────

export function ActivityFeed() {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const { activePanel, setActivePanel } = useUIStore();
  const isOpen = activePanel === "activity";
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  const sidePanelRef = useRef<HTMLElement>(null);
  useClickOutside(sidePanelRef, () => setActivePanel(null), isOpen);

  const { data, isLoading } = useQuery({
    queryKey: eventKeys.list(),
    queryFn: () => listEvents(1, 50),
    enabled: isOpen,
  });
  const events: EventOut[] = data?.items ?? [];

  // Real-time updates via SSE — refetch whenever the backend emits a new event.
  // Uses exponential backoff on connection errors to avoid hammering the server
  // when the SSE transport fails (e.g. ERR_QUIC_PROTOCOL_ERROR).
  useEffect(() => {
    if (!token) return;
    let source: EventSource | null = null;
    let retryDelay = 2000; // start at 2 s
    const MAX_DELAY = 60_000; // cap at 60 s
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      source = createActivitySource(token);
      source.onmessage = () => {
        retryDelay = 2000; // reset on success
        queryClient.invalidateQueries({ queryKey: eventKeys.all });
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (stopped) return;
        // Exponential backoff — prevents QUIC-error console spam
        timeoutId = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, MAX_DELAY);
          connect();
        }, retryDelay);
      };
    };

    connect();
    return () => {
      stopped = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      source?.close();
    };
  }, [token, queryClient]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          ref={sidePanelRef}
          key="activity-feed"
          initial={shouldReduceMotion ? { opacity: 0 } : { x: 320, opacity: 1 }}
          animate={{ x: 0, opacity: 1 }}
          exit={
            shouldReduceMotion
              ? { opacity: 0, transition: { duration: 0 } }
              : { x: 320, opacity: 1, transition: exitTransition }
          }
          transition={shouldReduceMotion ? { duration: 0 } : springGentle}
          style={{
            position: "fixed",
            top: "var(--tv-navbar-height)",
            right: 0,
            bottom: 0,
            width: 320,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            background: "var(--tv-bg-glass)",
            backdropFilter: "blur(var(--tv-glass-blur))",
            borderLeft: "1px solid var(--tv-border-subtle)",
            boxShadow: "var(--tv-shadow-lg)",
          }}
          aria-label="Activity feed"
        >
          {/* Header */}
          <div
            style={{
              height: 48,
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--tv-border-subtle)",
              flexShrink: 0,
            }}
          >
            <h2
              style={{
                font: "var(--tv-type-title-lg)",
                color: "var(--tv-text-primary)",
                margin: 0,
              }}
            >
              Activity
            </h2>
            <IconButton
              icon={<Dismiss20Regular />}
              label="Close activity feed"
              size="sm"
              onClick={() => setActivePanel(null)}
            />
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {isLoading ? (
              <ActivityFeedEmpty />
            ) : events.length === 0 ? (
              <ActivityFeedEmpty />
            ) : (
              events.map((event, i) => (
                <ActivityItem
                  key={event.id}
                  event={event}
                  isLast={i === events.length - 1}
                />
              ))
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
