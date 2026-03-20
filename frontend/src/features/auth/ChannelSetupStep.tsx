// frontend/src/features/auth/ChannelSetupStep.tsx
import { useNavigate } from "react-router-dom";
import { ChannelPicker } from "./ChannelPicker";

export function ChannelSetupStep() {
  const navigate = useNavigate();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1
          style={{
            margin: 0,
            font: "var(--tv-type-headline)",
            color: "var(--tv-text-primary)",
          }}
        >
          Choose a storage channel
        </h1>
        <p
          style={{
            margin: 0,
            font: "var(--tv-type-body-sm)",
            color: "var(--tv-text-secondary)",
          }}
        >
          Select or create a Telegram channel where your files will be stored.
        </p>
      </div>

      <ChannelPicker onDone={() => navigate("/browse", { replace: true })} />
    </div>
  );
}
