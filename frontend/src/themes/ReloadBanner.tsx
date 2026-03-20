import { useThemeStore } from "../store/themeStore";

export function ReloadBanner() {
  const confirmReload = useThemeStore((s) => s.confirmReload);
  const dismissReload = useThemeStore((s) => s.dismissReload);

  return (
    <div
      style={{
        position: "fixed",
        top: "var(--tv-navbar-height)",
        left: 0,
        right: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        padding: "8px 16px",
        background: "var(--tv-bg-overlay)",
        borderBottom: "1px solid var(--tv-border-default)",
        font: "var(--tv-type-body-sm)",
        color: "var(--tv-text-secondary)",
      }}
    >
      <span>
        This theme includes component changes. A page reload is required to apply it fully.
      </span>
      <button
        onClick={confirmReload}
        style={{
          padding: "4px 12px",
          borderRadius: "var(--tv-radius-sm)",
          background: "var(--tv-accent-primary)",
          color: "var(--tv-accent-on)",
          border: "none",
          font: "var(--tv-type-label)",
          cursor: "pointer",
        }}
      >
        Reload now
      </button>
      <button
        onClick={dismissReload}
        aria-label="Dismiss"
        style={{
          padding: "4px 8px",
          borderRadius: "var(--tv-radius-sm)",
          background: "transparent",
          color: "var(--tv-text-secondary)",
          border: "1px solid var(--tv-border-default)",
          font: "var(--tv-type-label)",
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}
