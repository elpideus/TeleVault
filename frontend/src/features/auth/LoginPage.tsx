// src/features/auth/LoginPage.tsx
import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAuthStore } from "../../store/authStore";
import { sendPhoneLogin, refreshTokens } from "../../api/auth";
import { listChannels } from "../../api/channels";
import { springGentle, exitTransition } from "../../lib/springs";
import { toast } from "../../lib/toast";
import { BrandBackground } from "./BrandBackground";
import { AuthCard } from "./AuthCard";
import { PhoneStep } from "./PhoneStep";
import { OtpStep } from "./OtpStep";
import { ChannelSetupStep } from "./ChannelSetupStep";

type Step = "phone" | "otp" | "channel-setup";

export function LoginPage() {
  return <LoginForm />;
}

// Separate inner component so the isAuthenticated guard runs after all hooks
function LoginForm() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const shouldReduce = useReducedMotion();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("phone");

  // Auto-refresh: if a refresh token exists but we're not authenticated, use it
  useEffect(() => {
    if (!isAuthenticated && refreshToken) {
      refreshTokens({ refresh_token: refreshToken })
        .then(({ access_token }) => {
          restoreSession(access_token);
          navigate("/browse", { replace: true });
        })
        .catch(() => {/* stay on login */});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [phone, setPhone] = useState("");
  const [codeType, setCodeType] = useState("");
  const [isCheckingChannel, setIsCheckingChannel] = useState(false);

  // sendPhoneLogin mutation — owned here so LoginPage can capture code_type
  const {
    mutate: sendCode,
    isPending: isSending,
    error: sendError,
  } = useMutation({
    mutationFn: (e164: string) => sendPhoneLogin({ phone: e164 }),
    onSuccess: (result, e164) => {
      setPhone(e164);
      setCodeType(result?.code_type ?? "sms");
      setStep("otp");
    },
  });

  async function handleOtpSuccess() {
    setIsCheckingChannel(true);
    try {
      const data = await listChannels();
      if (data?.items.some((c) => c.is_global_default)) {
        navigate("/browse", { replace: true });
      } else {
        setStep("channel-setup");
      }
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status && status >= 400) {
        toast.error("Something went wrong. Please try again.");
      }
      setStep("channel-setup");
    } finally {
      setIsCheckingChannel(false);
    }
  }

  // Redirect if already logged in, unless we're mid channel-setup onboarding
  if (isAuthenticated && step !== "channel-setup" && !isCheckingChannel) {
    return <Navigate to="/browse" replace />;
  }

  const phoneError = sendError
    ? ((sendError as { detail?: { message?: string } })?.detail?.message ??
      "Something went wrong, try again.")
    : null;

  // Embed transition inside each variant so enter → springGentle and
  // exit → exitTransition. A single `transition` prop on motion.div would
  // apply the same preset to both enter and exit, which is wrong per spec.
  const stepVariants = {
    initial: shouldReduce ? {} : { opacity: 0, y: 8 },
    animate: {
      opacity: 1,
      y: 0,
      transition: shouldReduce ? { duration: 0 } : springGentle,
    },
    exit: {
      opacity: 0,
      y: shouldReduce ? 0 : -4,
      transition: shouldReduce ? { duration: 0 } : exitTransition,
    },
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <BrandBackground />

      <AuthCard>
        {isCheckingChannel ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
              Checking account…
            </span>
          </div>
        ) : (
        <AnimatePresence mode="wait">
          {step === "phone" && (
            <motion.div
              key="phone"
              initial="initial"
              animate="animate"
              exit="exit"
              variants={stepVariants}
            >
              <PhoneStep
                onSubmit={(e164) => sendCode(e164)}
                isPending={isSending}
                error={phoneError}
              />
            </motion.div>
          )}

          {step === "otp" && (
            <motion.div
              key="otp"
              initial="initial"
              animate="animate"
              exit="exit"
              variants={stepVariants}
            >
              <OtpStep
                phone={phone}
                codeType={codeType}
                onResend={() => sendCode(phone)}
                onSuccess={handleOtpSuccess}
              />
            </motion.div>
          )}

          {step === "channel-setup" && (
            <motion.div
              key="channel-setup"
              initial="initial"
              animate="animate"
              exit="exit"
              variants={stepVariants}
            >
              <ChannelSetupStep />
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </AuthCard>
    </div>
  );
}
