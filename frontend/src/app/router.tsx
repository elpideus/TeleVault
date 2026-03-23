import { useState, useEffect } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { refreshTokens } from "../api/auth";
import { AppShell } from "../features/explorer/AppShell";
import { FileExplorer } from "../features/explorer/FileExplorer";

// ── Placeholder pages ─────────────────────────────────────────────────────────

function NotFoundPage() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "var(--tv-bg-base)",
        color: "var(--tv-text-secondary)",
        font: "var(--tv-type-headline)",
      }}
    >
      404 — Not Found
    </div>
  );
}

// ── Protected route guard ────────────────────────────────────────────────────

function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const logout = useAuthStore((s) => s.logout);
  const [checking, setChecking] = useState(!isAuthenticated && !!refreshToken);

  useEffect(() => {
    if (!isAuthenticated && refreshToken) {
      refreshTokens({ refresh_token: refreshToken })
        .then(({ access_token }) => restoreSession(access_token))
        .catch(() => logout())
        .finally(() => setChecking(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// ── Router ───────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/browse" replace />,
  },
  {
    path: "/login",
    lazy: () =>
      import("../features/auth/LoginPage").then((m) => ({
        Component: m.LoginPage,
      })),
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: "/browse",
            element: <FileExplorer />,
          },
          {
            path: "/browse/*",
            element: <FileExplorer />,
          },
        ],
      },
    ],
  },
  ...(import.meta.env.DEV || import.meta.env.VITE_ENABLE_PREVIEW === "true"
    ? [
        {
          path: "/preview",
          lazy: () =>
            import("../preview/PreviewPage").then((m) => ({
              Component: m.PreviewPage,
            })),
        },
      ]
    : []),
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);
