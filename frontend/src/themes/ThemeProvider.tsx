import { useEffect } from "react";
import { useThemeStore } from "../store/themeStore";
import { ReloadBanner } from "./ReloadBanner";

// Statically enumerate all theme token files so Vite bundles them at build time.
// Using import.meta.glob with { query: "?raw" } avoids runtime path resolution,
// which broke in production because @vite-ignore prevented Vite from processing
// the import and the browser got an HTML 404 response instead of CSS text.
const themeTokens = import.meta.glob("../themes/*/tokens.css", {
  query: "?raw",
  import: "default",
  eager: false,
}) as Record<string, () => Promise<string>>;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const activeTheme = useThemeStore((s) => s.activeTheme);
  const pendingReload = useThemeStore((s) => s.pendingReload);

  useEffect(() => {
    // Dynamically import the token layer of the active theme as raw CSS
    // and inject it into a <style> tag — replacing the previous one.
    // This is Tier 1 switching: instant, no remount, no state loss.
    const key = `../themes/${activeTheme}/tokens.css`;
    const loader = themeTokens[key];
    if (!loader) return;
    loader()
      .then((css: string) => {
        let styleEl = document.getElementById("tv-theme-tokens") as HTMLStyleElement | null;
        if (!styleEl) {
          styleEl = document.createElement("style");
          styleEl.id = "tv-theme-tokens";
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = css;
      })
      .catch(() => {
        // Fallback: theme not found, default tokens.css stays active
      });
  }, [activeTheme]);

  return (
    <>
      {pendingReload && <ReloadBanner />}
      {children}
    </>
  );
}
