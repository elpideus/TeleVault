import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Checkmark20Regular, Globe20Regular, Delete20Regular, Add20Regular, PersonAccounts20Regular, Edit20Regular, SignOut20Regular, Heart24Regular, Warning20Regular, QrCode20Regular, Phone20Regular } from "@fluentui/react-icons";
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
import { Input } from "./Input";
import { DialogContent, DialogHeader, DialogFooter } from "./DialogBase";
import {
  accountsKeys,
  listAltAccounts,
  removeAltAccount,
  startPhoneLogin,
  submitOtp,
  initQrLogin,
  pollQrLogin,
  type AltAccountOut,
  type AddAccountResponse,
} from "../../../api/accounts";

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

// ── StatusDot ──────────────────────────────────────────────────────────────────

function StatusDot({ account }: { account: AltAccountOut }) {
  if (account.session_error) {
    return (
      <Tooltip content={account.session_error} side="right">
        <span
          aria-label="Session error"
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--tv-error)",
            flexShrink: 0,
            cursor: "default",
          }}
        />
      </Tooltip>
    );
  }
  if (account.last_checked_at === null) {
    return (
      <Tooltip content="Never health-checked" side="right">
        <span
          aria-label="Never checked"
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--tv-warning, #f5a623)",
            flexShrink: 0,
            cursor: "default",
          }}
        />
      </Tooltip>
    );
  }
  return (
    <Tooltip content="Connected" side="right">
      <span
        aria-label="Connected"
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--tv-success, #2ecc71)",
          flexShrink: 0,
          cursor: "default",
        }}
      />
    </Tooltip>
  );
}

// ── AltAccountCard ─────────────────────────────────────────────────────────────

