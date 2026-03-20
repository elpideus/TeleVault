import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Checkmark20Regular, Globe20Regular, Delete20Regular, Add20Regular, PersonAccounts20Regular, Edit20Regular, SignOut20Regular, Heart24Regular } from "@fluentui/react-icons";
import { useThemeStore } from "../../../store/themeStore";
import { ColorSwatchRow } from "./ColorSwatchRow";
import { Badge } from "./Badge";
import { toast } from "../../../lib/toast";
import { channelKeys, listChannels, setDefaultChannel, unsetDefaultChannel } from "../../../api/channels";
import type { ChannelOut } from "../../../api/schema";
import { ChannelPicker } from "../../../features/auth/ChannelPicker";
import { Button } from "./Button";
import { ConfirmModal } from "./ConfirmModal";
import { useAuthStore } from "../../../store/authStore";
import { useKeybindStore } from "../../../store/keybindStore";
import { useUIStore } from "../../../store/uiStore";
import { type ActionId } from "../../../lib/keybinds";
import { Kbd } from "./Kbd";
import { Separator } from "./Separator";
import { Tooltip } from "./Tooltip";

// ── PanelSection ───────────────────────────────────────────────────────────────

export function PanelSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h3
        style={{
          font: "var(--tv-type-headline)",
          color: "var(--tv-text-primary)",
          margin: "0 0 16px",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

// ── SettingRow ─────────────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 0",
        borderBottom: "1px solid var(--tv-border-subtle)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            font: "var(--tv-type-body-sm)",
            color: "var(--tv-text-primary)",
            margin: 0,
          }}
        >
          {label}
        </p>
        {description && (
          <p
            style={{
              font: "var(--tv-type-label-sm)",
              color: "var(--tv-text-secondary)",
              margin: "2px 0 0",
            }}
          >
            {description}
          </p>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}


// ── AppearancePanel ────────────────────────────────────────────────────────────

export function AppearancePanel() {
  const { activeTheme } = useThemeStore();

  const THEMES = [
    { id: "default", label: "Default Dark", color: "#0d0d0f" },
    { id: "light",   label: "Light Mode",   color: "#ffffff" },
    { id: "high-contrast", label: "High Contrast", color: "#000000" },
  ];

  return (
    <>
      <PanelSection title="Appearance">
        <SettingRow label="Theme" description="Controls the visual appearance of the app">
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
            {THEMES.map((theme) => {
              const isActive = theme.id === activeTheme;
              const isAvailable = theme.id === "default";
              return (
                <div
                  key={theme.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 8px",
                    borderRadius: "var(--tv-radius-sm)",
                    opacity: isAvailable ? 1 : 0.5,
                    pointerEvents: isAvailable ? "auto" : "none",
                  }}
                >
                  {/* Color swatch */}
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: theme.color,
                      border: "1px solid var(--tv-border-default)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      font: "var(--tv-type-body-sm)",
                      color: "var(--tv-text-primary)",
                      flex: 1,
                    }}
                  >
                    {theme.label}
                  </span>
                  {isActive && (
                    <Checkmark20Regular
                      style={{
                        width: 16,
                        height: 16,
                        color: "var(--tv-accent-primary)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {!isAvailable && <Badge variant="coming-soon">Coming soon</Badge>}
                </div>
              );
            })}
          </div>
        </SettingRow>

        <SettingRow label="Density" description="Adjust information density">
          <Badge variant="coming-soon">Coming soon</Badge>
        </SettingRow>

        <SettingRow
          label="Accent colour"
          description="Customise the app's highlight colour"
        >
          <ColorSwatchRow
            value={undefined}
            onChange={() => toast.info("Accent colour customisation coming soon")}
          />
        </SettingRow>
      </PanelSection>
    </>
  );
}

// ── ChannelRow ─────────────────────────────────────────────────────────────────

function ChannelRow({
  channel,
  onDelete,
}: {
  channel: ChannelOut;
  onDelete: (channel: ChannelOut) => void;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  async function handleToggleDefault() {
    setLoading(true);
    try {
      if (channel.is_global_default) {
        await unsetDefaultChannel(channel.id);
      } else {
        await setDefaultChannel(channel.id);
      }
      await queryClient.invalidateQueries({ queryKey: channelKeys.list() });
    } catch {
      toast.error("Failed to update default channel");
    } finally {
      setLoading(false);
    }
  }

  const displayName = channel.label ?? `Channel ${channel.channel_id}`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderBottom: "1px solid var(--tv-border-subtle)",
      }}
    >
      <span
        style={{
          flex: 1,
          font: "var(--tv-type-body-sm)",
          color: "var(--tv-text-primary)",
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {displayName}
      </span>
      {channel.is_global_default && <Badge variant="info">Default</Badge>}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleDefault}
        disabled={loading}
        style={{ flexShrink: 0 }}
      >
        {channel.is_global_default ? "Unset Default" : "Set Default"}
      </Button>
      <button
        type="button"
        aria-label={`Delete ${displayName}`}
        onClick={() => onDelete(channel)}
        disabled={loading}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: "var(--tv-radius-sm)",
          color: "var(--tv-error)",
          flexShrink: 0,
        }}
      >
        <Delete20Regular style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
}

