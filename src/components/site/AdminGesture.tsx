import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useStore } from "@/lib/store";

const GAP_MS = 1500;
const SEQUENCE = ["L", "L", "R", "R"] as const;

/** Global backup entrance: tap top-left x2 then top-right x2 to force the admin lock screen. */
export function AdminGesture() {
  const navigate = useNavigate();
  const { unlockAdmin } = useStore();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const taps = useRef<string[]>([]);
  const last = useRef(0);

  useEffect(() => {
    function onTap(e: PointerEvent) {
      const zoneH = Math.max(90, window.innerHeight * 0.15);
      const zoneW = window.innerWidth * 0.25;
      if (e.clientY > zoneH) return;

      let corner: "L" | "R" | null = null;
      if (e.clientX <= zoneW) corner = "L";
      else if (e.clientX >= window.innerWidth - zoneW) corner = "R";
      if (!corner) return;

      const now = Date.now();
      if (now - last.current > GAP_MS) taps.current = [];
      last.current = now;
      taps.current.push(corner);
      if (taps.current.length > SEQUENCE.length) taps.current = taps.current.slice(-SEQUENCE.length);

      if (taps.current.join("") === SEQUENCE.join("")) {
        taps.current = [];
        setOpen(true);
      }
    }

    window.addEventListener("pointerdown", onTap, true);
    return () => window.removeEventListener("pointerdown", onTap, true);
  }, []);

  if (!open) return null;

  function submit() {
    if (unlockAdmin(pwd)) {
      setOpen(false);
      setPwd("");
      toast.success("God-mode unlocked.");
      navigate({ to: "/pigeon-boss-admin" });
    } else {
      toast.error("Incorrect master password.");
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md animate-in slide-in-from-bottom duration-300 rounded-t-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Lock className="size-5 text-primary" /> Master Access Required
          </h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="gesture-master">Master password</Label>
          <Input
            id="gesture-master"
            type="password"
            autoFocus
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <Button className="mt-4 w-full" onClick={submit}>
          Unlock console
        </Button>
      </div>
    </div>
  );
}
