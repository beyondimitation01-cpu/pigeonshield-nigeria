import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, ShieldCheck, Snowflake, PauseCircle, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";

type AdminUser = {
  id: string;
  public_handle: string;
  real_name: string;
  email: string;
  phone_number: string;
  bank_name: string;
  account_number: string;
  is_banned: boolean;
  is_verified_seller: boolean;
  is_frozen: boolean;
  escrow_paused: boolean;
  created_at: string;
};

const PAGE_SIZE = 20;

export function AdminUsersPanel() {
  const { setUserFlags, banUser } = useStore();
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "banned">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "name">("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let request = supabase.from("profiles").select("id, public_handle, real_name, email, phone_number, bank_name, account_number, is_banned, is_verified_seller, is_frozen, escrow_paused, created_at", { count: "exact" });
    const clean = escapeSearch(query.trim());
    if (clean) {
      request = request.or(`public_handle.ilike.%${clean}%,real_name.ilike.%${clean}%,email.ilike.%${clean}%`);
    }
    if (filter === "banned") request = request.eq("is_banned", true);
    if (filter === "active") request = request.eq("is_banned", false);
    if (sort === "name") request = request.order("public_handle", { ascending: true });
    else request = request.order("created_at", { ascending: sort === "oldest" });
    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await request.range(from, from + PAGE_SIZE - 1);
    if (!error) {
      setRows((data ?? []) as AdminUser[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [filter, page, query, sort]);

  useEffect(() => { void load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function toggleBan(user: AdminUser) {
    await banUser(user.id);
    setSelected(null);
    await load();
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-2xl font-bold tracking-tight">Users</h2><p className="mt-1 text-sm text-muted-foreground">Search and moderate marketplace accounts without loading the full user directory.</p></div>
        <Badge variant="outline">{total.toLocaleString()} users</Badge>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search name, handle or email…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></div>
        <div className="flex flex-wrap gap-2">
          {(["all", "active", "banned"] as const).map((value) => <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => { setFilter(value); setPage(1); }}>{value[0].toUpperCase() + value.slice(1)}</Button>)}
          <select aria-label="Sort users" value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name A–Z</option></select>
        </div>
      </div>

      {selected ? (
        <Card className="border-primary/30 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs uppercase tracking-wider text-muted-foreground">User details</p><h3 className="mt-1 text-xl font-semibold">{selected.public_handle}</h3><p className="text-sm text-muted-foreground">{selected.real_name || "No real name"}</p></div>
            <Button variant="outline" onClick={() => setSelected(null)}>Back to users</Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Email" value={selected.email || "—"} /><Detail label="Phone" value={selected.phone_number || "—"} /><Detail label="Joined" value={new Date(selected.created_at).toLocaleString("en-NG")} />
            <Detail label="Bank / provider" value={selected.bank_name || "—"} /><Detail label="Account number" value={selected.account_number || "—"} /><Detail label="Status" value={selected.is_banned ? "Banned" : "Active"} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant={selected.is_verified_seller ? "default" : "outline"} onClick={async () => { await setUserFlags(selected.id, { is_verified_seller: !selected.is_verified_seller }); setSelected({ ...selected, is_verified_seller: !selected.is_verified_seller }); await load(); }}><ShieldCheck className="size-4" /> {selected.is_verified_seller ? "Verified" : "Verify seller"}</Button>
            <Button variant={selected.is_frozen ? "destructive" : "outline"} onClick={async () => { await setUserFlags(selected.id, { is_frozen: !selected.is_frozen }); setSelected({ ...selected, is_frozen: !selected.is_frozen }); await load(); }}><Snowflake className="size-4" /> {selected.is_frozen ? "Unfreeze" : "Freeze"}</Button>
            <Button variant={selected.escrow_paused ? "secondary" : "outline"} onClick={async () => { await setUserFlags(selected.id, { escrow_paused: !selected.escrow_paused }); setSelected({ ...selected, escrow_paused: !selected.escrow_paused }); await load(); }}><PauseCircle className="size-4" /> {selected.escrow_paused ? "Resume escrow" : "Pause escrow"}</Button>
            <Button variant={selected.is_banned ? "outline" : "destructive"} onClick={() => void toggleBan(selected)}>{selected.is_banned ? "Unban" : "Ban"}</Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {loading ? <p className="p-6 text-sm text-muted-foreground">Loading users…</p> : null}
            {!loading && !rows.length ? <p className="p-6 text-sm text-muted-foreground">No users match your search.</p> : null}
            {!loading && rows.map((user) => (
              <button key={user.id} type="button" onClick={() => setSelected(user)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/40">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><UserRound className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{user.public_handle || "Unnamed user"}</span><span className="block truncate text-xs text-muted-foreground">{user.email || user.real_name || "No contact details"}</span></span>
                <span className="hidden gap-1 sm:flex">{user.is_banned ? <Badge variant="destructive">Banned</Badge> : <Badge variant="outline">Active</Badge>}{user.is_verified_seller ? <Badge>Verified</Badge> : null}</span>
                <span className="text-xs text-muted-foreground">Open</span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border p-4 text-sm"><span className="text-muted-foreground">Page {page} of {pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button></div></div>
        </Card>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border/70 bg-muted/20 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>;
}

function escapeSearch(value: string) {
  return value.replace(/[\\%_(),]/g, (char) => `\\${char}`);
}
