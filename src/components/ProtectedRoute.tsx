import { useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { AuthPending, AuthRequired } from "@/components/site/AuthGate";
import { useStore } from "@/lib/store";

interface ProtectedRouteProps {
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * Route gate driven purely by AuthContext:
 * - isLoading === true  -> spinner (never bounce, never redirect)
 * - isLoading === false && no user -> sign-in prompt (login modal opens once)
 */
export function ProtectedRoute({ title, description, children }: ProtectedRouteProps) {
  const { isLoading, isAuthenticated } = useAuth();
  const { openAuth } = useStore();
  const prompted = useRef(false);

  useEffect(() => {
    if (isLoading || isAuthenticated || prompted.current) return;
    prompted.current = true;
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(
          "ps_redirect_after_login",
          window.location.pathname + window.location.search,
        );
      } catch {
        // Private-mode storage failure is non-fatal.
      }
    }
    openAuth("login", `${title} is for members only — log in to continue.`);
  }, [isLoading, isAuthenticated, openAuth, title]);

  if (isLoading) return <AuthPending />;
  if (!isAuthenticated) return <AuthRequired title={title} description={description} />;
  return <>{children}</>;
}
