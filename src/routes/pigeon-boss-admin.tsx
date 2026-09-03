import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { AdminControlCenter } from "@/components/site/AdminControlCenter";

export const Route = createFileRoute("/pigeon-boss-admin")({
  head: () => ({
    meta: [
      { title: "Administrator Console" },
      { name: "description", content: "Restricted PigeonShield operations console." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { isAuthed, adminUnlocked, masterUnlock, lockAdmin } = useStore();
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const lockAdminRef = useRef(lockAdmin);
  lockAdminRef.current = lockAdmin;

  useEffect(() => {
    return () => {
      lockAdminRef.current();
    };
  }, []);

  async function attemptUnlock() {
    if (!pwd.trim()) {
      toast.error("Enter the master password.");
      return;
    }
    setBusy(true);
    const { data: verified, error } = await supabase.rpc("verify_admin_passphrase", { passphrase: pwd.trim() });
    if (verified !== true || error) {
      setBusy(false);
      setPwd("");
      toast.error("Incorrect master password.");
      return;
    }
    const ok = await masterUnlock(pwd.trim());
    setBusy(false);
    setPwd("");
    if (ok) toast.success("Administrator authenticated.");
    else toast.error("Administrator authentication failed.");
  }

  if (!adminUnlocked) {
    if (isAuthed) {
      return (
        <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
          <Card className="space-y-3 p-6 text-center">
            <Lock className="mx-auto size-8 text-destructive" />
            <h1 className="text-xl font-bold">Administrator access required</h1>
            <p className="text-sm text-muted-foreground">This signed-in marketplace account is not authorized for the Admin Control Center.</p>
          </Card>
        </main>
      );
    }

    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
        <Card className="space-y-4 p-6">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold"><Lock className="size-5 text-primary" /> Master Access Required</h1>
            <p className="mt-2 text-sm text-muted-foreground">Authenticate the administrator identity to open the control center.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="master">Master password</Label>
            <Input id="master" type="password" autoComplete="current-password" value={pwd} onChange={(e) => setPwd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void attemptUnlock(); }} />
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void attemptUnlock()}>{busy ? "Verifying…" : "Authenticate administrator"}</Button>
        </Card>
      </main>
    );
  }

  return <AdminControlCenter />;
}
