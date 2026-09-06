import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { SITE_NAME, canonicalUrl } from "@/lib/site";
import { toast } from "sonner";

export const Route = createFileRoute("/update-password")({
  head: () => ({
    meta: [
      { title: `Update password — ${SITE_NAME}` },
      {
        name: "description",
        content: "Securely set a new PigeonShield Nigeria account password.",
      },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/update-password") }],
  }),
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const { openAuth } = useStore();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [updated, setUpdated] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || !isAuthenticated) return;

    if (password.length < 6) {
      setError("Your new password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setError(null);
    setPending(true);
    try {
      // Supabase validates the authenticated recovery session server-side.
      // The page never accepts or stores recovery tokens itself.
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError("We could not update your password. Please request a new reset link and try again.");
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setUpdated(true);
      toast.success("Password updated successfully.");
    } finally {
      setPending(false);
    }
  }

  function returnToLogin() {
    void navigate({ to: "/" });
    openAuth("login");
  }

  return (
    <main className="min-h-[70vh] px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-primary">Set a new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a new password for your PigeonShield account.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Verifying your secure reset session…
          </div>
        ) : updated ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground" role="status">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>Your new password is active. You can continue using your account.</span>
            </div>
            <Button className="w-full" size="lg" onClick={() => void navigate({ to: "/" })}>
              Continue to PigeonShield
            </Button>
          </div>
        ) : !isAuthenticated ? (
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-muted-foreground">
              This password-reset session is missing or has expired. Request a new reset link from the login screen.
            </div>
            <Button className="w-full" size="lg" onClick={returnToLogin}>
              Return to log in
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" size="lg" disabled={pending}>
              {pending ? "Updating password…" : "Update password securely"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
