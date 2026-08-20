import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Lock, ShieldCheck, Percent, Users, Gavel, KeyRound, ListX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { ADMIN_OPAY, ngn } from "@/lib/pigeon-data";

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
  const {
    db,
    adminUnlocked,
    unlockAdmin,
    lockAdmin,
    setCommission,
    setListingOverride,
    deleteListing,
    adminRefund,
    adminRelease,
    bypassPasscode,
    banUser,
  } = useStore();

  const [pwd, setPwd] = useState("");
  const [pct, setPct] = useState(String(db.commission_pct));
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});

  if (!adminUnlocked) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
        <Card className="space-y-4 p-6">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Lock className="size-5 text-primary" /> Master Access Required
          </h1>
          <div className="space-y-1.5">
            <Label htmlFor="master">Master password</Label>
            <Input id="master" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          </div>
          <Button
            className="w-full"
            onClick={() => {
              if (unlockAdmin(pwd)) toast.success("God-mode unlocked.");
              else toast.error("Incorrect master password.");
            }}
          >
            Unlock console
          </Button>
        </Card>
      </main>
    );
  }

  const disputes = db.transactions.filter((t) => t.status === "Disputed");
  const gross = db.transactions.reduce((s, t) => s + t.calculated_commission, 0);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <ShieldCheck className="size-7 text-primary" /> God-Mode Console
        </h1>
        <Button variant="outline" onClick={lockAdmin}>Lock console</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total commission earned</p><p className="text-2xl font-bold text-primary">{ngn(gross)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Settlement wallet</p><p className="text-2xl font-bold">OPay {ADMIN_OPAY}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Open disputes</p><p className="text-2xl font-bold text-destructive">{disputes.length}</p></Card>
      </div>

      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Percent className="size-4 text-primary" /> Global commission</h2>
        <div className="flex gap-2">
          <Input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} className="max-w-32" />
          <Button onClick={() => { setCommission(Number(pct)); toast.success(`Commission set to ${pct}%`); }}>Apply</Button>
        </div>
        <p className="text-xs text-muted-foreground">Currently {db.commission_pct}% on every escrow settlement.</p>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold"><ListX className="size-4 text-primary" /> Listing control ({db.listings.length})</h2>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {db.listings.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.custom_bird_name}</p>
                <p className="text-xs text-muted-foreground">{l.breeder_handle} · {ngn(l.price_ngn)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 w-24"
                  type="number"
                  placeholder="% override"
                  defaultValue={l.commission_override ?? ""}
                  onBlur={(e) => setListingOverride(l.id, e.target.value === "" ? null : Number(e.target.value))}
                />
                <Button size="sm" variant="destructive" onClick={() => deleteListing(l.id)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Gavel className="size-4 text-primary" /> Dispute intervention</h2>
        {disputes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active disputes.</p>
        ) : (
          disputes.map((t) => (
            <div key={t.id} className="space-y-2 rounded-md border border-destructive/30 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{t.listing_name} · {ngn(t.amount_naira)}</span>
                <Badge variant="destructive">{t.dispute_status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Proof: {t.proof_file_name ?? "—"} · Driver: {t.driver_phone ?? "—"} · Waybill: {t.waybill_image_url ?? "—"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { adminRelease(t.id); toast.success("Payout released to breeder."); }}>Release to breeder</Button>
                <Button size="sm" variant="destructive" onClick={() => { adminRefund(t.id); toast.success("Buyer fully refunded."); }}>Refund buyer 100%</Button>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="size-4 text-primary" /> 2FA passcode bypass</h2>
        {db.transactions.slice(0, 8).map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm">
            <span className="mr-auto truncate font-medium">{t.listing_name}</span>
            <Input
              className="h-8 w-32"
              placeholder="PS-XXXX"
              value={codeInputs[t.id] ?? ""}
              onChange={(e) => setCodeInputs((s) => ({ ...s, [t.id]: e.target.value }))}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                bypassPasscode(t.id, codeInputs[t.id] ?? "")
                  ? toast.success("Passcode match verified.")
                  : toast.error("Passcode mismatch.")
              }
            >
              Verify
            </Button>
          </div>
        ))}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Users className="size-4 text-primary" /> User management ({db.users.length})</h2>
        {db.users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{u.public_handle}</p>
              <p className="text-xs text-muted-foreground">{u.real_name} · {u.email} · {u.bank_name} {u.account_number}</p>
            </div>
            <Button size="sm" variant={u.is_banned ? "outline" : "destructive"} onClick={() => banUser(u.id)}>
              {u.is_banned ? "Unban" : "Ban"}
            </Button>
          </div>
        ))}
      </Card>
    </main>
  );
}
