// src/features/auth/OtpStep.tsx
import { useRef, useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Input } from "../../themes/index";
import { RememberMeCheckbox } from "./RememberMeCheckbox";
import { submitOtp, getMe } from "../../api/auth";
import { useAuthStore } from "../../store/authStore";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface OtpStepProps {
  phone: string;      // E.164 — displayed in subtitle
  codeType: string;   // 'app' | 'sms' | other — drives header copy
  onResend: () => void;
  onSuccess: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OtpStep({ phone, codeType, onResend, onSuccess }: OtpStepProps) {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const login = useAuthStore((s) => s.login);
  const fetchAndCacheAvatar = useAuthStore((s) => s.fetchAndCacheAvatar);

  // ── Local state ───────────────────────────────────────────────────────────
  const [digits, setDigits] = useState<string[]>(["", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);

  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Resend countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(
      () => setCountdown((c) => Math.max(0, c - 1)),
      1000,
    );
    return () => clearInterval(id);
    // Empty deps: run once on mount, clean up on unmount.
    // setCountdown(60) on resend is sufficient — the existing interval picks
    // up from the new value without needing to restart.
  }, []);

  // ── Mutation ──────────────────────────────────────────────────────────────
  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      submitOtp({
        phone,
        code: digits.join(""),
        password: password.trim() || null,
      }),
    onSuccess: async (tokenOut) => {
      // Set token first so the API client can attach it to getMe()
      setAccessToken(tokenOut!.access_token);
      const user = await getMe();
      if (!user) throw new Error("Failed to load user profile.");
      login({
        accessToken: tokenOut!.access_token,
        refreshToken: tokenOut!.refresh_token,
        user: {
          id: String(user.telegram_id),
          phone,
          username: user.telegram_username ?? null,
          first_name: user.telegram_first_name,
          last_name: null,
          vault_hash: user.vault_hash,
        },
        rememberMe,
      });
      fetchAndCacheAvatar();
      onSuccess();
    },
    onError: (err: unknown) => {
      const detail = (err as { detail?: { message?: string } })?.detail;
      setError(detail?.message ?? "Something went wrong, try again.");
      setDigits(["", "", "", "", ""]);
      boxRefs.current[0]?.focus();
    },
  });

  // ── OTP box handlers ──────────────────────────────────────────────────────
  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/[^0-9]/g, "").slice(-1);
    setError(null);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 4) {
      boxRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      boxRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 5);
    const next = ["", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i] ?? "";
    }
    setDigits(next);
    const lastFilled = Math.min(pasted.length, 4);
    boxRefs.current[lastFilled]?.focus();
  };

  const handleResend = () => {
    onResend();
    setCountdown(60);
  };

  const heading =
    codeType === "app" ? "Check your Telegram app" : "Check your messages";
  const code = digits.join("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutate();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
    >
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1
          style={{
            margin: 0,
            font: "var(--tv-type-headline)",
            color: "var(--tv-text-primary)",
          }}
        >
          {heading}
        </h1>
        <p
          style={{
            margin: 0,
            font: "var(--tv-type-body-sm)",
            color: "var(--tv-text-secondary)",
          }}
        >
          We sent a code to{" "}
          <span style={{ color: "var(--tv-text-primary)" }}>{phone}</span>
        </p>
      </div>

      {/* OTP boxes */}
      <div
        onPaste={handlePaste}
        style={{ display: "flex", gap: 8, justifyContent: "center" }}
        aria-label="One-time code"
      >
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              boxRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            pattern="[0-9]"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            value={digit}
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={isPending}
            aria-label={`Digit ${i + 1}`}
            style={{
              width: 48,
              height: 48,
              textAlign: "center",
              font: "var(--tv-type-title-lg)",
              color: "var(--tv-text-primary)",
              background: "var(--tv-bg-subtle)",
              border: `1px solid var(${digit ? "--tv-border-strong" : "--tv-border-default"})`,
              borderRadius: "var(--tv-radius-sm)",
              outline: "none",
              transition: "border-color 120ms ease",
              cursor: "text",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "var(--tv-accent-border)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = `var(${digit ? "--tv-border-strong" : "--tv-border-default"})`)
            }
          />
        ))}
      </div>

      {/* Resend */}
      <div style={{ textAlign: "center" }}>
        {countdown > 0 ? (
          <span
            style={{
              font: "var(--tv-type-body-sm)",
              color: "var(--tv-text-disabled)",
            }}
          >
            Resend code in {countdown}s
          </span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            style={{
              font: "var(--tv-type-body-sm)",
              color: "var(--tv-accent-primary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Resend code
          </button>
        )}
      </div>

      {/* 2FA password — always visible */}
      <Input
        id="twofa-password"
        type="password"
        label="Telegram 2FA Password"
        placeholder="Leave blank if not enabled"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={isPending}
      />

      {/* Remember me */}
      <RememberMeCheckbox checked={rememberMe} onChange={setRememberMe} />

      {/* Error */}
      {error && (
        <p
          role="alert"
          style={{
            margin: 0,
            font: "var(--tv-type-body-sm)",
            color: "var(--tv-error)",
          }}
        >
          {error}
        </p>
      )}

      {/* Submit */}
      <Button
        type="submit"
        variant="primary"
        loading={isPending}
        disabled={code.length < 5 || isPending}
        className="w-full"
      >
        Sign In
      </Button>
    </form>
  );
}
