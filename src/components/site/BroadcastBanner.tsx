import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";

const KEY = "pigeonshield.broadcast.seen";

/**
 * Platform-wide admin announcement: a modal on the first page load of a
 * session, then a sticky banner until the visitor dismisses that message.
 */
export function BroadcastBanner() {
  const { db } = useStore();
  const broadcast = db.broadcast;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(KEY));
  }, []);

  useEffect(() => {
    if (broadcast && dismissed !== broadcast.id) setModalOpen(true);
  }, [broadcast, dismissed]);

  if (!broadcast || dismissed === broadcast.id) return null;

  function dismiss() {
    if (!broadcast) return;
    window.localStorage.setItem(KEY, broadcast.id);
    setDismissed(broadcast.id);
    setModalOpen(false);
  }

  return (
    <>
      <Dialog open={modalOpen} onOpenChange={(o) => (o ? setModalOpen(true) : setModalOpen(false))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Megaphone className="size-5" /> Announcement from PigeonShield
            </DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm text-foreground">{broadcast.body}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Remind me later
            </Button>
            <Button onClick={dismiss}>Got it</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="fixed inset-x-0 top-16 z-40 border-b border-primary/30 bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2 text-sm">
          <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="flex-1 leading-snug">{broadcast.body}</p>
          <button type="button" aria-label="Dismiss announcement" onClick={dismiss} className="mt-0.5">
            <X className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}