function AltAccountCard({
  account,
  onRemove,
}: {
  account: AltAccountOut;
  onRemove: (account: AltAccountOut) => void;
}) {
  const displayName = account.label ?? "Unnamed account";
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
      <StatusDot account={account} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            font: "var(--tv-type-body-sm)",
            color: "var(--tv-text-primary)",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayName}
        </p>
        <p
          style={{
            font: "var(--tv-type-label-sm)",
            color: "var(--tv-text-secondary)",
            margin: "2px 0 0",
          }}
        >
          ID: {account.telegram_id}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Remove ${displayName}`}
        onClick={() => onRemove(account)}
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

// ── AddAccountModal ─────────────────────────────────────────────────────────────

type AddTab = "phone" | "qr";
type PhoneStep = "phone" | "otp";

function AddAccountModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [tab, setTab] = useState<AddTab>("phone");

  // Phone flow state
  const [phone, setPhone] = useState("");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("phone");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [enrollWarnings, setEnrollWarnings] = useState<{ channel_id: string; error: string }[] | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // QR flow state
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pollToken, setPollToken] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [isInitializingQr, setIsInitializingQr] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  // Clean up when modal closes
  useEffect(() => {
    if (!open) {
      stopPolling();
      // Reset all state
      setTab("phone");
      setPhone("");
      setPhoneStep("phone");
      setOtp("");
      setPassword("");
      setShowPassword(false);
      setPhoneError(null);
      setEnrollWarnings(null);
      setIsSendingOtp(false);
      setIsConfirming(false);
      setQrUrl(null);
      setPollToken(null);
      setQrError(null);
      setIsInitializingQr(false);
    }
  }, [open]);

  // Start QR when tab switches to qr
  useEffect(() => {
    if (open && tab === "qr" && !qrUrl && !isInitializingQr) {
      handleInitQr();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, open]);

  async function handleInitQr() {
    setIsInitializingQr(true);
    setQrError(null);
    try {
      const result = await initQrLogin();
      setQrUrl(result.qr_url);
      setPollToken(result.poll_token);
      startPolling(result.poll_token);
    } catch {
      setQrError("Failed to initialize QR login. Please try again.");
    } finally {
      setIsInitializingQr(false);
    }
  }

  function handleAddSuccess(result: AddAccountResponse) {
    stopPolling();
    if (result.enrollment_failures && result.enrollment_failures.length > 0) {
      setEnrollWarnings(result.enrollment_failures);
    } else {
      onSuccess();
      onOpenChange(false);
    }
  }

  function startPolling(token: string) {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const result = await pollQrLogin(token);
        if (result.status === "complete" && result.account) {
          stopPolling();
          handleAddSuccess({
            account: result.account,
            enrollment_failures: result.enrollment_failures ?? [],
          });
        } else if (result.status === "error") {
          stopPolling();
          setQrError(result.message ?? "QR login failed. Try switching to phone login.");
          setQrUrl(null);
          setPollToken(null);
        }
      } catch {
        // Polling failure is transient; keep trying
      }
    }, 2000);
  }

  async function handleSendOtp() {
    if (!phone.trim()) return;
    setIsSendingOtp(true);
    setPhoneError(null);
    try {
      await startPhoneLogin(phone.trim());
      setPhoneStep("otp");
    } catch (err: unknown) {
      const detail = (err as { detail?: { message?: string } })?.detail;
      setPhoneError(detail?.message ?? "Failed to send OTP. Please check your phone number.");
    } finally {
      setIsSendingOtp(false);
    }
  }

  async function handleConfirmOtp() {
    if (!otp.trim()) return;
    setIsConfirming(true);
    setPhoneError(null);
    try {
      const result = await submitOtp(phone.trim(), otp.trim(), password.trim() || undefined);
      handleAddSuccess(result);
    } catch (err: unknown) {
      const detail = (err as { detail?: { message?: string; code?: string } })?.detail;
      if (detail?.code === "PASSWORD_REQUIRED" || detail?.message?.toLowerCase().includes("password")) {
        setShowPassword(true);
        setPhoneError("Two-factor authentication is required. Please enter your Telegram password.");
      } else {
        setPhoneError(detail?.message ?? "Failed to verify OTP. Please try again.");
      }
    } finally {
      setIsConfirming(false);
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "8px 0",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid var(--tv-accent-primary)" : "2px solid transparent",
    cursor: "pointer",
    font: "var(--tv-type-body-sm)",
    color: active ? "var(--tv-accent-primary)" : "var(--tv-text-secondary)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    transition: "color 120ms ease, border-color 120ms ease",
  });

  return (
    <DialogContent
      open={open}
      onOpenChange={(o) => {
        if (!o) stopPolling();
        onOpenChange(o);
      }}
      title="Add Telegram Account"
      hideTitle
      maxWidth="440px"
      closeOnOutsideClick={!isSendingOtp && !isConfirming}
      closeOnEscape={!isSendingOtp && !isConfirming}
    >
      <DialogHeader
        title="Add Telegram Account"
        description="Connect an additional Telegram account to upload files in parallel."
        onClose={() => { stopPolling(); onOpenChange(false); }}
      />

      {/* If enrollment warnings are shown */}
      {enrollWarnings && (
        <div style={{ padding: "16px 24px" }}>
          <div
            style={{
              padding: 12,
              borderRadius: "var(--tv-radius-md)",
              background: "var(--tv-warning-container, rgba(245,166,35,0.12))",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <Warning20Regular style={{ width: 16, height: 16, color: "var(--tv-warning, #f5a623)", flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-primary)", margin: "0 0 6px" }}>
                  Account added, but failed to enroll in some channels:
                </p>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {enrollWarnings.map((f, i) => (
                    <li key={i} style={{ font: "var(--tv-type-label-sm)", color: "var(--tv-text-secondary)" }}>
                      Channel {f.channel_id}: {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => { onSuccess(); onOpenChange(false); }}
            style={{ width: "100%" }}
          >
            Continue
          </Button>
        </div>
      )}

      {!enrollWarnings && (
        <>
          {/* Tab bar */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--tv-border-subtle)",
              padding: "0 24px",
            }}
          >
            <button type="button" style={tabStyle(tab === "phone")} onClick={() => setTab("phone")}>
              <Phone20Regular style={{ width: 14, height: 14 }} />
              Phone / OTP
            </button>
            <button type="button" style={tabStyle(tab === "qr")} onClick={() => setTab("qr")}>
              <QrCode20Regular style={{ width: 14, height: 14 }} />
              QR Code
            </button>
          </div>

          {/* Phone tab */}
          {tab === "phone" && (
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {phoneStep === "phone" && (
                <>
                  <Input
                    id="add-account-phone"
                    type="tel"
                    label="Phone Number"
                    placeholder="+1 555 000 0000"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setPhoneError(null); }}
                    disabled={isSendingOtp}
                    error={phoneError ?? undefined}
                  />
                  {phoneError && !phone && (
                    <p role="alert" style={{ margin: 0, font: "var(--tv-type-body-sm)", color: "var(--tv-error)" }}>
                      {phoneError}
                    </p>
                  )}
                  <Button
                    variant="primary"
                    size="md"
                    loading={isSendingOtp}
                    disabled={!phone.trim() || isSendingOtp}
                    onClick={handleSendOtp}
                    style={{ width: "100%" }}
                  >
                    Send OTP
                  </Button>
                </>
              )}

              {phoneStep === "otp" && (
                <>
                  <p style={{ margin: 0, font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
                    Enter the OTP sent to <span style={{ color: "var(--tv-text-primary)" }}>{phone}</span>
                  </p>
                  <Input
                    id="add-account-otp"
                    type="text"
                    inputMode="numeric"
                    label="OTP Code"
                    placeholder="12345"
                    value={otp}
                    onChange={(e) => { setOtp(e.target.value); setPhoneError(null); }}
                    disabled={isConfirming}
                  />
                  {showPassword && (
                    <Input
                      id="add-account-password"
                      type="password"
                      label="Telegram 2FA Password"
                      placeholder="Enter your cloud password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isConfirming}
                    />
                  )}
                  {phoneError && (
                    <p role="alert" style={{ margin: 0, font: "var(--tv-type-body-sm)", color: "var(--tv-error)" }}>
                      {phoneError}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => { setPhoneStep("phone"); setOtp(""); setPhoneError(null); setShowPassword(false); }}
                      disabled={isConfirming}
                      style={{ flex: 1 }}
                    >
                      Back
                    </Button>
                    <Button
                      variant="primary"
                      size="md"
                      loading={isConfirming}
                      disabled={!otp.trim() || isConfirming}
                      onClick={handleConfirmOtp}
                      style={{ flex: 2 }}
                    >
                      Confirm
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* QR tab */}
          {tab === "qr" && (
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
              {isInitializingQr && (
                <div style={{ padding: 32 }}>
                  <p style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)", margin: 0 }}>
                    Generating QR code…
                  </p>
                </div>
              )}
              {!isInitializingQr && qrUrl && (
                <>
                  <p style={{ margin: 0, font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)", textAlign: "center" }}>
                    Open Telegram on your phone, go to <strong>Settings → Devices → Link Desktop Device</strong>, then scan this code.
                  </p>
                  <img
                    src={qrUrl}
                    alt="QR code for Telegram login"
                    style={{ width: 200, height: 200, borderRadius: "var(--tv-radius-md)", background: "#fff" }}
                  />
                  <p style={{ margin: 0, font: "var(--tv-type-label-sm)", color: "var(--tv-text-disabled)", textAlign: "center" }}>
                    Waiting for scan…
                  </p>
                </>
              )}
              {!isInitializingQr && qrError && (
                <>
                  <div
                    style={{
                      padding: 12,
                      borderRadius: "var(--tv-radius-md)",
                      background: "var(--tv-error-container)",
                      width: "100%",
                    }}
                  >
                    <p style={{ margin: 0, font: "var(--tv-type-body-sm)", color: "var(--tv-error)" }}>
                      {qrError}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button variant="ghost" size="sm" onClick={() => setTab("phone")}>
                      Switch to Phone Login
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => { setQrUrl(null); setPollToken(null); setQrError(null); handleInitQr(); }}>
                      Retry
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </DialogContent>
  );
}

// ── AccountsPanel ──────────────────────────────────────────────────────────────

export function AccountsPanel() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AltAccountOut | null>(null);

  const { data: accounts, isLoading, isError, refetch } = useQuery({
    queryKey: accountsKeys.list,
    queryFn: listAltAccounts,
  });

  const { mutate: doRemove, isPending: isRemoving } = useMutation({
    mutationFn: (id: string) => removeAltAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountsKeys.list });
      toast.success("Account removed");
      setRemoveTarget(null);
    },
    onError: () => {
      toast.error("Failed to remove account");
    },
  });

  function handleAddSuccess() {
    queryClient.invalidateQueries({ queryKey: accountsKeys.list });
    toast.success("Account added successfully");
  }

  return (
    <>
      <PanelSection title="Accounts">
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
            Additional Telegram accounts for parallel uploads.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddModal(true)}
          >
            <Add20Regular style={{ width: 14, height: 14, marginRight: 4 }} />
            Add Account
          </Button>
        </div>

        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: 48,
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
            <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-error)", flex: 1 }}>
              Failed to load accounts.
            </span>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && accounts && accounts.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <PersonAccounts20Regular
              style={{ width: 32, height: 32, color: "var(--tv-text-disabled)", marginBottom: 8 }}
            />
            <p
              style={{
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
                margin: "0 0 12px",
              }}
            >
              No additional accounts connected
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowAddModal(true)}
            >
              Add your first account
            </Button>
          </div>
        )}

        {!isLoading && !isError && accounts && accounts.length > 0 && (
          <div>
            {accounts.map((account) => (
              <AltAccountCard
                key={account.id}
                account={account}
                onRemove={setRemoveTarget}
              />
            ))}
          </div>
        )}
      </PanelSection>

      <AddAccountModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSuccess={handleAddSuccess}
      />

      <ConfirmModal
        open={removeTarget !== null}
        onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}
        title="Remove account"
        description={`Remove account "${removeTarget?.label ?? `ID ${removeTarget?.telegram_id}`}"? This cannot be undone.`}
        confirmLabel="Remove"
        danger
        loading={isRemoving}
        onConfirm={() => {
          if (removeTarget) doRemove(removeTarget.id);
        }}
      />
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
            Version 1.0.11
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
