import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Lock, ShieldCheck, Percent, Users, Gavel, MessageCircle, Megaphone, Snowflake, PauseCircle, Banknote, Gift,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/site/UserAvatar";
import { AdminListingsTable } from "@/components/site/AdminListingsTable";
import { AdminPendingOrders } from "@/components/site/AdminPendingOrders";
import { AdminFeedbackPanel } from "@/components/site/AdminFeedbackPanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { ADMIN_OPAY, ngn } from "@/lib/pigeon-data";
import { formatNigerianPhone } from "@/lib/phone";
import { supabase } from "@/integrations/supabase/client";

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
    masterUnlock,
    lockAdmin,
    setCommission,
    setWhatsappAlertNumber,
    adminRefund,
    adminRelease,
    banUser,
    sendBroadcast,
    retireBroadcast,
    setUserFlags,
    releaseUserFunds,
    forceMarkDelivered,
  } = useStore();

  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(String(db.commission_pct));
  const [whats, setWhats] = useState(db.whatsapp_alert_number);
  const [announcement, setAnnouncement] = useState("");

  async function attemptUnlock() {
    if (!pwd.trim()) {
      toast.error("Enter the master password.");
      return;
    }
    setBusy(true);
    const { data: verified, error: verificationError } = await supabase.rpc("verify_admin_passphrase", {
      passphrase: pwd.trim(),
    });
    if (verificationError || verified !== true) {
      setBusy(false);
      setPwd("");
      toast.error("Incorrect master password.");
      return;
    }
    const ok = await masterUnlock(pwd.trim());
    setBusy(false);
    setPwd("");
    if (ok) toast.success("Super Admin authenticated. God-mode unlocked.");
    else toast.error("Incorrect master password.");
  }

  if (!adminUnlocked) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
        <Card className="space-y-4 p-6">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Lock className="size-5 text-primary" /> Master Access Required
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the master password to open God-Mode. No regular account is needed — the
            password is verified on the server, which then signs you in as Super Admin.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="master">Master password</Label>
            <Input
              id="master"
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void attemptUnlock();
              }}
            />
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void attemptUnlock()}>
            {busy ? "Verifying…" : "Unlock console"}
          </Button>
        </Card>
      </main>
    );
  }


  const disputes = db.transactions.filter((t) => t.status === "Disputed");
  // Live figures only — no placeholder amounts. Commission counts settled escrow.
  const gross = db.transactions
    .filter((t) => t.status === "Completed")
    .reduce((s, t) => s + t.calculated_commission, 0);
  const pendingPayments = db.transactions.filter((t) => t.status === "Pending Verification").length;

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
        <Card className="p-4"><p className="text-xs text-muted-foreground">Awaiting payment verification</p><p className="text-2xl font-bold">{pendingPayments}</p></Card>
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
        <h2 className="flex items-center gap-2 font-semibold">
          <MessageCircle className="size-4 text-primary" /> WhatsApp alert number
        </h2>
        <div className="flex flex-wrap gap-2">
          <Input
            value={whats}
            onChange={(e) => setWhats(e.target.value)}
            placeholder="2348139049440"
            className="max-w-56"
            inputMode="tel"
          />
          <Button
            onClick={async () => {
              await setWhatsappAlertNumber(whats);
              toast.success("WhatsApp alert number updated.");
            }}
          >
            Save
          </Button>
          <Button variant="outline" asChild>
            <a href={`https://wa.me/${formatNigerianPhone(db.whatsapp_alert_number)}`} target="_blank" rel="noreferrer">
              Test alert
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Dispute, DOA and scam reports are routed to WhatsApp {db.whatsapp_alert_number}.
        </p>
      </Card>


      <AdminListingsTable />

      <AdminPendingOrders />

      <AdminFeedbackPanel />


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
        <h2 className="flex items-center gap-2 font-semibold">Emergency delivery override</h2>
        <p className="text-sm text-muted-foreground">
          Use only when the buyer cannot complete receipt confirmation at the handover point.
        </p>
        {db.transactions.filter((t) => !["Delivered", "Completed", "Refunded to Buyer", "Disputed"].includes(t.status)).length === 0 ? (
          <p className="text-sm text-muted-foreground">No active orders require an override.</p>
        ) : (
          db.transactions
            .filter((t) => !["Delivered", "Completed", "Refunded to Buyer", "Disputed"].includes(t.status))
            .map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3 text-sm">
                <span className="mr-auto truncate font-medium">{t.listing_name} · {ngn(t.amount_naira)}</span>
                <Badge variant="outline">{t.status}</Badge>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await forceMarkDelivered(t.id);
                      toast.success("Order marked delivered and listing removed from active marketplace.");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not mark order delivered.");
                    }
                  }}
                >
                  Force Mark as Delivered
                </Button>
              </div>
            ))
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Megaphone className="size-4 text-primary" /> Admin broadcast
        </h2>
        <p className="text-xs text-muted-foreground">
          The announcement pops up for every user on their next page load, then stays as a banner until
          they dismiss it.
        </p>
        <Textarea
          value={announcement}
          maxLength={500}
          rows={3}
          placeholder="e.g. Escrow payouts run 9am–6pm today."
          onChange={(e) => setAnnouncement(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={async () => {
              const err = await sendBroadcast(announcement);
              if (err) toast.error(err);
              else {
                toast.success("Announcement sent to all users.");
                setAnnouncement("");
              }
            }}
          >
            Send announcement to all users
          </Button>
          {db.broadcast ? (
            <Button variant="outline" onClick={() => void retireBroadcast(db.broadcast!.id)}>
              Clear live announcement
            </Button>
          ) : null}
        </div>
        {db.broadcast ? (
          <p className="rounded-md border border-border bg-muted/50 p-3 text-sm">
            Live now: {db.broadcast.body}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No live announcement.</p>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Users className="size-4 text-primary" /> User &amp; breeder management ({db.users.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">User</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Email</th>
                <th className="p-2">Status</th>
                <th className="p-2">Referred by</th>
                <th className="p-2">Escrow balance</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {db.users.map((u) => {
                const held = db.transactions
                  .filter(
                    (t) =>
                      t.breeder_id === u.id && t.status !== "Completed" && t.status !== "Refunded to Buyer",
                  )
                  .reduce((sum, t) => sum + t.amount_naira, 0);
                const invitedBy = db.referrals.find((r) => r.referred_id === u.id)?.referral_code ?? "—";
                return (
                  <tr key={u.id} className="border-t border-border align-top">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <UserAvatar url={u.avatar_url} name={u.public_handle} size={32} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{u.public_handle}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.real_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-2">{u.phone_number || "—"}</td>
                    <td className="p-2">{u.email || "—"}</td>
                    <td className="space-x-1 p-2">
                      <Badge variant={u.is_verified_seller ? "default" : "outline"}>
                        {u.is_verified_seller ? "Verified" : "Unverified"}
                      </Badge>
                      {u.is_frozen ? <Badge variant="destructive">Frozen</Badge> : null}
                      {u.escrow_paused ? <Badge variant="secondary">Escrow paused</Badge> : null}
                    </td>
                    <td className="p-2">{invitedBy}</td>
                    <td className="p-2 font-semibold">{ngn(held)}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant={u.is_verified_seller ? "default" : "outline"}
                          onClick={async () => {
                            await setUserFlags(u.id, { is_verified_seller: !u.is_verified_seller });
                            toast.success("Verified status updated.");
                          }}
                        >
                          <ShieldCheck className="size-3" /> Verified
                        </Button>
                        <Button
                          size="sm"
                          variant={u.is_frozen ? "destructive" : "outline"}
                          onClick={async () => {
                            await setUserFlags(u.id, { is_frozen: !u.is_frozen });
                            toast.success(u.is_frozen ? "Account unfrozen." : "Account frozen.");
                          }}
                        >
                          <Snowflake className="size-3" /> {u.is_frozen ? "Unfreeze" : "Freeze"}
                        </Button>
                        <Button
                          size="sm"
                          variant={u.escrow_paused ? "secondary" : "outline"}
                          onClick={async () => {
                            await setUserFlags(u.id, { escrow_paused: !u.escrow_paused });
                            toast.success(u.escrow_paused ? "Escrow resumed." : "Escrow paused.");
                          }}
                        >
                          <PauseCircle className="size-3" /> {u.escrow_paused ? "Resume" : "Pause escrow"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const n = await releaseUserFunds(u.id);
                            toast.success(n ? `Released ${n} payout(s).` : "No held funds for this user.");
                          }}
                        >
                          <Banknote className="size-3" /> Release funds
                        </Button>
                        <Button size="sm" variant={u.is_banned ? "outline" : "destructive"} onClick={() => banUser(u.id)}>
                          {u.is_banned ? "Unban" : "Ban"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Gift className="size-4 text-primary" /> Referral tracking ({db.referrals.length})
        </h2>
        {db.referrals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No referrals recorded yet.</p>
        ) : (
          db.referrals.map((r) => {
            const referrer = db.users.find((u) => u.id === r.referrer_id);
            const referred = db.users.find((u) => u.id === r.referred_id);
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
                <span>
                  <span className="font-medium">{referrer?.public_handle ?? r.referrer_id.slice(0, 8)}</span>{" "}
                  referred{" "}
                  <span className="font-medium">{referred?.public_handle ?? r.referred_id.slice(0, 8)}</span>
                </span>
                <Badge variant="outline">Code {r.referral_code} · {r.credits} credit</Badge>
              </div>
            );
          })
        )}
      </Card>
    </main>
  );
}
