import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Toaster } from "sonner";
import { ThemeProvider } from "../themes/ThemeProvider";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipPrimitive.Provider delayDuration={200} skipDelayDuration={300}>
      <ThemeProvider>
        {children}
        <Toaster
          position="top-right"
          closeButton
          toastOptions={{
            style: {
              background: "var(--tv-bg-overlay)",
              border: "1px solid var(--tv-border-default)",
              color: "var(--tv-text-primary)",
              font: "var(--tv-type-body-sm)",
              paddingRight: "36px",
            },
          }}
        />
      </ThemeProvider>
      </TooltipPrimitive.Provider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
