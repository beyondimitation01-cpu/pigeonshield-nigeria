import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Fixed banner shown whenever the device loses connectivity. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-16 z-40 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-xs font-semibold text-destructive-foreground"
    >
      <WifiOff className="size-4" />
      You are offline. Listings shown may be out of date — reconnect to buy or post.
    </div>
  );
}
