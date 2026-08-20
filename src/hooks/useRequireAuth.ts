import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { GUEST_BLOCK_MESSAGE } from "@/hooks/useAuthGuard";

/** Client-side route protection: blocks rendering and opens the login gate. */
export function useRequireAuth(area: string) {
  const { isAuthed, authReady, openAuth } = useStore();
  const warned = useRef(false);

  useEffect(() => {
    // Wait for getSession() so signed-in users are never bounced on a refresh.
    if (!authReady || isAuthed) return;
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem("ps_redirect_after_login", window.location.pathname + window.location.search);
      } catch {
        // Private-mode storage failure is non-fatal.
      }
    }
    if (!warned.current) {
      warned.current = true;
      toast.error(GUEST_BLOCK_MESSAGE, { description: `Protected area: ${area}` });
    }
    openAuth("login", `${GUEST_BLOCK_MESSAGE} — the ${area} is for members only.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, authReady, area]);

  return isAuthed;
}
