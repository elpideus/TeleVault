import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { accountsKeys, getPrimaryAccount } from "../../api/accounts";
import { dialogKeys, listDialogs } from "../../api/dialogs";
import { channelKeys, createChannel, setDefaultChannel, createTelegramChannel } from "../../api/channels";
import type { ChannelIn } from "../../api/schema";
import { Button, Input } from "../../themes/index";
import { toast } from "../../lib/toast";

export interface ChannelPickerProps {
  onDone: () => void;
  onCancel?: () => void;
}

export function ChannelPicker({ onDone, onCancel }: ChannelPickerProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"list" | "create">("list");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: primaryAccount, isLoading: accountsLoading } = useQuery({
    queryKey: accountsKeys.primary,
    queryFn: getPrimaryAccount,
  });

  const accountId = primaryAccount?.id;

  const { data: dialogsData, isLoading: dialogsLoading } = useQuery({
    queryKey: dialogKeys.byAccount(accountId ?? ""),
    queryFn: () => listDialogs(accountId!, true, 1, 100),
    enabled: !!accountId,
  });

  const dialogs = dialogsData?.items || [];

  async function handleSelectDialog(dialog: any) {
    if (!accountId) return;
    setSubmitting(true);
    try {
      const body: ChannelIn = {
        telegram_account_id: accountId,
        channel_id: dialog.channel_id ?? dialog.id,
        label: dialog.title || null,
      };
      const newChannel = await createChannel(body);
      await setDefaultChannel(newChannel.id);
      await queryClient.invalidateQueries({ queryKey: channelKeys.list() });
      toast.success("Channel added and selected");
      onDone();
    } catch {
      toast.error("Failed to add channel");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !title.trim()) return;
    setSubmitting(true);
    try {
      const newChannel = await createTelegramChannel({
        telegram_account_id: accountId,
        title: title.trim(),
      });
      await setDefaultChannel(newChannel.id);
      await queryClient.invalidateQueries({ queryKey: channelKeys.list() });
      toast.success("Telegram channel created and selected");
      onDone();
    } catch {
      toast.error("Failed to create Telegram channel");
    } finally {
      setSubmitting(false);
    }
  }

  if (accountsLoading) return <div style={{ padding: 16 }}>Loading accounts...</div>;
  if (!accountId) return <div style={{ padding: 16 }}>No Telegram account linked.</div>;

  if (mode === "create") {
    return (
      <form
        onSubmit={handleCreateSubmit}
        style={{
          marginTop: 12,
          padding: 16,
          borderRadius: "var(--tv-radius-md)",
          background: "var(--tv-bg-subtle)",
          border: "1px solid var(--tv-border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <Input
          label="Channel Name"
          placeholder="e.g. My Vault Storage"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus={true}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" size="sm" type="button" onClick={() => setMode("list")} disabled={submitting}>
            Back
          </Button>
          <Button variant="primary" size="sm" type="submit" loading={submitting}>
            Create
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: 16,
        borderRadius: "var(--tv-radius-md)",
        background: "var(--tv-bg-subtle)",
        border: "1px solid var(--tv-border-subtle)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxHeight: 400,
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <span style={{ font: "var(--tv-type-label)", color: "var(--tv-text-secondary)" }}>
          Select an existing admin channel
        </span>
        <div style={{ flexShrink: 0 }}>
          <Button variant="primary" size="sm" onClick={() => setMode("create")}>
            Create new channel
          </Button>
        </div>
      </div>

      {dialogsLoading ? (
        <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>Loading channels...</span>
      ) : dialogs.length === 0 ? (
        <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>No admin channels found.</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {dialogs.map((dialog: any) => (
            <div
              key={dialog.id ?? (dialog as any)?.channel_id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: "var(--tv-radius-sm)",
                background: "var(--tv-bg-base)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-primary)" }}>{dialog.title}</span>
                {dialog.username && (
                  <span style={{ font: "var(--tv-type-label-sm)", color: "var(--tv-text-secondary)" }}>@{dialog.username}</span>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleSelectDialog(dialog)} disabled={submitting}>
                Select
              </Button>
            </div>
          ))}
        </div>
      )}

      {onCancel && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
