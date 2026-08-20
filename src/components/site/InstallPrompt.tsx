import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "pigeonshield.install.dismissed";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Bottom "Add to Home Screen" bar for mobile browsers that support install. */
export function InstallPrompt() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(KEY) === "1") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    setHidden(false);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden || !evt) return null;

  function dismiss() {
    window.localStorage.setItem(KEY, "1");
    setHidden(true);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 p-3 backdrop-blur md:hidden">
      <div className="flex items-center gap-3">
        <img src="/pwa-icon-192.png" alt="" width={40} height={40} loading="lazy" className="size-10 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Add PigeonShield to your home screen</p>
          <p className="text-xs text-muted-foreground">Install the app for faster escrow checks.</p>
        </div>
        <Button
          size="sm"
          onClick={async () => {
            await evt.prompt();
            await evt.userChoice;
            dismiss();
          }}
        >
          <Download className="size-4" /> Install
        </Button>
        <button type="button" aria-label="Dismiss install prompt" onClick={dismiss}>
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
