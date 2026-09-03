import { useMemo, useState } from "react";
import {
  Bell, ChevronLeft, ChevronRight, LayoutDashboard, ListChecks, Menu, MessageSquareWarning,
  Percent, Settings, ShieldCheck, ShoppingBag, Users, X, Banknote, Megaphone,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { ADMIN_OPAY, ngn } from "@/lib/pigeon-data";
import { formatNigerianPhone } from "@/lib/phone";
import { supabase } from "@/integrations/supabase/client";
import { AdminListingsTable } from "@/components/site/AdminListingsTable";
import { AdminUsersPanel } from "@/components/site/AdminUsersPanel";
import { AdminPendingOrders } from "@/components/site/AdminPendingOrders";
import { AdminTransactionNotifications } from "@/components/site/AdminTransactionNotifications";
import { AdminPayoutQueue } from "@/components/site/AdminPayoutQueue";
import { AdminFeedbackPanel } from "@/components/site/AdminFeedbackPanel";

type Section = "overview" | "users" | "orders" | "transactions" | "payouts" | "messages" | "notifications" | "settings" | "listings";

const NAV: { section: Section; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { section: "overview", label: "Overview", icon: LayoutDashboard, group: "MAIN" },
  { section: "users", label: "Users", icon: Users, group: "MAIN" },
  { section: "orders", label: "Orders", icon: ShoppingBag, group: "MAIN" },
  { section: "transactions", label: "Transactions", icon: ListChecks, group: "MAIN" },
  { section: "payouts", label: "Payouts", icon: Banknote, group: "MAIN" },
  { section: "messages", label: "Messages / Reports", icon: MessageSquareWarning, group: "MANAGEMENT" },
  { section: "listings", label: "Listings", icon: ShoppingBag, group: "MANAGEMENT" },
  { section: "notifications", label: "Notifications", icon: Bell, group: "MANAGEMENT" },
  { section: "settings", label: "Settings", icon: Settings, group: "SYSTEM" },
];

export function AdminControlCenter() {
  const { db, lockAdmin, setCommission, setWhatsappAlertNumber, sendBroadcast, retireBroadcast } = useStore();
  const [section, setSection] = useState<Section>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pct, setPct] = useState(String(db.commission_pct));
  const [whats, setWhats] = useState(db.whatsapp_alert_number);
  const [announcement, setAnnouncement] = useState("");

  const unread = useMemo(() => db.notifications.filter((n) => !n.read_at).length, [db.notifications]);
  const ready = useMemo(() => db.transactions.filter((t) => (t.status === "Ready for Admin Payout" || t.status === "Delivered") && !t.payout_paid_at).length, [db.transactions]);
  const pending = useMemo(() => db.transactions.filter((t) => t.status === "Pending Verification").length, [db.transactions]);
  const active = useMemo(() => db.transactions.filter((t) => !["Completed", "Seller Paid", "Refunded to Buyer", "Disputed"].includes(t.status)).length, [db.transactions]);

  const select = (next: Section) => {
    setSection(next);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-[calc(100vh-1px)] bg-muted/20">
      <div className="flex min-h-[calc(100vh-1px)]">
        <aside className={`hidden shrink-0 border-r border-border bg-background lg:flex lg:flex-col ${collapsed ? "w-[76px]" : "w-64"} transition-[width] duration-200`}>
          <SidebarContent section={section} collapsed={collapsed} unread={unread} ready={ready} onSelect={select} />
          <div className="mt-auto border-t border-border p-3">
            <Button variant="outline" className="w-full justify-center" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <ChevronRight className="size-4" /> : <><ChevronLeft className="size-4" /> Collapse</>}
            </Button>
          </div>
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button className="absolute inset-0 bg-black/40" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
            <aside className="relative h-full w-[min(86vw,320px)] border-r border-border bg-background shadow-xl">
              <SidebarContent section={section} collapsed={false} unread={unread} ready={ready} onSelect={select} onClose={() => setMobileOpen(false)} />
            </aside>
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open admin navigation">
              <Menu className="size-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">PigeonShield Admin</p>
              <h1 className="truncate text-lg font-semibold">{NAV.find((item) => item.section === section)?.label}</h1>
            </div>
            {unread > 0 ? (
              <Button variant="ghost" className="hidden gap-2 sm:flex" onClick={() => select("notifications")}>
                <Bell className="size-4" /> {unread} unread
              </Button>
            ) : null}
            <Button variant="outline" onClick={lockAdmin}>Lock Console</Button>
          </header>

          <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">
            {section === "overview" ? <Overview ready={ready} pending={pending} active={active} users={db.users.length} transactions={db.transactions} onNavigate={select} /> : null}
            {section === "users" ? <AdminUsersPanel /> : null}
            {section === "orders" ? <OrdersSection onNavigate={select} /> : null}
            {section === "transactions" ? <TransactionsSection onNavigate={select} /> : null}
            {section === "payouts" ? <AdminPayoutQueue /> : null}
            {section === "messages" ? <AdminFeedbackPanel /> : null}
            {section === "notifications" ? <AdminTransactionNotifications /> : null}
            {section === "listings" ? <AdminListingsTable /> : null}
            {section === "settings" ? (
              <SettingsSection
                pct={pct}
                setPct={setPct}
                whats={whats}
                setWhats={setWhats}
                announcement={announcement}
                setAnnouncement={setAnnouncement}
                onCommission={async () => { await setCommission(Number(pct)); toast.success(`Commission set to ${pct}%`); }}
                onWhatsApp={async () => { await setWhatsappAlertNumber(whats); toast.success("WhatsApp alert number updated."); }}
                onBroadcast={async () => {
                  const err = await sendBroadcast(announcement);
                  if (err) toast.error(err); else { toast.success("Announcement sent to all users."); setAnnouncement(""); }
                }}
                broadcast={db.broadcast}
                retireBroadcast={retireBroadcast}
              />
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ section, collapsed, unread, ready, onSelect, onClose }: { section: Section; collapsed: boolean; unread: number; ready: number; onSelect: (s: Section) => void; onClose?: () => void }) {
  const groups = ["MAIN", "MANAGEMENT", "SYSTEM"];
  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 items-center border-b border-border px-4 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed ? <div><p className="text-sm font-bold tracking-tight">PIGEONSHIELD</p><p className="text-[10px] font-medium uppercase tracking-[0.18em] text-primary">Admin Control Center</p></div> : <ShieldCheck className="size-6 text-primary" />}
        {onClose ? <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close navigation"><X className="size-5" /></Button> : null}
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        {groups.map((group) => (
          <div key={group}>
            {!collapsed ? <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">{group}</p> : null}
            <div className="space-y-1">
              {NAV.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon;
                const active = section === item.section;
                const count = item.section === "notifications" ? unread : item.section === "payouts" ? ready : 0;
                return (
                  <button
                    key={item.section}
                    type="button"
                    onClick={() => onSelect(item.section)}
                    className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${collapsed ? "justify-center" : ""} ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!collapsed ? <span className="min-w-0 flex-1 text-left">{item.label}</span> : null}
                    {!collapsed && count > 0 ? <Badge className="h-5 min-w-5 justify-center px-1 text-[10px]">{count}</Badge> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

function Overview({ ready, pending, active, users, transactions, onNavigate }: { ready: number; pending: number; active: number; users: number; transactions: DBTransaction[]; onNavigate: (s: Section) => void }) {
  const activity = transactions.slice(0, 6);
  const cards = [
    { label: "Ready for Payout", value: ready, section: "payouts" as Section },
    { label: "Payments Awaiting Review", value: pending, section: "orders" as Section },
    { label: "Active Orders", value: active, section: "orders" as Section },
    { label: "Total Users", value: users, section: "users" as Section },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Good to see you, Admin</h2>
        <p className="mt-1 text-sm text-muted-foreground">A focused view of the marketplace operations that need attention.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <button key={card.label} className="text-left" onClick={() => onNavigate(card.section)}>
            <Card className="h-full p-5 transition-shadow hover:shadow-md">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight">{card.value.toLocaleString()}</p>
              <p className="mt-3 text-xs font-medium text-primary">Open section →</p>
            </Card>
          </button>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-border p-5"><h3 className="font-semibold">Recent Activity</h3><p className="mt-1 text-sm text-muted-foreground">Latest transaction events and their current state.</p></div>
        <div className="divide-y divide-border">
          {activity.length ? activity.map((t) => (
            <button key={t.id} onClick={() => onNavigate("transactions")} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/40">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><ListChecks className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{activityLabel(t.status, t.listing_name)}</span><span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString("en-NG")}</span></span>
              <Badge variant="outline">{t.status}</Badge>
            </button>
          )) : <p className="p-5 text-sm text-muted-foreground">No recent activity.</p>}
        </div>
      </Card>
    </div>
  );
}

function activityLabel(status: string, name: string) {
  if (status === "Delivered" || status === "Ready for Admin Payout") return `Buyer confirmed receipt · ${name}`;
  if (status === "Pending Verification") return `Payment received · ${name}`;
  if (status === "Seller Paid") return `Payout completed · ${name}`;
  if (status === "Dispatched") return `Seller dispatched order · ${name}`;
  return `Transaction updated · ${name}`;
}

function OrdersSection({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const { db, forceMarkDelivered } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const size = 10;
  const rows = useMemo(() => db.transactions.filter((t) => {
    const text = `${t.id} ${t.listing_name}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (status === "All" || t.status === status);
  }), [db.transactions, query, status]);
  const total = Math.max(1, Math.ceil(rows.length / size));
  const visible = rows.slice((page - 1) * size, page * size);
  const statuses = Array.from(new Set(db.transactions.map((t) => t.status))).sort();
  return (
    <section className="space-y-5">
      <SectionIntro title="Orders" text="Review order state, payment verification and delivery interventions without crowding the workspace." />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input placeholder="Search by order ID or product…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} className="sm:max-w-md" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option>All</option>{statuses.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {visible.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{t.listing_name}</p><p className="break-all font-mono text-[11px] text-muted-foreground">{t.id}</p></div>
              <Badge variant="outline">{t.status}</Badge><span className="font-semibold">{ngn(t.amount_naira)}</span>
              <Button size="sm" variant="outline" onClick={() => onNavigate("transactions")}>Details</Button>
              {!["Delivered", "Completed", "Refunded to Buyer", "Disputed"].includes(t.status) ? (
                <Button size="sm" onClick={async () => { try { await forceMarkDelivered(t.id); toast.success("Order marked delivered."); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update order."); } }}>Delivery override</Button>
              ) : null}
            </div>
          ))}
          {!visible.length ? <p className="p-6 text-sm text-muted-foreground">No matching orders.</p> : null}
        </div>
        <Pager page={page} total={total} onPage={setPage} />
      </Card>
      <AdminPendingOrders />
    </section>
  );
}

function TransactionsSection({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const { db } = useStore();
  const [filter, setFilter] = useState("All");
  const statuses = ["All", "Pending Verification", "Funded", "Dispatched", "Delivered", "Ready for Admin Payout", "Seller Paid", "Completed", "Disputed", "Refunded to Buyer"];
  const rows = db.transactions.filter((t) => filter === "All" || t.status === filter);
  return (
    <section className="space-y-5">
      <SectionIntro title="Transactions" text="Monitor the escrow lifecycle and focus attention on transactions that need action." />
      <div className="flex flex-wrap gap-2">{statuses.map((s) => <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>{s === "Pending Verification" ? "Payment Pending" : s === "Delivered" ? "Buyer Confirmed" : s}</Button>)}</div>
      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {rows.slice(0, 50).map((t) => (
            <button key={t.id} onClick={() => onNavigate(t.status === "Ready for Admin Payout" ? "payouts" : "orders")} className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-muted/40">
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{t.listing_name}</span><span className="font-mono text-[11px] text-muted-foreground">{t.id}</span></span>
              <span className="font-semibold">{ngn(t.amount_naira)}</span><Badge variant="outline">{t.status}</Badge>
            </button>
          ))}
          {!rows.length ? <p className="p-6 text-sm text-muted-foreground">No transactions in this state.</p> : null}
        </div>
      </Card>
    </section>
  );
}

function SettingsSection(props: {
  pct: string; setPct: (v: string) => void; whats: string; setWhats: (v: string) => void; announcement: string; setAnnouncement: (v: string) => void;
  onCommission: () => Promise<void>; onWhatsApp: () => Promise<void>; onBroadcast: () => Promise<void>; broadcast: { id: string; body: string } | null; retireBroadcast: (id: string) => Promise<void>;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-2">
      <SectionIntro title="Settings" text="Platform controls are grouped here so operational changes are deliberate and easy to find." />
      <Card className="space-y-4 p-5">
        <h3 className="flex items-center gap-2 font-semibold"><Percent className="size-4 text-primary" /> Global commission</h3>
        <div className="flex gap-2"><Input type="number" min={0} max={100} value={props.pct} onChange={(e) => props.setPct(e.target.value)} className="max-w-32" /><Button onClick={() => void props.onCommission()}>Apply</Button></div>
        <p className="text-xs text-muted-foreground">Commission is applied to escrow settlements.</p>
      </Card>
      <Card className="space-y-4 p-5">
        <h3 className="flex items-center gap-2 font-semibold"><MessageSquareWarning className="size-4 text-primary" /> WhatsApp alert number</h3>
        <div className="flex flex-wrap gap-2"><Input value={props.whats} onChange={(e) => props.setWhats(e.target.value)} className="max-w-60" inputMode="tel" /><Button onClick={() => void props.onWhatsApp()}>Save</Button><Button variant="outline" asChild><a href={`https://wa.me/${formatNigerianPhone(props.whats)}`} target="_blank" rel="noreferrer">Test alert</a></Button></div>
      </Card>
      <Card className="space-y-4 p-5 xl:col-span-2">
        <h3 className="flex items-center gap-2 font-semibold"><Megaphone className="size-4 text-primary" /> Platform announcement</h3>
        <Textarea value={props.announcement} maxLength={500} rows={3} placeholder="Write a concise announcement…" onChange={(e) => props.setAnnouncement(e.target.value)} />
        <div className="flex flex-wrap gap-2"><Button onClick={() => void props.onBroadcast()}>Send announcement</Button>{props.broadcast ? <Button variant="outline" onClick={() => void props.retireBroadcast(props.broadcast!.id)}>Clear live announcement</Button> : null}</div>
        {props.broadcast ? <p className="rounded-lg border bg-muted/40 p-3 text-sm">Live now: {props.broadcast.body}</p> : null}
      </Card>
      <Card className="space-y-3 p-5 xl:col-span-2"><h3 className="font-semibold">Manual settlement account</h3><p className="text-sm text-muted-foreground">Admin OPay destination</p><p className="text-lg font-semibold">OPay {ADMIN_OPAY}</p></Card>
    </section>
  );
}

function SectionIntro({ title, text }: { title: string; text: string }) {
  return <div><h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{text}</p></div>;
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  return <div className="flex items-center justify-between border-t border-border p-4 text-sm"><span className="text-muted-foreground">Page {page} of {total}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="size-4" /></Button><Button size="sm" variant="outline" disabled={page >= total} onClick={() => onPage(page + 1)}><ChevronRight className="size-4" /></Button></div></div>;
}

type DBTransaction = {
  id: string; listing_name: string; status: string; amount_naira: number; created_at: number;
};
