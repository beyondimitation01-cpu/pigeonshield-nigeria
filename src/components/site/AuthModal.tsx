import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { AvatarUploader } from "@/components/site/AvatarUploader";
import { NIGERIAN_STATES, TERMS_TEXT } from "@/lib/pigeon-data";

export function AuthModal() {
  const { authGate, closeAuth, openAuth, login, register, user, updateProfile } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [state, setState] = useState("Lagos");
  const [invite, setInvite] = useState("");
  const [photoStep, setPhotoStep] = useState(false);
  const [loft, setLoft] = useState("");
  const mode = authGate.mode;

  // A visitor who arrived through /ref/CODE has the inviter code stashed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setInvite(window.localStorage.getItem("pigeonshield.ref") ?? "");
  }, [authGate.open]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "");
    const password = String(f.get("password") ?? "");
    if (mode === "login") {
      const err = await login(email, password);
      setError(err);
      if (!err) {
        toast.success("Session restored — you stay logged in through refreshes.");
        goToIntendedRoute();
      }
      return;
    }
    if (!agreed) {
      setError("You must accept the PigeonShield Nigeria Terms of Service to register.");
      return;
    }

    const publicHandle = String(f.get("real_name") ?? "").trim();
    const loftName = loft.trim();
    const { data: availability, error: availabilityError } = await supabase
      .rpc("check_registration_name_availability", {
        _public_handle: publicHandle,
        _loft_name: loftName,
      })
      .maybeSingle();
    if (availabilityError) {
      setError("We could not verify username and loft-name availability. Please try again.");
      return;
    }
    const usernameTaken = availability?.username_taken === true;
    const loftNameTaken = availability?.loft_name_taken === true;
    if (usernameTaken || loftNameTaken) {
      const messages = [
        usernameTaken ? "Username already exists. Please choose another." : null,
        loftNameTaken ? "Loft name already exists. Please choose another." : null,
      ].filter(Boolean);
      setError(messages.join(" "));
      return;
    }

    const err = await register({
      real_name: String(f.get("real_name") ?? ""),
      loft_name: loftName,
      email,
      password,
      phone_number: String(f.get("phone_number") ?? ""),
      home_state: state,
      bank_name: String(f.get("bank_name") ?? ""),
      account_number: String(f.get("account_number") ?? ""),
      referral_code: invite,
    });
    setError(err);
    if (!err) {
      toast.success("Account created — you are signed in instantly.");
      setPhotoStep(true);
    }
  }

  /** Client-side transition back to where the guest was blocked — never a hard reload. */
  function goToIntendedRoute() {
    let target = "/";
    if (typeof window !== "undefined") {
      try {
        const saved = window.sessionStorage.getItem("ps_redirect_after_login");
        window.sessionStorage.removeItem("ps_redirect_after_login");
        if (saved && saved.startsWith("/")) target = saved;
      } catch {
        // Private-mode storage failure is non-fatal.
      }
    }
    void navigate({ to: target });
  }

  return (
    <Dialog open={authGate.open} onOpenChange={(o) => (o ? null : closeAuth())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ShieldCheck className="size-5" />
            {mode === "login" ? "Log in to PigeonShield" : "Create your breeder account"}
          </DialogTitle>
        </DialogHeader>

        {photoStep && user ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add a profile picture so buyers recognise you. You can skip and add it later.
            </p>
            <AvatarUploader
              userId={user.id}
              value={user.avatar_url}
              onChange={async (url) => {
                await updateProfile({ avatar_url: url });
              }}
            />
            <Button
              className="w-full"
              onClick={() => {
                setPhotoStep(false);
                closeAuth();
                goToIntendedRoute();
              }}
            >
              Continue to marketplace
            </Button>
          </div>
        ) : (
        <>
        {authGate.warning ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>{authGate.warning}</span>
          </div>
        ) : null}

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" ? (
            <div className="space-y-1.5">
              <Label htmlFor="real_name">Full name (shown on your listings)</Label>
              <Input id="real_name" name="real_name" required placeholder="Musa Ibrahim" />
              <Label htmlFor="loft_name" className="pt-2">Loft / farm name (optional)</Label>
              <Input
                id="loft_name"
                value={loft}
                onChange={(e) => setLoft(e.target.value)}
                placeholder="Kano Royal Loft"
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="you@example.ng" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required minLength={6} />
          </div>

          {mode === "register" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="phone_number">Phone number (shown to buyers)</Label>
                  <Input id="phone_number" name="phone_number" required placeholder="0803..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Home state</Label>
                  <Select value={state} onValueChange={setState}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {NIGERIAN_STATES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bank_name">Payout bank</Label>
                  <Input id="bank_name" name="bank_name" required placeholder="OPay" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account_number">Account number</Label>
                  <Input id="account_number" name="account_number" required placeholder="0123456789" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="referral_code">Referral code (optional)</Label>
                <Input
                  id="referral_code"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value.toUpperCase())}
                  placeholder="ABC12345"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
                <Checkbox
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(v === true)}
                  className="mt-0.5"
                  aria-label="Accept terms"
                />
                <span>{TERMS_TEXT}</span>
              </label>
            </>
          ) : null}

          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

          <Button type="submit" className="w-full" size="lg">
            {mode === "login" ? "Log in securely" : "Create escrow-protected account"}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              New breeder?{" "}
              <button className="font-semibold text-primary underline" onClick={() => { setError(null); openAuth("register", authGate.warning); }}>
                Register here
              </button>
            </>
          ) : (
            <>
              Already registered?{" "}
              <button className="font-semibold text-primary underline" onClick={() => { setError(null); openAuth("login", authGate.warning); }}>
                Log in
              </button>
            </>
          )}
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
