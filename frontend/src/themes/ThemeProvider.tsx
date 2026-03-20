import { useEffect } from "react";
import { useThemeStore } from "../store/themeStore";
import { ReloadBanner } from "./ReloadBanner";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const activeTheme = useThemeStore((s) => s.activeTheme);
  const pendingReload = useThemeStore((s) => s.pendingReload);

  useEffect(() => {
    // Dynamically import the token layer of the active theme as raw CSS
    // and inject it into a <style> tag — replacing the previous one.
    // This is Tier 1 switching: instant, no remount, no state loss.
    import(/* @vite-ignore */ `../themes/${activeTheme}/tokens.css?raw`)
      .then((mod: { default: string }) => {
        let styleEl = document.getElementById("tv-theme-tokens") as HTMLStyleElement | null;
        if (!styleEl) {
          styleEl = document.createElement("style");
          styleEl.id = "tv-theme-tokens";
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = mod.default;
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
