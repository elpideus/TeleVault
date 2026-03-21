import { getBaseUrl } from "./client";
import { useAuthStore } from "../store/authStore";

function getToken(): string {
  return useAuthStore.getState().accessToken ?? "";
}

export interface AltAccountOut {
  id: string;
  telegram_id: number;
  label: string | null;
  is_active: boolean;
  last_checked_at: string | null;
  session_error: string | null;
}

export interface AddAccountResponse {
  account: AltAccountOut;
  enrollment_failures: { channel_id: string; error: string }[];
}

export interface QRPollResponse {
  status: "pending" | "complete" | "error";
  message?: string | null;
  account?: AltAccountOut | null;
  enrollment_failures?: { channel_id: string; error: string }[] | null;
}

export const accountsKeys = {
  list: ["accounts", "list"] as const,
  primary: ["accounts", "primary"] as const,
};

export async function getPrimaryAccount(): Promise<AltAccountOut> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/accounts/primary`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`getPrimaryAccount failed: ${res.status}`);
  return res.json();
}

export async function listAltAccounts(): Promise<AltAccountOut[]> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/accounts/`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`listAltAccounts failed: ${res.status}`);
  return res.json();
}

export async function startPhoneLogin(phone: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/accounts/add/phone`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) throw await res.json();
}

export async function submitOtp(
  phone: string,
  code: string,
  password?: string,
): Promise<AddAccountResponse> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/accounts/add/otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ phone, code, password }),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function initQrLogin(): Promise<{ poll_token: string; qr_url: string }> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/accounts/add/qr/init`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
  });
  if (!res.ok) throw new Error(`initQrLogin failed: ${res.status}`);
  return res.json();
}

export async function pollQrLogin(poll_token: string): Promise<QRPollResponse> {
  const baseUrl = getBaseUrl();
  const params = new URLSearchParams({ poll_token });
  const res = await fetch(`${baseUrl}/api/v1/accounts/add/qr/poll?${params}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`pollQrLogin failed: ${res.status}`);
  return res.json();
}

export async function removeAltAccount(account_id: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/accounts/${account_id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`removeAltAccount failed: ${res.status}`);
}
