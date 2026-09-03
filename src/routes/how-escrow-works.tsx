import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, KeyRound, Timer, AlertTriangle, Banknote, FileImage } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AUTO_RELEASE_HOURS, LISTING_LIFESPAN_DAYS } from "@/lib/pigeon-data";

export const Route = createFileRoute("/how-escrow-works")({
  head: () => ({
    meta: [
      { title: "How PigeonShield Escrow Protects Every Delivery" },
      {
        name: "description",
        content:
          "seller-generated 4-digit handover PINs, Dead on Arrival refunds, breeder waybill escalation and a 48-hour auto-release safety net.",
      },
      { property: "og:title", content: "How PigeonShield Escrow Protects Every Delivery" },
      {
        property: "og:description",
        content: "Understand the escrow, DOA refund loop and 48-hour auto-release clock.",
      },
    ],
  }),
  component: EscrowPage,
});

const STEPS = [
  { icon: Banknote, title: "1. Buyer funds escrow", body: "Money leaves the buyer but never reaches the breeder. PigeonShield holds it as an escrow reserve." },
  { icon: KeyRound, title: "2. reverse PIN handover", body: "The seller generates a 4-digit handover PIN at dispatch and gives it to the driver. The buyer confirms receipt to reveal the same PIN for collection." },
  { icon: ShieldCheck, title: "3. Confirm safe delivery", body: "One tap releases funds to the breeder minus the platform commission set by the administrator." },
  { icon: AlertTriangle, title: "4. Dead on Arrival valve", body: "Reporting DOA halts the release clock instantly, requires video/photo proof and flags the transaction as disputed." },
  { icon: FileImage, title: "5. Breeder escalation", body: "If a buyer stalls maliciously, the breeder uploads a waybill snapshot plus the driver's phone number for admin review." },
  { icon: Timer, title: `6. ${AUTO_RELEASE_HOURS}-hour safety net`, body: `No confirmation and no dispute within ${AUTO_RELEASE_HOURS} hours? The system auto-resolves and pays the breeder.` },
];

function EscrowPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-primary md:text-4xl">How Escrow Works</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Every listing lives for exactly {LISTING_LIFESPAN_DAYS} days and every naira moves through a guarded
        escrow ledger. Keeping chats and payments on-platform is the only way to keep these protections.
      </p>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {STEPS.map((s) => (
          <Card key={s.title} className="p-6">
            <s.icon className="size-6 text-secondary-foreground" />
            <h2 className="mt-3 font-semibold text-foreground">{s.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-8 border-destructive/30 bg-destructive/5 p-6">
        <h2 className="font-semibold text-destructive">Off-platform contact = account termination</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sharing phone numbers or WhatsApp links in public chats to dodge platform fees results in immediate
          account termination and freezing of active funds.
        </p>
      </Card>
    </div>
  );
}
