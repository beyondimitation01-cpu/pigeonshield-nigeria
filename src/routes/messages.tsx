import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Send, WifiOff, Wifi } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { QUICK_INQUIRIES } from "@/lib/pigeon-data";

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>) => ({
    listing: typeof search["listing"] === "string" ? (search["listing"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Messages — Talk to Breeders Inside Escrow" },
      {
        name: "description",
        content:
          "Anonymous on-platform chat with breeders. Offline recipients get an SMS alert; sharing phone numbers voids escrow protection.",
      },
      { property: "og:title", content: "Messages — PigeonShield Nigeria" },
      { property: "og:description", content: "Anonymous, escrow-safe breeder chat with offline SMS alerts." },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const authed = useRequireAuth("Messages inbox");
  const { listing: listingParam } = Route.useSearch();
  const { db, user, sendMessage } = useStore();
  const [active, setActive] = useState<string | null>(listingParam ?? null);
  const [body, setBody] = useState("");

  const threads = useMemo(() => {
    if (!user) return [] as { listingId: string; title: string; otherId: string }[];
    const ids = new Set<string>();
    if (listingParam) ids.add(listingParam);
    db.messages
      .filter((m) => m.from_id === user.id || m.to_id === user.id)
      .forEach((m) => ids.add(m.listing_id));
    return [...ids].flatMap((id) => {
      const l = db.listings.find((x) => x.id === id);
      if (!l) return [];
      const otherId =
        l.breeder_id === user.id
          ? (db.messages.find((m) => m.listing_id === id && m.from_id !== user.id)?.from_id ?? user.id)
          : l.breeder_id;
      return [{ listingId: id, title: l.custom_bird_name, otherId }];
    });
  }, [db.messages, db.listings, user, listingParam]);

  if (!authReady) return <AuthPending />;
  if (!authed || !user) {
    return <AuthRequired title="Messages" description="Log in to open your inbox." />;
  }

  const current = threads.find((t) => t.listingId === active) ?? threads[0];
  const other = current ? db.users.find((u) => u.id === current.otherId) : undefined;
  const thread = current
    ? db.messages.filter((m) => m.listing_id === current.listingId).sort((a, b) => a.created_at - b.created_at)
    : [];

  function send(text: string) {
    if (!current || !text.trim()) return;
    sendMessage(current.listingId, current.otherId, text.trim());
    setBody("");
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Never share phone numbers or WhatsApp links — it voids all escrow protection.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[240px_1fr]">
        <Card className="p-3">
          <p className="px-2 pb-2 text-xs font-semibold uppercase text-muted-foreground">Threads</p>
          {threads.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.listingId}
                onClick={() => setActive(t.listingId)}
                className={`w-full truncate rounded-md px-2 py-2 text-left text-sm ${
                  current?.listingId === t.listingId ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"
                }`}
              >
                {t.title}
              </button>
            ))
          )}
        </Card>

        <Card className="flex min-h-[420px] flex-col p-4">
          {current ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <span className="font-semibold">{other?.public_handle ?? "Breeder"}</span>
                <Badge variant={other?.is_online ? "default" : "secondary"} className="gap-1">
                  {other?.is_online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
                  {other?.is_online ? "Online" : "Offline — SMS alert sent"}
                </Badge>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto py-4">
                {thread.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Start the conversation below.</p>
                ) : (
                  thread.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        m.from_id === user.id
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {m.body}
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-wrap gap-2 pb-3">
                {QUICK_INQUIRIES.map((q) => (
                  <Button key={q} size="sm" variant="outline" className="h-7 text-xs" onClick={() => send(q)}>
                    {q}
                  </Button>
                ))}
              </div>

              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(body);
                }}
              >
                <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message..." />
                <Button type="submit" size="icon" aria-label="Send message">
                  <Send className="size-4" />
                </Button>
              </form>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a listing to message its breeder.</p>
          )}
        </Card>
      </div>
    </main>
  );
}
