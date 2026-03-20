// src/features/auth/AuthCard.tsx

interface AuthCardProps {
  children: React.ReactNode;
}

export function AuthCard({ children }: AuthCardProps) {
  return (
    // Full-viewport centering wrapper
    <div
      style={{
        position: "relative",
        zIndex: 1,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--tv-bg-glass)",
          backdropFilter: "blur(var(--tv-glass-blur))",
          WebkitBackdropFilter: "blur(var(--tv-glass-blur))",
          border: "1px solid var(--tv-border-default)",
          borderTop: "1px solid var(--tv-border-strong)",
          borderRadius: "var(--tv-radius-xl)",
          boxShadow: "var(--tv-shadow-lg)",
          padding: "32px",
        }}
      >
        {children}
      </div>
    </div>
  );
}
