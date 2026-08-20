import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Flag, MapPin, MessageCircle, Send, ShieldCheck, Syringe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MediaPlaceholder } from "@/components/site/ListingCard";
import { useStore, reportToAdmin } from "@/lib/store";
import { daysRemaining, ngn, QUICK_INQUIRIES } from "@/lib/pigeon-data";

export const Route = createFileRoute("/listing/$id")({
  head: () => ({
    meta: [
      { title: "Listing Details — PigeonShield Nigeria" },
      { name: "description", content: "Inspect pedigree, breeder handle and escrow terms before funding a purchase." },
      { property: "og:title", content: "Listing Details — PigeonShield Nigeria" },
      { property: "og:description", content: "Escrow-protected livestock listing on PigeonShield Nigeria." },
    ],
  }),
  component: ListingDetail,
});

function ListingDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { db, user, isAuthed, openAuth, buyListing, commissionFor } = useStore();
  const [active, setActive] = useState(0);
  const listing = db.listings.find((l) => l.id === id);

  if (!listing) {
    return <div className="mx-auto max-w-3xl px-4 py-24 text-center text-muted-foreground">Listing not found or expired.</div>;
  }

  const seller = db.users.find((u) => u.id === listing.breeder_id);
  const pct = commissionFor(listing);
  const cover = listing.images[active];

  async function purchase() {
    if (!isAuthed) {
      openAuth("login", "Protected action: log in to fund escrow for this listing.");
      return;
    }
    const tx = await buyListing(listing!);
    if (tx) {
      toast.success(`Escrow funded. Your pickup passcode is ${tx.pickup_passcode}`);
      navigate({ to: "/my-orders" });
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-border">
            {cover ? (
              <img src={cover} alt={listing.custom_bird_name} width={1024} height={768} className="size-full object-cover" />
            ) : (
              <MediaPlaceholder label={listing.category_type} className="size-full" />
            )}
          </div>
          {listing.images.length > 1 ? (
            <div className="mt-3 flex gap-2">
              {listing.images.map((img, i) => (
                <button key={img + i} onClick={() => setActive(i)} className={`size-16 overflow-hidden rounded-md border ${i === active ? "border-primary" : "border-border"}`}>
                  <img src={img} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{listing.category_type}</Badge>
            <Badge>Days Remaining: {daysRemaining(listing.expiry_date)}</Badge>
            <Badge variant="outline">Qty available: {listing.batch_quantity}</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{listing.custom_bird_name}</h1>
          <p className="text-muted-foreground">{listing.breed_type} · {listing.gender}</p>
          <p className="text-3xl font-bold text-foreground">{ngn(listing.price_ngn)}</p>
          <p className="text-sm text-muted-foreground">{listing.description}</p>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin className="size-4" /> {listing.state}</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="size-4" /> {listing.breeder_handle}</span>
            {listing.category_type === "Dog" ? (
              <span className="inline-flex items-center gap-1"><Syringe className="size-4" /> {listing.vaccinated ? "Vaccinated" : "Not vaccinated"}</span>
            ) : null}
          </div>

          <Card className="space-y-1 bg-muted/50 p-4 text-sm">
            <p className="font-semibold text-foreground">Escrow breakdown</p>
            <p className="text-muted-foreground">Platform commission: {pct}% ({ngn((listing.price_ngn * pct) / 100)})</p>
            <p className="text-muted-foreground">Breeder receives on confirmation: {ngn(listing.price_ngn - (listing.price_ngn * pct) / 100)}</p>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={purchase} disabled={user?.id === listing.breeder_id}>
              Fund Escrow &amp; Buy
            </Button>
            <ChatDrawer listingId={listing.id} sellerId={listing.breeder_id} sellerHandle={listing.breeder_handle} />
            <Button size="lg" variant="ghost" onClick={() => navigate({ to: "/messages", search: { listing: listing.id } })}>
              Open full inbox
            </Button>
            <Button size="lg" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => reportToAdmin(`Listing ID ${listing.id}`)}>
              <Flag className="size-4" /> Report Scam or Issue to Admin
            </Button>
          </div>
          {seller && !seller.is_online ? (
            <Badge variant="outline" className="border-amber-500/40 text-amber-700">
              Breeder is currently away from the farm
            </Badge>
          ) : null}
        </div>
      </div>

      {listing.pedigree_json ? (
        <Card className="mt-10 p-6">
          <h2 className="font-semibold text-primary">3-Generation Digital Pedigree</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <PedigreeCol title="Generation 1" nodes={[listing.pedigree_json.generation_1]} />
            <PedigreeCol title="Generation 2" nodes={[listing.pedigree_json.generation_2.sire, listing.pedigree_json.generation_2.dam]} />
            <PedigreeCol title="Generation 3" nodes={[listing.pedigree_json.generation_3.paternal, listing.pedigree_json.generation_3.maternal]} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function PedigreeCol({ title, nodes }: { title: string; nodes: { name: string; breed: string }[] }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-2 space-y-2">
        {nodes.map((n) => (
          <li key={n.name} className="text-sm">
            <span className="font-medium text-foreground">{n.name}</span>
            <span className="block text-muted-foreground">{n.breed}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatDrawer({
  listingId,
  sellerId,
  sellerHandle,
}: {
  listingId: string;
  sellerId: string;
  sellerHandle: string;
}) {
  const { db, user, isAuthed, openAuth, sendMessage } = useStore();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const thread = db.messages.filter(
    (m) =>
      m.listing_id === listingId &&
      ((m.from_id === user?.id && m.to_id === sellerId) ||
        (m.from_id === sellerId && m.to_id === user?.id)),
  );

  async function send(text: string) {
    const value = text.trim();
    if (!value) return;
    if (!isAuthed) {
      openAuth("login", "Log in to chat with this breeder inside the app.");
      return;
    }
    setSending(true);
    await sendMessage(listingId, sellerId, value);
    setSending(false);
    setBody("");
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="lg" variant="outline">
          <MessageCircle className="size-4" /> Chat with Breeder
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <div className="sticky top-0 z-10 border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-xs font-semibold leading-snug text-destructive">
          ⚠️ Never pay to an unknown seller, always pay via the app for DOA protection.
        </div>
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{sellerHandle}</p>
          <p className="text-xs text-muted-foreground">Anonymous escrow-protected chat</p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {thread.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No messages yet. Ask about pedigree, age or logistics before funding escrow.
            </p>
          ) : (
            thread.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.from_id === user?.id
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {m.body}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK_INQUIRIES.slice(0, 3).map((q) => (
              <Button key={q} size="sm" variant="secondary" onClick={() => void send(q)}>
                {q}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type a message"
              onKeyDown={(e) => {
                if (e.key === "Enter") void send(body);
              }}
            />
            <Button disabled={sending} onClick={() => void send(body)} aria-label="Send message">
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
