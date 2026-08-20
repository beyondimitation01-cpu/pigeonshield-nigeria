import { useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useStore } from "@/lib/store";

export const GUEST_BLOCK_MESSAGE = "Please login or create an account to proceed";

/**
 * Strict guest barrier for every sensitive action (buy, post, order, chat, report).
 * Blocks the action, toasts, and opens the login gate carrying the route the user
 * came from so they land back where they were after signing in.
 */
export function useAuthGuard() {
  const { isAuthed, authReady, openAuth } = useStore();
  const router = useRouter();

  const requireAuth = useCallback(
    (action?: string): boolean => {
      if (isAuthed) return true;
      const redirect = router.state.location.href;
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem("ps_redirect_after_login", redirect);
        } catch {
          // Private-mode storage failure is non-fatal.
        }
      }
      toast.error(GUEST_BLOCK_MESSAGE, action ? { description: action } : undefined);
      openAuth("login", action ? `${GUEST_BLOCK_MESSAGE} — ${action}` : GUEST_BLOCK_MESSAGE);
      return false;
    },
    [isAuthed, openAuth, router],
  );

  return { isAuthed, authReady, requireAuth };
}
