import type React from "react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ConfirmActionDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  children: React.ReactNode;
  destructive?: boolean;
  onConfirm: () => Promise<boolean> | boolean;
};

/** Reusable confirmation gate for destructive or high-impact actions. */
export function ConfirmActionDialog({
  title,
  description,
  confirmLabel,
  children,
  destructive = true,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm(event: React.MouseEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const success = await onConfirm();
      if (success) {
        // Allow Radix to close only after the protected action succeeds.
        (event.currentTarget as HTMLElement).click();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            disabled={busy}
            onClick={handleConfirm}
          >
            {busy ? "Working..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
