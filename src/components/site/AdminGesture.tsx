import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";

const GAP_MS = 1500;
const SEQUENCE = ["L", "L", "R", "R"] as const;

/**
 * Global backup entrance: tap top-left x2 then top-right x2 to jump straight to
 * the admin master lock screen at /pigeon-boss-admin from any page.
 */
export function AdminGesture() {
  const navigate = useNavigate();
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
        void navigate({ to: "/pigeon-boss-admin" });
      }
    }

    window.addEventListener("pointerdown", onTap, true);
    return () => window.removeEventListener("pointerdown", onTap, true);
  }, [navigate]);

  return null;
}
