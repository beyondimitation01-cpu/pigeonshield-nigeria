import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authEventRevision = useRef(0);

  useEffect(() => {
    let mounted = true;

    // Live listener: keeps user/session in sync across login, token refresh, and logout.
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      // Mark every authoritative auth event. The getSession request below may
      // have started before a login completed, so its eventual result must not
      // be allowed to replace this newer state.
      authEventRevision.current += 1;
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED" ||
        event === "INITIAL_SESSION"
      ) {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
      } else if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
      }
    });

    // On mount, read any existing local storage token before declaring auth ready.
    const revisionAtRequestStart = authEventRevision.current;
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          console.error("[AuthContext] getSession error:", error);
        }
        // Ignore a stale startup response when SIGNED_IN, SIGNED_OUT, token
        // refresh, or INITIAL_SESSION has already supplied newer auth state.
        if (authEventRevision.current === revisionAtRequestStart) {
          setSession(data.session);
          setUser(data.session?.user ?? null);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        console.error("[AuthContext] getSession failed:", err);
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    isLoading,
    isAuthenticated: !!user && !!session,
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
