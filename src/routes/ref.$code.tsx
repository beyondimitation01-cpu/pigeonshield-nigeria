import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/ref/$code")({
  head: () => ({
    meta: [
      { title: "Join PigeonShield with a referral | PigeonShield Nigeria" },
      {
        name: "description",
        content: "You were invited to PigeonShield — Nigeria's escrow-protected pigeon marketplace.",
      },
      { property: "og:title", content: "Join PigeonShield with a referral" },
      {
        property: "og:description",
        content: "Buy and sell pigeons with 100% DOA protection through PigeonShield Escrow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReferralLanding,
});

function ReferralLanding() {
  const { code } = Route.useParams();
  const { openAuth, isAuthed } = useStore();
  const navigate = useNavigate();
  const clean = code.trim().toUpperCase();

  useEffect(() => {
    window.localStorage.setItem("pigeonshield.ref", clean);
  }, [clean]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <Card className="space-y-4 p-6 text-center">
        <Gift className="mx-auto size-8 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">You've been invited to PigeonShield</h1>
        <p className="text-sm text-muted-foreground">
          Referral code <span className="font-semibold text-primary">{clean}</span> is saved. Create your
          account and your inviter earns a referral credit.
        </p>
        {isAuthed ? (
          <Button className="w-full" onClick={() => navigate({ to: "/" })}>
            Browse the marketplace
          </Button>
        ) : (
          <Button className="w-full" onClick={() => openAuth("register", null)}>
            Create my free account
          </Button>
        )}
      </Card>
    </main>
  );
}
