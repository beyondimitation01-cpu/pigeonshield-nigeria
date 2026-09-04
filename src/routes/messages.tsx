import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Send, WifiOff, Wifi } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { AuthPending, AuthRequired } from "@/components/site/AuthGate";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { QUICK_INQUIRIES } from "@/lib/pigeon-data";
import { UserAvatar } from "@/components/site/UserAvatar";
import { toast } from "sonner";

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>) => ({
    listing: typeof search["listing"] === "string" ? (search["listing"] as string) : undefined,
    conversation: typeof search["conversation"] === "string" ? (search["conversation"] as string) : undefined,
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
  component: GuardedMessagesPage,
});

function MessagesPage() {
  const authed = useRequireAuth("Messages inbox");
  const { listing: listingParam, conversation: conversationParam } = Route.useSearch();
  const navigate = useNavigate();
  const { db, user, sendMessage, markConversationRead, authReady } = useStore();
  const [active, setActive] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const lastMarked = useRef<string | null>(null);

  const conversations = useMemo(() => {
    if (!user) return [] as { id: string; otherId: string }[];
    const existing = db.conversations
      .filter((c) => c.participant_a === user.id || c.participant_b === user.id)
      .map((c) => ({ id: c.id, otherId: c.participant_a === user.id ? c.participant_b : c.participant_a }))
      // Legacy/corrupt self-conversations must never be exposed as a chat target.
      .filter((c) => c.otherId !== user.id);
    if (!listingParam) return existing;
    const listing = db.listings.find((item) => item.id === listingParam);
    if (!listing?.breeder_id || listing.breeder_id === user.id) return existing;
    if (existing.some((c) => c.otherId === listing.breeder_id)) return existing;
    return [{ id: `new:${listing.breeder_id}`, otherId: listing.breeder_id }, ...existing];
  }, [db.conversations, db.listings, user, listingParam]);

  const selectedId = active ?? conversationParam ?? null;
  const current = selectedId ? conversations.find((c) => c.id === selectedId && c.otherId !== user.id) : undefined;
  const other = current ? db.users.find((u) => u.id === current.otherId) ?? db.sellers[current.otherId] : undefined;
  const thread = current
    ? db.messages.filter((m) => m.conversation_id === current.id).sort((a, b) => a.created_at - b.created_at)
    : [];

  useEffect(() => {
    if (!current || !user || !authReady) return;
    const key = `${current.id}:${current.otherId}`;
    if (lastMarked.current === key) return;
    lastMarked.current = key;
    if (!current.id.startsWith("new:")) void markConversationRead(current.id).catch(() => undefined);
  }, [current?.id, current?.otherId, user, authReady, markConversationRead]);

  if (!authReady) return <AuthPending />;
  if (!authed || !user) {
    return <AuthRequired title="Messages" description="Log in to open your inbox." />;
  }

  function send(text: string) {
    if (!current || !text.trim()) return;
    // A new conversation opened from a listing must never be created for an
    // inactive listing. The database also enforces this on message insertion.
    const messageListingId = current.id.startsWith("new:") ? listingParam ?? null : null;
    if (messageListingId) {
      const listing = db.listings.find((item) => item.id === messageListingId);
      if (!listing?.is_active) {
        toast.error("This listing is no longer available");
        return;
      }
    }
    void sendMessage(messageListingId, current.otherId, text.trim())
      .then((conversationId) => {
        setActive(conversationId);
        void navigate({ to: "/messages", search: { listing: undefined, conversation: conversationId } });
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Message could not be sent.");
      });
    setBody("");
  }

  return (
    <main className="mx-auto max-w-6xl px-0 sm:px-4 sm:py-10">
      <div className="px-4 sm:px-0">
        <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tip: For long-distance purchases, use our Protected Checkout &amp; Driver Link to ensure your
        money is safe until delivery.
      </p>

      </div>

      <div className="mt-6 grid min-h-[560px] overflow-hidden border-y border-border bg-background md:grid-cols-[320px_1fr] md:rounded-2xl md:border">
        <Card className={`rounded-none border-0 p-0 shadow-none md:block ${current ? "hidden md:block" : "block"}`}>
          <div className="border-b border-border px-4 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversations</p></div>
          {conversations.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            conversations.map((conversation) => {
              const conversationMessages = db.messages.filter((m) => m.conversation_id === conversation.id);
              const latest = conversationMessages[conversationMessages.length - 1];
              const unread = conversationMessages.filter((m) => m.to_id === user.id && !m.read_at).length;
              const person = db.users.find((u) => u.id === conversation.otherId) ?? db.sellers[conversation.otherId];
              const personName = person && "real_name" in person ? person.real_name : person?.full_name;
              return (
              <button
                key={conversation.id}
                onClick={() => {
                  setActive(conversation.id);
                  void navigate({ to: "/messages", search: { listing: undefined, conversation: conversation.id } });
                }}
                className={`w-full border-b border-border px-4 py-3 text-left text-sm transition-colors ${
                  current?.id === conversation.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted/70"
                }`}
              >
                <span className="flex items-center gap-2">
                  <UserAvatar url={person?.avatar_url ?? null} name={personName || person?.public_handle || "Member"} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{personName || person?.public_handle || "Member"}</span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">{latest?.body ?? "New conversation"}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {latest ? <span className="text-[10px] font-normal text-muted-foreground">{new Date(latest.created_at).toLocaleDateString()}</span> : null}
                    {unread > 0 ? <Badge>{unread}</Badge> : null}
                  </span>
                </span>
              </button>
              );
            })
          )}
        </Card>

        <Card className={`min-h-[560px] flex-col rounded-none border-0 p-0 shadow-none md:flex ${current ? "flex" : "hidden md:flex"}`}>
          {current ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="md:hidden"
                  onClick={() => {
                    setActive(null);
                    void navigate({ to: "/messages", search: { listing: undefined, conversation: undefined } });
                  }}
                  aria-label="Back to conversations"
                >
                  ← Back
                </Button>
                <span className="inline-flex min-w-0 items-center gap-2 font-semibold">
                  <UserAvatar
                    url={(current ? db.sellers[current.otherId]?.avatar_url : null) ?? other?.avatar_url ?? null}
                    name={other && "real_name" in other ? other.real_name : other?.full_name || other?.public_handle || "Breeder"}
                    size={28}
                  />
                  {(current ? db.sellers[current.otherId]?.full_name : "") ||
                    (other && "real_name" in other ? other.real_name : other?.full_name) ||
                    other?.public_handle ||
                    "Breeder"}
                </span>
                <Badge variant={other?.is_online ? "default" : "secondary"} className="gap-1">
                  {other?.is_online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
                  {other?.is_online ? "Online" : "Offline — SMS alert sent"}
                </Badge>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
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

              <div className="border-t border-border px-4 py-3">
                {thread.length === 0 ? (
                  <div className="flex flex-wrap gap-2 pb-3">
                    {QUICK_INQUIRIES.map((q) => (
                      <Button key={q} size="sm" variant="outline" className="h-7 text-xs" onClick={() => send(q)}>
                        {q}
                      </Button>
                    ))}
                  </div>
                ) : null}

                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(body);
                  }}
                >
                  <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message..." autoComplete="off" />
                  <Button type="submit" size="icon" aria-label="Send message">
                    <Send className="size-4" />
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="m-auto hidden max-w-sm px-6 text-center md:block">
              <p className="text-lg font-semibold">Your messages</p>
              <p className="mt-1 text-sm text-muted-foreground">Select a conversation to start chatting.</p>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

function GuardedMessagesPage() {
  return (
    <ProtectedRoute title="Messages" description="Log in to open your inbox.">
      <MessagesPage />
    </ProtectedRoute>
  );
}
