import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { AdminControlCenter } from "@/components/site/AdminControlCenter";
import { touchAdminSession } from "@/lib/admin-gate.functions";

const ADMIN_INACTIVITY_MS = 10 * 60 * 1000;
const ADMIN_TOUCH_THROTTLE_MS = 30 * 1000;

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
  const { adminUnlocked, masterUnlock, lockAdmin } = useStore();
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const lockAdminRef = useRef(lockAdmin);
  const adminUnlockedRef = useRef(adminUnlocked);
  const lastActivityRef = useRef(Date.now());
  const lastTouchRef = useRef(0);
  const inactivityTimerRef = useRef<number | null>(null);
  lockAdminRef.current = lockAdmin;
  adminUnlockedRef.current = adminUnlocked;

  useEffect(() => {
    return () => {
      if (adminUnlockedRef.current) lockAdminRef.current();
    };
  }, []);

  useEffect(() => {
    if (!adminUnlocked) return;

    lastActivityRef.current = Date.now();
    lastTouchRef.current = Date.now();

    const recordActivity = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      if (now - lastTouchRef.current < ADMIN_TOUCH_THROTTLE_MS) return;
      lastTouchRef.current = now;
      void touchAdminSession()
        .then((ok) => {
          if (!ok) lockAdminRef.current();
        })
        .catch(() => undefined);
    };

    const checkInactivity = () => {
      if (Date.now() - lastActivityRef.current >= ADMIN_INACTIVITY_MS) {
        lockAdminRef.current();
        toast.info("Admin Console locked after 10 minutes of inactivity.");
        return;
      }
      inactivityTimerRef.current = window.setTimeout(checkInactivity, 1000);
    };

    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart", "scroll", "mousemove"];
    events.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    inactivityTimerRef.current = window.setTimeout(checkInactivity, 1000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, recordActivity));
      if (inactivityTimerRef.current !== null) window.clearTimeout(inactivityTimerRef.current);
    };
  }, [adminUnlocked]);

  async function attemptUnlock() {
    if (!pwd.trim()) {
      toast.error("Enter the master password.");
      return;
    }
    setBusy(true);
    const ok = await masterUnlock(pwd.trim());
    setBusy(false);
    setPwd("");
    if (ok) {
      toast.success("Administrator authenticated.");
      // masterUnlock exchanges the one-time Super Admin token for a new
      // Supabase session. Reload after success so the application hydrates
      // from that new identity instead of briefly retaining the previous
      // marketplace account in its in-memory auth snapshot.
      window.location.reload();
    } else {
      toast.error("Incorrect master password.");
    }
  }

  if (!adminUnlocked) {
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
