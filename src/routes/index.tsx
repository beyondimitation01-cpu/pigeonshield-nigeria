import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Search, Flag, Lock, KeyRound, BadgeCheck, PlusCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListingCard } from "@/components/site/ListingCard";
import { Combobox } from "@/components/site/Combobox";
import { useStore } from "@/lib/store";
import { reportToAdmin } from "@/lib/report";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { CATEGORY_OPTIONS, isVisible, NIGERIAN_STATES, PAGE_SIZE, type Category } from "@/lib/pigeon-data";
import { ANIMAL_CATEGORY_OPTIONS, animalCategoryLabel } from "@/lib/animal-categories";
import heroPigeon from "@/assets/pigeon-racer.jpg";
import { onImageError } from "@/lib/listing-images";
import { SITE_URL, canonicalUrl } from "@/lib/site";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PigeonShield Nigeria — Escrow-Protected Animal Marketplace" },
      { name: "description", content: "Buy and sell racing pigeons, chickens, guard dogs and horses anonymously in Nigeria with DOA-refund escrow and secure 4-digit pickup PIN handover." },
      { property: "og:title", content: "PigeonShield Nigeria — Escrow-Protected Animal Marketplace" },
      { property: "og:description", content: "Nigeria's anonymous animal marketplace with delivery-fraud-proof escrow." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/") }],
  }),
  component: Marketplace,
});

type MarketplaceCategory = "all" | string;

function Marketplace() {
  const { db } = useStore();
  const { requireAuth } = useAuthGuard();
  const [category, setCategory] = useState<MarketplaceCategory>("all");
  const [state, setState] = useState("All states");
  const [breed, setBreed] = useState("All breeds");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const marketplaceCategories = [
    { value: "all", label: "All animals" },
    ...ANIMAL_CATEGORY_OPTIONS,
  ];

  const pool = useMemo(
    () => db.listings.filter((l) => isVisible(l) && (category === "all" || l.category_type === category)),
    [db.listings, category],
  );
  const breeds = useMemo(() => Array.from(new Set(pool.map((l) => l.breed_type))).sort(), [pool]);
  const filtered = useMemo(
    () =>
      pool
        .filter(
          (l) =>
            (state === "All states" || l.state === state) &&
            (breed === "All breeds" || l.breed_type === breed) &&
            (q.trim() === "" || `${l.custom_bird_name} ${l.breed_type}`.toLowerCase().includes(q.toLowerCase())),
        )
        .sort(
          (a, b) =>
            Number(b.is_featured ?? false) - Number(a.is_featured ?? false) ||
            Number(b.is_verified_seller ?? false) - Number(a.is_verified_seller ?? false) ||
            b.creation_timestamp - a.creation_timestamp,
        ),
    [pool, state, breed, q],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  function switchCategory(next: MarketplaceCategory) {
    setCategory(next);
    setBreed("All breeds");
    setPage(1);
  }

  return (
    <div className="pigeonshield-homepage">
      <section className="relative overflow-hidden border-b border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-background">
        <img src={heroPigeon} alt="Racing homer pigeon in a Nigerian loft" width={1024} height={768} onError={onImageError()} className="absolute inset-0 size-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 py-14 md:py-24">
          <Badge variant="secondary" className="mb-4 gap-1 border border-gold/50 bg-gold/15 text-gold-foreground"><ShieldCheck className="size-3" /> Delivery-fraud-proof escrow</Badge>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight text-primary md:text-5xl">Nigeria&rsquo;s trusted marketplace for verified animal sellers &amp; buyers</h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">Buy, sell, and trade pigeons, chickens, dogs, horses and other supported animals with 100% DOA protection through PigeonShield Escrow.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg" className="shadow-md"><a href="#listings">Browse animals <ArrowRight className="size-4" /></a></Button>
            <Button asChild size="lg" variant="outline" className="border-primary/30 bg-background/70"><Link to="/breeder-dashboard"><PlusCircle className="size-4" /> Sell an animal</Link></Button>
          </div>
        </div>
      </section>
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:grid-cols-3">
          {[
            { icon: Lock, title: "Money held safely", text: "Your payment stays in escrow until the animal reaches you alive." },
            { icon: KeyRound, title: "PIN-protected pickup", text: "A 4-digit code confirms the right person collected the animal." },
            { icon: BadgeCheck, title: "Dead-on-arrival refunds", text: "Report a DOA and the admin reviews it before any payout." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="size-5" /></span>
              <div><p className="font-semibold">{title}</p><p className="text-sm text-muted-foreground">{text}</p></div>
            </div>
          ))}
        </div>
      </section>
      <section id="listings" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-8">
        <div className="max-w-sm">
          <label className="mb-2 block text-sm font-medium text-primary" htmlFor="marketplace-category">Browse by animal</label>
          <Select value={category} onValueChange={switchCategory}>
            <SelectTrigger id="marketplace-category" aria-label="Browse by animal category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {marketplaceCategories.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {category === "all"
            ? "All currently live listings are shown by default. Choose an animal category to narrow the marketplace."
            : `Showing ${animalCategoryLabel(category)} only.`}
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" /><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search animal name or breed" className="pl-9 border-primary/25 focus-visible:border-primary" /></div>
          <Select value={state} onValueChange={(v) => { setState(v); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-64"><SelectItem value="All states">All states</SelectItem>{NIGERIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          <Combobox value={breed} options={["All breeds", ...breeds]} onChange={(v) => { setBreed(v); setPage(1); }} allowCustom placeholder="All breeds" searchPlaceholder="Search or type a breed..." />
        </div>
        <div className="mt-3"><Button asChild variant="outline" className="min-w-56 px-5 font-medium"><Link to="/search" search={{ q: q.trim(), type: "all", page: 1 }}>Search all products &amp; stores</Link></Button></div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground"><span className="font-semibold text-primary">{filtered.length} active listing{filtered.length === 1 ? "" : "s"}</span> · 7-Day Expiry Window enforced</p>
          <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/10" onClick={() => { if (!requireAuth("Reporting a scam or issue requires an account.")) return; reportToAdmin("Marketplace feed report"); }}><Flag className="size-4" /> Report Scam or Issue to Admin</Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">{rows.map((l) => <ListingCard key={l.id} listing={l} />)}</div>
        {filtered.length === 0 ? (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-dashed border-primary/30 bg-card px-6 py-12 text-center">
            <Search className="mx-auto size-8 text-primary/60" />
            <p className="mt-3 font-semibold">{pool.length === 0 ? "No animals listed right now" : "No animals match these filters"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{pool.length === 0 ? "Be the first to list an animal — buyers are looking." : "Try another state, breed, or clear your search."}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {pool.length === 0 ? null : <Button variant="outline" onClick={() => { setQ(""); setState("All states"); setBreed("All breeds"); setPage(1); }}>Clear filters</Button>}
              <Button asChild><Link to="/breeder-dashboard"><PlusCircle className="size-4" /> List an animal</Link></Button>
            </div>
          </div>
        ) : null}
        {pageCount > 1 ? <div className="mt-8 flex items-center justify-center gap-3"><Button variant="outline" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</Button><span className="text-sm text-muted-foreground">Page {current} of {pageCount}</span><Button variant="outline" disabled={current === pageCount} onClick={() => setPage(current + 1)}>Next</Button></div> : null}
      </section>
    </div>
  );
}
