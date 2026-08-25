import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, Search, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListingCard } from "@/components/site/ListingCard";
import { useStore } from "@/lib/store";
import { reportToAdmin } from "@/lib/report";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { isVisible, NIGERIAN_STATES, PAGE_SIZE, type Category } from "@/lib/pigeon-data";
import heroPigeon from "@/assets/pigeon-racer.jpg";
import { onImageError } from "@/lib/listing-images";
import { SITE_URL, canonicalUrl } from "@/lib/site";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PigeonShield Nigeria — Escrow-Protected Pigeon Marketplace" },
      {
        name: "description",
        content:
          "Buy and sell racing pigeons, chickens, guard dogs and horses anonymously in Nigeria with DOA-refund escrow and 2FA pickup verification.",
      },
      { property: "og:title", content: "PigeonShield Nigeria — Escrow-Protected Pigeon Marketplace" },
      {
        property: "og:description",
        content: "Nigeria's anonymous livestock marketplace with delivery-fraud-proof escrow.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/") }],
  }),
  component: Marketplace,
});

function Marketplace() {
  const { db } = useStore();
  const [tab, setTab] = useState<"pigeons" | "others">("pigeons");
  const [state, setState] = useState("All states");
  const [breed, setBreed] = useState("All breeds");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const pool = useMemo(
    () =>
      db.listings.filter(
        (l) =>
          isVisible(l) &&
          (tab === "pigeons" ? l.category_type === "Pigeon" : l.category_type !== "Pigeon"),
      ),
    [db.listings, tab],
  );

  const breeds = useMemo(
    () => Array.from(new Set(pool.map((l) => l.breed_type))).sort(),
    [pool],
  );

  const filtered = useMemo(
    () =>
      pool
        .filter(
          (l) =>
            (state === "All states" || l.state === state) &&
            (breed === "All breeds" || l.breed_type === breed) &&
            (q.trim() === "" ||
              `${l.custom_bird_name} ${l.breed_type}`.toLowerCase().includes(q.toLowerCase())),
        )
        // Featured first, then verified sellers, then newest.
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

  function switchTab(next: "pigeons" | "others") {
    setTab(next);
    setBreed("All breeds");
    setPage(1);
  }

  const categoriesInOthers: Category[] = ["Chicken", "Dog", "Horse"];

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={heroPigeon}
          alt="Racing homer pigeon in a Nigerian loft"
          width={1024}
          height={768}
          onError={onImageError()}
          className="absolute inset-0 size-full object-cover opacity-25"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-16 md:py-24">
          <Badge variant="secondary" className="mb-4 gap-1">
            <ShieldCheck className="size-3" /> Delivery-fraud-proof escrow
          </Badge>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight text-primary md:text-5xl">
            Nigeria&rsquo;s #1 Trusted Marketplace for Verified Pigeon Breeders &amp; Buyers
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
            Buy, sell, and trade high-quality pigeons with 100% DOA protection through PigeonShield Escrow.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-wrap gap-2">
          <Button variant={tab === "pigeons" ? "default" : "outline"} onClick={() => switchTab("pigeons")}>
            Pigeons (Flagship)
          </Button>
          <Button variant={tab === "others" ? "default" : "outline"} onClick={() => switchTab("others")}>
            Other Livestock &amp; Guard Animals
          </Button>
        </div>

        {tab === "others" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Secondary categories unlocked: {categoriesInOthers.join(", ")}.
          </p>
        ) : null}

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search bird name or breed"
              className="pl-9"
            />
          </div>
          <Select value={state} onValueChange={(v) => { setState(v); setPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="All states">All states</SelectItem>
              {NIGERIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={breed} onValueChange={(v) => { setBreed(v); setPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="All breeds">All breeds</SelectItem>
              {breeds.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filtered.length} active listing{filtered.length === 1 ? "" : "s"} · 7-Day Expiry Window enforced
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => reportToAdmin("Marketplace feed report")}
          >
            <Flag className="size-4" /> Report Scam or Issue to Admin
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((l) => <ListingCard key={l.id} listing={l} />)}
        </div>

        {filtered.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">No live listings match these filters.</p>
        ) : null}

        {pageCount > 1 ? (
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button variant="outline" disabled={current === 1} onClick={() => setPage(current - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {current} of {pageCount}</span>
            <Button variant="outline" disabled={current === pageCount} onClick={() => setPage(current + 1)}>
              Next
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
