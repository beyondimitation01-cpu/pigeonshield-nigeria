import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type AdminNotification = {
  id: string;
  transaction_id: string | null;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export function AdminTransactionNotifications() {
  const [items, setItems] = useState<AdminNotification[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("admin_notifications")
      .select("id, transaction_id, kind, title, body, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error) setItems((data ?? []) as AdminNotification[]);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-transaction-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_notifications" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const unread = items.filter((item) => !item.read_at).length;

  async function openNotification(item: AdminNotification) {
    if (!item.read_at) {
      await supabase.from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("id", item.id);
    }
    if (item.transaction_id) {
      document.getElementById("ready-for-payout")?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#transaction-${item.transaction_id}`);
    }
    if (item.kind === "payout_required") {
      toast.success("Payout queue opened.");
    }
    await load();
  }

  return (
    <Card className="overflow-hidden border-primary/20">
      <div className="flex items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Bell className="size-4 text-primary" /> Transaction notifications
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Payment, delivery and payout events visible only to authorized administrators.
          </p>
        </div>
        {unread > 0 ? <Badge variant="destructive">{unread} unread</Badge> : <Badge variant="outline">All caught up</Badge>}
      </div>
      <div className="divide-y divide-border">
        {items.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No transaction notifications yet.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className={`flex gap-3 p-4 ${item.read_at ? "" : "bg-primary/5"}`}>
              <div className="mt-0.5 shrink-0 rounded-full bg-primary/10 p-2">
                <Bell className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{item.title}</p>
                  {!item.read_at ? <Badge variant="secondary">New</Badge> : null}
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{item.body}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {new Date(item.created_at).toLocaleString("en-NG")}
                </p>
              </div>
              {item.transaction_id ? (
                <Button size="sm" variant={item.kind === "payout_required" ? "default" : "outline"} onClick={() => void openNotification(item)}>
                  <CheckCircle2 className="size-4" /> Open
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
