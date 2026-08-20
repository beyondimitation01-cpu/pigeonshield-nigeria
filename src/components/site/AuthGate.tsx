import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";

/** Shown while supabase.auth.getSession() is still resolving — never bounce a signed-in user. */
export function AuthPending() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <Loader2 className="size-7 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Restoring your secure session…</p>
    </main>
  );
}

/** Shown once the session check finished and there is no signed-in user. */
export function AuthRequired({ title, description }: { title: string; description: string }) {
  const { openAuth } = useStore();
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
