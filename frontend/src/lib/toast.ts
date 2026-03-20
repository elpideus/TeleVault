import { toast as sonnerToast } from "sonner";

export const toast = {
  success: (msg: string, duration = 8000) =>
    sonnerToast.success(msg, { duration }),
  error: (msg: string) => sonnerToast.error(msg, { duration: Infinity }),
  info: (msg: string, duration = 8000) =>
    sonnerToast.info(msg, { duration }),
};
