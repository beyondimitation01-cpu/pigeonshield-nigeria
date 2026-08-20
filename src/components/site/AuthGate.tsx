import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";

/**
 * Client-side protected-route shell.
 * - session check still running  -> spinner (never bounce a signed-in user)
 * - check finished, no session   -> sign-in prompt
 * - session present              -> children
 */
export function AuthGate({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { authReady, isAuthed, user, openAuth } = useStore();

  if (!authReady) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <Loader2 className="size-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Restoring your secure session…</p>
      </main>
    );
  }

  if (!isAuthed || !user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-muted-foreground">{description}</p>
        <Button className="mt-6" onClick={() => openAuth("login")}>
          Register / Log In
        </Button>
      </main>
    );
  }

  return <>{children}</>;
}
