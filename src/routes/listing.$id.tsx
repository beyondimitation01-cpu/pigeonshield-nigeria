import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Flag, MapPin, MessageCircle, Phone, Syringe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckoutModal } from "@/components/site/CheckoutModal";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { reportToAdmin } from "@/lib/report";
import { daysRemaining, ngn } from "@/lib/pigeon-data";
import { listingGallery, onImageError } from "@/lib/listing-images";
import { UserAvatar } from "@/components/site/UserAvatar";
import { displayNigerianPhone, whatsappLink, formatNigerianPhone } from "@/lib/phone";
import { canonicalUrl } from "@/lib/site";

type PricingUnit = "listing" | "each" | "pair";

export const Route = createFileRoute("/listing/$id")({
  head: ({ params }) => ({
    meta: [
      { title: "Listing Details — PigeonShield Nigeria" },
      { name: "description", content: "Inspect pedigree, breeder handle and escrow terms before funding a purchase." },
      { property: "og:title", content: "Listing Details — PigeonShield Nigeria" },
      { property: "og:description", content: "Escrow-protected livestock listing on PigeonShield Nigeria." },
      { property: "og:url", content: canonicalUrl(`/listing/${encodeURIComponent(params.id)}`) },
    ],
    links: [{ rel: "canonical", href: canonicalUrl(`/listing/${encodeURIComponent(params.id)}`) }],
  }),
  component: ListingDetail,
});

function ListingDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { db, user, commissionFor } = useStore();
  const { requireAuth } = useAuthGuard();
  const [active, setActive] = useState(0);
  const [checkout, setCheckout] = useState(false);
  const [revealedPhone, setRevealedPhone] = useState("");
  const [pricingUnit, setPricingUnit] = useState<PricingUnit>("listing");
  const listing = db.listings.find((l) => l.id === id || l.slug === id);
  const breederId = listing?.breeder_id ?? "";

  useEffect(() => {
    let cancelled = false;
    if (!user || !breederId || user.id === breederId) {
      setRevealedPhone("");
    } else {
      void supabase.rpc("get_seller_phone", { _seller_id: breederId }).then(({ data }) => {
        if (!cancelled) setRevealedPhone(String(data ?? ""));
      });
    }

    if (listing) {
      void supabase.from("listings").select("pricing_unit").eq("id", listing.id).maybeSingle().then(({ data }) => {
        if (cancelled) return;
        const unit = String((data as Record<string, unknown> | null)?.["pricing_unit"] ?? "listing");
        setPricingUnit(unit === "each" || unit === "pair" ? unit : "listing");
      });
    } else {
      setPricingUnit("listing");
    }
    return () => { cancelled = true; };
  }, [user, breederId, listing?.id]);

  if (!listing) return <div className="mx-auto max-w-3xl px-4 py-24 text-center text-muted-foreground">Listing not found or expired.</div>;

  const seller = db.users.find((u) => u.id === listing.breeder_id);
  const sellerCard = db.sellers[listing.breeder_id];
  const sellerDisplayName = sellerCard?.full_name || sellerCard?.public_handle || listing.breeder_handle;
  const isOwner = user?.id === listing.breeder_id;
  const sellerPhone = isOwner ? "" : (seller?.phone_number || revealedPhone || "");
  const sellerWa = whatsappLink(sellerPhone, `Hello ${sellerDisplayName}, I saw your listing "${listing.custom_bird_name}" on PigeonShield Nigeria.`);
  const pct = commissionFor(listing);
  const gallery = listingGallery(listing);
  const cover = gallery[active] ?? gallery[0]!;
  const isUnitPriced = pricingUnit !== "listing";
  const unitLabel = pricingUnit === "pair" ? "per pair" : pricingUnit === "each" ? "each" : "per listing";

  function purchase() {
    if (isOwner) { toast.error("You cannot message or buy your own product"); return; }
    if (!requireAuth("Buying a bird requires a PigeonShield account.")) return;
    setCheckout(true);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-border"><img src={cover} alt={listing.custom_bird_name} width={1024} height={768} loading="lazy" decoding="async" onError={onImageError()} className="size-full object-cover" /></div>
          {gallery.length > 1 ? <div className="mt-3 flex gap-2">{gallery.map((img, i) => <button key={img + i} onClick={() => setActive(i)} className={`size-16 overflow-hidden rounded-md border ${i === active ? "border-primary" : "border-border"}`}><img src={img} alt="" loading="lazy" decoding="async" onError={onImageError()} className="size-full object-cover" /></button>)}</div> : null}
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2"><Badge variant="secondary">{listing.category_type}</Badge><Badge>Days Remaining: {daysRemaining(listing.expiry_date)}</Badge><Badge variant="outline">{isUnitPriced ? `${listing.batch_quantity} ${pricingUnit === "pair" ? "pairs" : "units"} available` : `Qty available: ${listing.batch_quantity}`}</Badge></div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{listing.custom_bird_name}</h1>
          <p className="text-muted-foreground">{listing.breed_type} · {listing.gender}</p>
          <p className="text-3xl font-bold text-foreground">{ngn(listing.price_ngn)} {isUnitPriced ? <span className="text-base font-medium text-muted-foreground">{unitLabel}</span> : null}</p>
          <p className="text-sm text-muted-foreground">{listing.description}</p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin className="size-4" /> {listing.state}</span>
            <span className="inline-flex items-center gap-1"><UserAvatar url={sellerCard?.avatar_url ?? null} name={sellerDisplayName} size={20} />{sellerDisplayName}{sellerCard?.loft_name ? <span className="text-xs">· {sellerCard.loft_name}</span> : null}</span>
            {listing.category_type === "Dog" ? <span className="inline-flex items-center gap-1"><Syringe className="size-4" /> {listing.vaccinated ? "Vaccinated" : "Not vaccinated"}</span> : null}
          </div>
          <Card className="space-y-1 bg-muted/50 p-4 text-sm"><p className="font-semibold text-foreground">Escrow breakdown</p><p className="text-muted-foreground">{isUnitPriced ? `Commission is calculated from the final quantity purchased. Current unit price: ${""}` : ""}</p><p className="text-muted-foreground">Platform commission: {pct}% ({isUnitPriced ? "calculated at checkout" : ngn((listing.price_ngn * pct) / 100)})</p><p className="text-muted-foreground">{isUnitPriced ? "The final breeder payout is based on the purchased quantity after commission." : `Breeder receives on confirmation: ${""}`}{!isUnitPriced ? ngn(listing.price_ngn - (listing.price_ngn * pct) / 100) : null}</p></Card>
          <div className="flex flex-wrap gap-3">
            {!isOwner ? <Button size="lg" onClick={purchase}>Buy with Escrow Protection</Button> : null}
            {formatNigerianPhone(sellerPhone) ? <><Button size="lg" variant="secondary" asChild><a href={`tel:+${formatNigerianPhone(sellerPhone)}`}><Phone className="size-4" /> Call Seller ({displayNigerianPhone(sellerPhone)})</a></Button>{sellerWa ? <Button size="lg" variant="secondary" asChild><a href={sellerWa} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> WhatsApp Chat</a></Button> : null}</> : null}
            {!isOwner ? <Button size="lg" variant="outline" onClick={() => navigate({ to: "/messages", search: { listing: listing.id, conversation: undefined } })}><MessageCircle className="size-4" /> Message Seller</Button> : null}
            <Button size="lg" variant="ghost" onClick={() => navigate({ to: "/messages", search: { listing: listing.id, conversation: undefined } })}>Open full inbox</Button>
            <Button size="lg" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => { if (!requireAuth("Reporting an issue requires an account.")) return; reportToAdmin(`Listing ID ${listing.id}`); }}><Flag className="size-4" /> Report Scam or Issue to Admin</Button>
          </div>
          {seller && !seller.is_online ? <Badge variant="outline" className="border-amber-500/40 text-amber-700">Breeder is currently away from the farm</Badge> : null}
        </div>
      </div>
      <CheckoutModal listing={listing} open={checkout} onOpenChange={setCheckout} />
      {listing.pedigree_json ? <Card className="mt-10 p-6"><h2 className="font-semibold text-primary">3-Generation Digital Pedigree</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><PedigreeCol title="Generation 1" nodes={[listing.pedigree_json.generation_1]} /><PedigreeCol title="Generation 2" nodes={[listing.pedigree_json.generation_2.sire, listing.pedigree_json.generation_2.dam]} /><PedigreeCol title="Generation 3" nodes={[listing.pedigree_json.generation_3.paternal, listing.pedigree_json.generation_3.maternal]} /></div></Card> : null}
    </div>
  );
}

function PedigreeCol({ title, nodes }: { title: string; nodes: { name: string; breed: string }[] }) {
  return <div className="rounded-lg border border-border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p><ul className="mt-2 space-y-2">{nodes.map((n) => <li key={n.name} className="text-sm"><span className="font-medium text-foreground">{n.name}</span><span className="block text-muted-foreground">{n.breed}</span></li>)}</ul></div>;
}