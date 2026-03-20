import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface AuthUser {
  id: string;
  phone: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  vault_hash: string;
}

interface AuthStore {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  rememberMe: boolean;
  isAuthenticated: boolean;
  login: (params: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
    rememberMe: boolean;
  }) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
  setTokens: (access: string, refresh: string) => void;
  restoreSession: (accessToken: string) => void;
  setRememberMe: (value: boolean) => void;
  avatarDataUrl: string | null;
  setAvatarDataUrl: (url: string | null) => void;
  fetchAndCacheAvatar: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      rememberMe: false,
      isAuthenticated: false,
      login: ({ accessToken, refreshToken, user, rememberMe }) =>
        set({ accessToken, refreshToken, user, rememberMe, isAuthenticated: true }),
      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          avatarDataUrl: null,
        }),
      setAccessToken: (token) => set({ accessToken: token }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      restoreSession: (accessToken) => set({ accessToken, isAuthenticated: true }),
      setRememberMe: (value) => set({ rememberMe: value }),
      avatarDataUrl: null,
      setAvatarDataUrl: (url) => set({ avatarDataUrl: url }),
      fetchAndCacheAvatar: async () => {
        const { accessToken } = get()
        if (!accessToken) return
        const envBase = import.meta.env.VITE_API_BASE_URL || ""
        const baseUrl = envBase.endsWith("/api/v1")
          ? envBase.slice(0, -7)
          : envBase.replace(/\/$/, "")
        try {
          const res = await fetch(`${baseUrl}/api/v1/auth/me/photo`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (res.status === 204) {
            set({ avatarDataUrl: null })
            return
          }
          if (!res.ok) {
            set({ avatarDataUrl: null })
            return
          }
          const arrayBuffer = await res.arrayBuffer()
          const bytes = new Uint8Array(arrayBuffer)
          let binary = ""
          bytes.forEach((b) => { binary += String.fromCharCode(b) })
          const base64 = btoa(binary)
          const contentType = res.headers.get("content-type") ?? "image/jpeg"
          set({ avatarDataUrl: `data:${contentType};base64,${base64}` })
        } catch {
          set({ avatarDataUrl: null })
        }
      },
    }),
    {
      name: "televault-auth",
      // Only persist tokens when rememberMe is true
      storage: createJSONStorage(() => localStorage),
      partialize: (state) =>
        state.rememberMe
          ? {
              accessToken: state.accessToken,
              refreshToken: state.refreshToken,
              user: state.user,
              rememberMe: state.rememberMe,
              isAuthenticated: state.isAuthenticated,
              avatarDataUrl: state.avatarDataUrl,
            }
          : { rememberMe: state.rememberMe },
    },
  ),
);
