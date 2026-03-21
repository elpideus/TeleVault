import { apiClient } from "./client";
import type { PhoneLoginIn, OTPSubmitIn, RefreshIn } from "./schema";

export const authKeys = {
  me: ["auth", "me"] as const,
};

export async function sendPhoneLogin(body: PhoneLoginIn) {
  const { data, error } = await apiClient.POST("/api/v1/auth/phone", {
    body,
  });
  if (error) throw error;
  return data;
}

export async function submitOtp(body: OTPSubmitIn) {
  const { data, error } = await apiClient.POST("/api/v1/auth/otp", { body });
  if (error) throw error;
  return data;
}

export async function refreshTokens(body: RefreshIn) {
  const { data, error } = await apiClient.POST("/api/v1/auth/refresh", {
    body,
  });
  if (error) throw error;
  return data;
}

export async function logout(body: RefreshIn) {
  await apiClient.POST("/api/v1/auth/logout", { body });
}

export async function getMe() {
  const { data, error } = await apiClient.GET("/api/v1/auth/me");
  if (error) throw error;
  return data;
}
