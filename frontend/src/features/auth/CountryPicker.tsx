// src/features/auth/CountryPicker.tsx
import { useState, useMemo } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { getCountries, getCountryCallingCode } from "libphonenumber-js";
import { ChevronDown20Regular } from "@fluentui/react-icons";
import { Input } from "../../themes/index";
import { cn } from "../../lib/cn";

// ── Flag emoji helper ──────────────────────────────────────────────────────────
// Converts ISO 3166-1 alpha-2 code to regional indicator emoji pair.
// Note: on Windows these render as two-letter codes (e.g. "IT"), not flags.
// This is acceptable for a desktop app targeting technical users.
function flagEmoji(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

// ── Country list ──────────────────────────────────────────────────────────────
// Pinned countries shown at the top regardless of search.
const PINNED = ["US", "GB", "DE", "IT", "FR", "ES", "BR", "IN", "AU", "CA"];

// Intl.DisplayNames for country name resolution — built once at module load.
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

interface CountryOption {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

function buildCountryList(): CountryOption[] {
  const all = getCountries()
    .map((code) => ({
      code,
      name: regionNames.of(code) ?? code,
      dialCode: getCountryCallingCode(code as Parameters<typeof getCountryCallingCode>[0]),
      flag: flagEmoji(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const pinned = PINNED.map((c) => all.find((x) => x.code === c)).filter(
    Boolean,
  ) as CountryOption[];

  const rest = all.filter((c) => !PINNED.includes(c.code));
  return [...pinned, ...rest];
}

// Built once at module load — no re-computation on render.
const COUNTRY_LIST = buildCountryList();

// ── Props ──────────────────────────────────────────────────────────────────────

export interface CountryPickerProps {
  value: string; // ISO 3166-1 alpha-2 code, e.g. "US"
  onChange: (code: string) => void;
  disabled?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CountryPicker({ value, onChange, disabled }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // COUNTRY_LIST is non-empty (getCountries() always returns codes), so [0] is safe.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const selected = COUNTRY_LIST.find((c) => c.code === value) ?? COUNTRY_LIST[0]!;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return COUNTRY_LIST;
    return COUNTRY_LIST.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [search]);

  const triggerLabel = `${selected.flag} +${selected.dialCode}`;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Country: ${selected.name}`}
          className={cn(
            "relative inline-flex items-center justify-between gap-1",
            "h-8 px-2 rounded-[var(--tv-radius-sm)]",
            "bg-[var(--tv-bg-subtle)] border border-[var(--tv-border-default)]",
            "text-[var(--tv-text-primary)] cursor-pointer select-none",
            "transition-[border-color] duration-[120ms]",
            "hover:border-[var(--tv-border-strong)]",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-[var(--tv-accent-border)]",
            "focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--tv-bg-base)]",
            "disabled:cursor-not-allowed disabled:opacity-40",
            // M3 state layer
            "after:absolute after:inset-0 after:rounded-[inherit]",
            "after:content-[''] after:pointer-events-none",
            "after:transition-[background-color] after:duration-[120ms]",
            "hover:after:bg-[rgba(255,255,255,0.06)]",
          )}
          style={{ width: 96, font: "var(--tv-type-body-sm)" }}
        >
          <span>{triggerLabel}</span>
          <ChevronDown20Regular style={{ width: 14, height: 14, flexShrink: 0, color: "var(--tv-text-secondary)" }} />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{
            zIndex: 200,
            width: 260,
            background: "var(--tv-bg-overlay)",
            border: "1px solid var(--tv-border-default)",
            borderRadius: "var(--tv-radius-md)",
            boxShadow: "var(--tv-shadow-md)",
            padding: "8px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {/* Search */}
          <Input
            variant="search"
            placeholder="Search country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="country-search"
            autoFocus
          />

          {/* Country list */}
          <div
            role="listbox"
            aria-label="Countries"
            style={{
              maxHeight: 240,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            {filtered.length === 0 && (
              <div
                style={{
                  padding: "8px 10px",
                  color: "var(--tv-text-disabled)",
                  font: "var(--tv-type-body-sm)",
                }}
              >
                No results
              </div>
            )}
            {filtered.map((country) => (
              <button
                key={country.code}
                role="option"
                aria-selected={country.code === value}
                type="button"
                onClick={() => {
                  onChange(country.code);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "relative w-full flex items-center gap-2 text-left",
                  "px-2.5 py-1.5 rounded-[var(--tv-radius-sm)]",
                  "cursor-pointer select-none",
                  "transition-[background] duration-[120ms]",
                  // State layer for hover/active
                  "hover:bg-[rgba(255,255,255,0.06)]",
                  "active:bg-[rgba(255,255,255,0.10)]",
                  country.code === value &&
                    "bg-[var(--tv-accent-container)] text-[var(--tv-accent-on-container)]",
                )}
                style={{ font: "var(--tv-type-body-sm)" }}
              >
                <span style={{ flexShrink: 0, width: 20 }}>{country.flag}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {country.name}
                </span>
                <span style={{ flexShrink: 0, color: "var(--tv-text-secondary)" }}>
                  +{country.dialCode}
                </span>
              </button>
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
