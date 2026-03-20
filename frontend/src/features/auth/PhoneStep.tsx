// src/features/auth/PhoneStep.tsx
import { useState } from "react";
import { isValidPhoneNumber, getCountryCallingCode } from "libphonenumber-js";
import { Button, Input } from "../../themes/index";
import { CountryPicker } from "./CountryPicker";

export interface PhoneStepProps {
  onSubmit: (e164Phone: string) => void;
  isPending: boolean;
  error: string | null;
}

export function PhoneStep({ onSubmit, isPending, error }: PhoneStepProps) {
  const [country, setCountry] = useState("US");
  const [localNumber, setLocalNumber] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const dialCode = getCountryCallingCode(country as Parameters<typeof getCountryCallingCode>[0]);
    const e164 = `+${dialCode}${localNumber.replace(/\s/g, "")}`;

    if (!isValidPhoneNumber(e164)) {
      setValidationError("Please enter a valid phone number.");
      return;
    }

    onSubmit(e164);
  };

  const displayedError = validationError ?? error;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{ margin: 0, font: "var(--tv-type-headline)", color: "var(--tv-text-primary)" }}>
          Sign in to TeleVault
        </h1>
        <p style={{ margin: 0, font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
          Enter your Telegram phone number to continue.
        </p>
      </div>

      {/* Phone input row */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <CountryPicker
          value={country}
          onChange={setCountry}
          disabled={isPending}
        />
        <div style={{ flex: 1 }}>
          <Input
            id="phone-number"
            type="tel"
            inputMode="numeric"
            placeholder="Phone number"
            value={localNumber}
            onChange={(e) => {
              setValidationError(null);
              setLocalNumber(e.target.value);
            }}
            disabled={isPending}
          />
        </div>
      </div>

      {/* Error */}
      {displayedError && (
        <p
          role="alert"
          style={{
            margin: 0,
            font: "var(--tv-type-body-sm)",
            color: "var(--tv-error)",
          }}
        >
          {displayedError}
        </p>
      )}

      {/* Submit */}
      <Button
        type="submit"
        variant="primary"
        loading={isPending}
        disabled={!localNumber.trim()}
        className="w-full"
      >
        Send Code
      </Button>
    </form>
  );
}