// ── AddChannelForm ─────────────────────────────────────────────────────────────

function AddChannelForm({ onClose }: { onClose: () => void }) {
  return <ChannelPicker onDone={onClose} onCancel={onClose} />;
}

// ── ChannelsPanel ──────────────────────────────────────────────────────────────

export function ChannelsPanel() {
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChannelOut | null>(null);

  const { data: channels, isLoading, isError, refetch } = useQuery({
    queryKey: channelKeys.list(),
    queryFn: listChannels,
  });

  return (
    <>
      <PanelSection title="Channels">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <p
            style={{
              font: "var(--tv-type-body-sm)",
              color: "var(--tv-text-secondary)",
              margin: 0,
            }}
          >
            Telegram channels used to store your files.
          </p>
          {!showForm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(true)}
            >
              <Add20Regular style={{ width: 14, height: 14, marginRight: 4 }} />
              Add channel
            </Button>
          )}
        </div>

        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 40,
                  borderRadius: "var(--tv-radius-sm)",
                  background: "var(--tv-bg-subtle)",
                  animation: "shimmer 1.5s ease-in-out infinite",
                }}
              />
            ))}
          </div>
        )}

        {isError && (
          <div
            style={{
              padding: 16,
              borderRadius: "var(--tv-radius-md)",
              background: "var(--tv-error-container)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-error)", flex: 1 }}
            >
              Failed to load channels.
            </span>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && channels && channels.items.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "32px 16px",
            }}
          >
            <Globe20Regular
              style={{ width: 32, height: 32, color: "var(--tv-text-disabled)", marginBottom: 8 }}
            />
            <p
              style={{
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
                margin: "0 0 12px",
              }}
            >
              No channels configured
            </p>
            {!showForm && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowForm(true)}
              >
                Add your first channel
              </Button>
            )}
          </div>
        )}

        {!isLoading && !isError && channels && channels.items.length > 0 && (
          <div>
            {channels.items.map((channel: any) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}

        {showForm && <AddChannelForm onClose={() => setShowForm(false)} />}
      </PanelSection>

      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Delete channel"
        description={`Remove "${deleteTarget?.label ?? `Channel ${deleteTarget?.channel_id}`}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          // TODO: wire deleteChannel API when endpoint is available
          toast.error("Channel deletion is not yet supported by the API");
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

// ── AccountsPanel ──────────────────────────────────────────────────────────────

export function AccountsPanel() {
  return (
    <>
      <PanelSection title="Accounts">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 16px",
            gap: 12,
          }}
        >
          <PersonAccounts20Regular
            style={{ width: 48, height: 48, color: "var(--tv-text-disabled)" }}
          />
          <h4
            style={{
              font: "var(--tv-type-headline)",
              color: "var(--tv-text-primary)",
              margin: 0,
            }}
          >
            Multiple accounts
          </h4>
          <p
            style={{
              font: "var(--tv-type-body-sm)",
              color: "var(--tv-text-secondary)",
              margin: 0,
              textAlign: "center",
              maxWidth: 340,
            }}
          >
            Connect additional Telegram accounts to upload files in parallel.
            Coming soon.
          </p>
        </div>
      </PanelSection>
    </>
  );
}

// ── KeybindsPanel ──────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<ActionId, string> = {
  rename:             "Rename",
  delete:             "Delete",
  newFolder:          "New Folder",
  upload:             "Upload Files",
  copy:               "Copy",
  paste:              "Paste",
  selectAll:          "Select All",
  openProperties:     "Properties",
  toggleSidebar:      "Toggle Sidebar",
  openCommandPalette: "Command Palette",
  openSearch:         "Search",
  viewGrid:           "Grid View",
  viewList:           "List View",
  viewDetails:        "Details View",
  navigateBack:       "Navigate Back",
  navigateForward:    "Navigate Forward",
};

export function KeybindsPanel() {
  const { bindings } = useKeybindStore();
  const actions = Object.keys(ACTION_LABELS) as ActionId[];

  return (
    <>
      <PanelSection title="Keyboard shortcuts">
        <div
          style={{
            borderRadius: "var(--tv-radius-md)",
            border: "1px solid var(--tv-border-subtle)",
            overflow: "hidden",
          }}
        >
          {actions.map((actionId, i) => (
            <div
              key={actionId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "0 12px",
                height: 36,
                background: i % 2 === 0 ? "var(--tv-bg-subtle)" : "transparent",
              }}
            >
              <span
                style={{
                  flex: 1,
                  font: "var(--tv-type-body-sm)",
                  color: "var(--tv-text-primary)",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {ACTION_LABELS[actionId]}
              </span>
              <Kbd>{bindings[actionId]}</Kbd>
              <Tooltip content="Keybind customisation coming soon">
                <button
                  type="button"
                  disabled
                  aria-label={`Edit keybind for ${ACTION_LABELS[actionId]}`}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: "var(--tv-radius-sm)",
                    color: "var(--tv-text-disabled)",
                    flexShrink: 0,
                  }}
                >
                  <Edit20Regular style={{ width: 14, height: 14 }} />
                </button>
              </Tooltip>
            </div>
          ))}
        </div>
      </PanelSection>
    </>
  );
}

// ── AboutPanel ─────────────────────────────────────────────────────────────────

export function AboutPanel() {
  const { logout } = useAuthStore();

  return (
    <>
      <PanelSection title="About">
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
          <h2
            style={{
              font: "var(--tv-type-display)",
              color: "var(--tv-text-primary)",
              margin: 0,
            }}
          >
            TeleVault
          </h2>
          <p
            style={{
              font: "var(--tv-type-body-sm)",
              color: "var(--tv-text-secondary)",
              margin: 0,
            }}
          >
            Version 0.1.0
          </p>
          <p
            style={{
              font: "var(--tv-type-body)",
              color: "var(--tv-text-secondary)",
              margin: "8px 0 0",
            }}
          >
            A beautiful self-hosted Telegram file vault.
          </p>
        </div>

        <div style={{ margin: "24px 0" }}>
          <Separator />
        </div>

        <PanelSection title="Support TeleVault">
          <p
            style={{
              font: "var(--tv-type-body-sm)",
              color: "var(--tv-text-secondary)",
              margin: "0 0 16px",
              lineHeight: 1.5,
            }}
          >
            TeleVault is a labor of love by a solo developer. If you find this project valuable, please consider supporting its development. Your contributions help keep the project open-source and thriving.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Button
              variant="secondary"
              size="md"
              onClick={() => window.open("https://revolut.me/elpideus", "_blank")}
            >
              <Heart24Regular style={{ width: 16, height: 16, marginRight: 8, color: "var(--tv-accent-primary)" }} />
              Donate to Project
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                const reset = useUIStore.getState().resetOnboarding;
                reset();
                toast.success("Onboarding has been reset. Modals will appear on next reload.");
              }}
            >
              Reset Modals & Tips
            </Button>
          </div>
        </PanelSection>

        <div style={{ margin: "24px 0" }}>
          <Separator />
        </div>

        <Button
          variant="danger"
          size="md"
          onClick={logout}
        >
          <SignOut20Regular style={{ width: 16, height: 16, marginRight: 6 }} />
          Log out
        </Button>
      </PanelSection>
    </>
  );
}
