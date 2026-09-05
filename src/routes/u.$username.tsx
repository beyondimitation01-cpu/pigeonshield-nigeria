import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { Copy, Link2, Share2, ShieldCheck, Store } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { canonicalUrl } from "@/lib/site";
import { listingCover, onImageError } from "@/lib/listing-images";
import { daysRemaining, ngn, type Category } from "@/lib/pigeon-data";

interface StoreListing {
  id: string;
  slug: string | null;
  category_type: Category;
  custom_bird_name: string;
  breed_type: string;
  gender: "Male" | "Female" | "Pair";
  price_ngn: number;
  images: string[];
  vaccinated: boolean;
  state: string;
  description: string;
  batch_quantity: number;
  is_active: boolean;
  creation_timestamp: string;
  expiry_date: string;
  is_featured: boolean;
  is_verified_seller: boolean;
  breeder_id: string;
}

interface StoreData {
  user_id: string;
  username: string;
  full_name: string;
  loft_name: string;
  home_state: string;
  avatar_url: string;
  is_verified_seller: boolean;
  is_online: boolean;
  listings: StoreListing[];
}

async function loadStore(username: string) {
  const { data, error } = await supabase.rpc("get_public_store", { input_username: username });
  if (error) throw new Error(error.message);
  const row = ((data ?? [])[0] ?? null) as StoreData | null;
  if (!row) throw notFound();
  return row;
}

export const Route = createFileRoute("/u/$username")({
  loader: async ({ params }) => {
    const store = await loadStore(params.username);
    if (params.username !== store.username) {
      throw redirect({ to: "/u/$username", params: { username: store.username }, statusCode: 301 });
    }
    return store;
  },
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} Store — PigeonShield Nigeria` },
      { name: "description", content: `View active listings from @${params.username} on PigeonShield Nigeria.` },
      { property: "og:title", content: `@${params.username} Store — PigeonShield Nigeria` },
      { property: "og:description", content: `Active marketplace listings from @${params.username}.` },
    ],
    links: [{ rel: "canonical", href: canonicalUrl(`/u/${encodeURIComponent(params.username)}`) }],
  }),
  component: PublicStorePage,
});

function PublicStorePage() {
  const store = Route.useLoaderData();
  const storeUrl = canonicalUrl(`/u/${encodeURIComponent(store.username)}`);

  async function shareStore() {
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share({ title: `@${store.username} Store`, text: `View @${store.username} on PigeonShield Nigeria`, url: storeUrl });
        return;
      }
      await navigator.clipboard.writeText(storeUrl);
      toast.success("Store link copied.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share the store link.");
    }
  }

  async function copyStoreLink() {
    try {
      await navigator.clipboard.writeText(storeUrl);
      toast.success("Store link copied.");
    } catch {
      toast.error("Could not copy the store link.");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {store.avatar_url ? (
              <img src={store.avatar_url} alt="" className="size-20 rounded-full border border-border object-cover" />
            ) : (
              <div className="flex size-20 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-primary"><Store className="size-8" /></div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight">{store.full_name || `@${store.username}`}</h1>
                {store.is_verified_seller ? <Badge><ShieldCheck className="mr-1 size-3" /> Verified seller</Badge> : null}
              </div>
              <p className="mt-1 font-medium text-primary">@{store.username}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {[store.loft_name, store.home_state].filter(Boolean).join(" · ") || "PigeonShield marketplace seller"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{store.is_online ? "Online" : "Currently away"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copyStoreLink()}><Copy className="size-4" /> Copy Store Link</Button>
            <Button onClick={() => void shareStore()}><Share2 className="size-4" /> Share Store</Button>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Active listings</h2>
          <p className="text-sm text-muted-foreground">{store.listings.length} listing{store.listings.length === 1 ? "" : "s"} currently available.</p>
        </div>
        <Button asChild variant="ghost" size="sm"><Link to="/search" search={{ q: store.username, type: "stores", page: 1 }}><Link2 className="size-4" /> Marketplace Search</Link></Button>
      </div>

      {store.listings.length === 0 ? (
        <Card className="mt-4 p-10 text-center text-muted-foreground">This store has no active listings right now.</Card>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {store.listings.map((listing) => {
            const cover = listingCover({ ...listing, pedigree_json: null } as never);
            return (
              <Card key={listing.id} className="overflow-hidden p-0">
                <Link to="/listing/$id" params={{ id: listing.slug || listing.id }} className="block">
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    <img src={cover} alt={`${listing.breed_type} — ${listing.custom_bird_name}`} loading="lazy" decoding="async" onError={onImageError()} className="size-full object-cover" />
                    <Badge className="absolute left-2 top-2">{listing.category_type}</Badge>
                  </div>
                </Link>
                <div className="space-y-2 p-3 sm:p-4">
                  <Link to="/listing/$id" params={{ id: listing.slug || listing.id }}>
                    <h3 className="line-clamp-2 font-semibold">{listing.custom_bird_name}</h3>
                  </Link>
                  <p className="text-xs text-muted-foreground">{listing.breed_type} · {listing.gender}</p>
                  <p className="text-lg font-bold">{ngn(listing.price_ngn)}</p>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{listing.state}</span><span>{daysRemaining(new Date(listing.expiry_date).getTime())}d</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
