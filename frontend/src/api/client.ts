import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema";
import { useAuthStore } from "../store/authStore";

const envBase = import.meta.env.VITE_API_BASE_URL || "";
export const clientBaseUrl = envBase.endsWith("/api/v1") ? envBase.slice(0, -7) : envBase.replace(/\/$/, "");

export function getBaseUrl() {
  return clientBaseUrl;
}

export const apiClient = createClient<paths>({
  baseUrl: clientBaseUrl,
});

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

// Attach access token to every outgoing request
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },

  async onResponse({ response, request }) {
    if (response.status !== 401) return response;

    // Already on the refresh endpoint — don't loop
    if (request.url.includes("/auth/refresh")) return response;

    const { refreshToken, setTokens, logout } = useAuthStore.getState();
    if (!refreshToken) {
      logout();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      return response;
    }

    // Serialize concurrent 401s into one refresh
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = (async () => {
        try {
          const base = import.meta.env.VITE_API_BASE_URL || "";
          const baseUrl = base.endsWith("/api/v1") ? base.slice(0, -7) : base.replace(/\/$/, "");
          const oldAccessToken = useAuthStore.getState().accessToken;
          const res = await fetch(
            `${baseUrl}/api/v1/auth/refresh`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refresh_token: refreshToken }),
            },
          );
          if (!res.ok) {
            // Wait a moment to see if another tab successfully refreshed and updated localStorage
            await new Promise(r => setTimeout(r, 500));
            const latestAccessToken = useAuthStore.getState().accessToken;
            if (latestAccessToken && latestAccessToken !== oldAccessToken) {
              return latestAccessToken; // Another tab won the race, use its token
            }
            
            // If the refresh actually failed (401/403), only then logout
            if (res.status === 401 || res.status === 403) {
              logout();
              if (window.location.pathname !== "/login") {
                window.location.href = "/login";
              }
            }
            return null;
          }
          const { access_token, refresh_token } = (await res.json()) as { access_token: string; refresh_token: string };
          setTokens(access_token, refresh_token);
          return access_token;
        } catch (err) {
          // On network errors, don't logout - the user might just be offline
          console.error("Token refresh failed:", err);
          return null;
        } finally {
          isRefreshing = false;
          refreshPromise = null;
        }
      })();
    }

    const newToken = await refreshPromise;
    if (!newToken) return response;

    // Retry the original request with new token.
    // Guard against "body already consumed" — happens when a POST body was
    // read during the first attempt (e.g. check-hash, file upload).  In that
    // case we can't clone the request, so we just return the 401 and let the
    // individual caller decide how to handle it.
    try {
      const retried = new Request(request, {
        headers: new Headers(request.headers),
      });
      retried.headers.set("Authorization", `Bearer ${newToken}`);
      return fetch(retried);
    } catch {
      return response;
    }
  },
};

import { queryClient } from "../app/providers";
import { storageKeys } from "./storage";

const mutationMiddleware: Middleware = {
  async onResponse({ response, request }) {
    if (response.ok && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const url = request.url;
      // If we mutated files or folders, refresh storage stats
      if (
        url.includes("/api/v1/files") || 
        url.includes("/api/v1/folders") || 
        url.includes("/api/v1/upload")
      ) {
        queryClient.invalidateQueries({ queryKey: storageKeys.stats() });
      }
    }
    return response;
  },
};

apiClient.use(authMiddleware);
apiClient.use(mutationMiddleware);
