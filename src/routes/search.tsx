import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, Store, Package } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canonicalUrl } from "@/lib/site";
import { onImageError } from "@/lib/listing-images";
import { searchMarketplace, type MarketplaceSearchRow } from "@/lib/marketplace-api";

const searchSchema = z.object({
  q: z.string().catch(""),
  type: z.enum(["all", "products", "stores"]).catch("all"),
  page: z.coerce.number().int().min(1).catch(1),
});

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const rows = await searchMarketplace({ query: deps.q, kind: deps.type, limit: 21, offset: (deps.page - 1) * 20 });
    return { rows: rows.slice(0, 20), hasMore: rows.length > 20 };
  },
  head: ({ search }) => ({
    meta: [
      { title: search.q ? `Search: ${search.q} — PigeonShield Nigeria` : "Marketplace Search — PigeonShield Nigeria" },
      { name: "description", content: "Search active PigeonShield Nigeria marketplace listings and public seller stores." },
      { property: "og:title", content: "Marketplace Search — PigeonShield Nigeria" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl(`/search?q=${encodeURIComponent(search.q)}&type=${search.type}&page=${search.page}`) }],
  }),
  component: SearchPage,
});

function SearchPage() {
  const search = Route.useSearch();
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const [input, setInput] = useState(search.q);

  useEffect(() => setInput(search.q), [search.q]);

  function submit() {
    void navigate({ to: "/search", search: { q: input.trim(), type: search.type, page: 1 } });
  }

  const page = search.page;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Marketplace Search</h1>
      <p className="mt-1 text-muted-foreground">Search active products and public seller stores.</p>
      <form className="mt-6 flex gap-2" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search products, breeds, states or stores" className="pl-9" /></div>
        <Button type="submit">Search</Button>
      </form>
      <div className="mt-5 flex flex-wrap gap-2">
        {(["all", "products", "stores"] as const).map((type) => <Link key={type} to="/search" search={{ q: search.q, type, page: 1 }}><Button variant={search.type === type ? "default" : "outline"} size="sm">{type === "all" ? "All" : type === "products" ? "Products" : "Stores"}</Button></Link>)}
      </div>
      {data.rows.length === 0 ? <Card className="mt-6 p-10 text-center text-muted-foreground">No results found.</Card> : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.rows.map((row: MarketplaceSearchRow) => (
            <Card key={`${row.kind}:${row.id}`} className="overflow-hidden p-0">
              {row.kind === "product" ? <Link to="/listing/$id" params={{ id: row.url_key }} className="block"><div className="relative aspect-[4/3] overflow-hidden bg-muted">{row.image_url ? <img src={row.image_url} alt={row.title} loading="lazy" decoding="async" onError={onImageError()} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Package className="size-10 text-muted-foreground" /></div>}<Badge className="absolute left-2 top-2">Product</Badge></div></Link> : <Link to="/u/$username" params={{ username: row.username || row.url_key }} className="block"><div className="flex aspect-[4/3] items-center justify-center bg-muted">{row.image_url ? <img src={row.image_url} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <Store className="size-10 text-muted-foreground" />}</div></Link>}
              <div className="space-y-2 p-4"><div className="flex items-center justify-between gap-2"><h2 className="line-clamp-2 font-semibold">{row.title}</h2><Badge variant="outline">{row.kind === "product" ? "Product" : "Store"}</Badge></div><p className="line-clamp-2 text-xs text-muted-foreground">{row.subtitle}</p>{row.kind === "store" ? <Button asChild size="sm" variant="outline" className="w-full"><Link to="/u/$username" params={{ username: row.username || row.url_key }}>View Store</Link></Button> : null}</div>
            </Card>
          ))}
        </div>
      )}
      <div className="mt-8 flex items-center justify-center gap-3">{page > 1 ? <Button asChild variant="outline"><Link to="/search" search={{ q: search.q, type: search.type, page: page - 1 }}>Previous</Link></Button> : null}<span className="text-sm text-muted-foreground">Page {page}</span>{data.hasMore ? <Button asChild variant="outline"><Link to="/search" search={{ q: search.q, type: search.type, page: page + 1 }}>Next</Link></Button> : null}</div>
    </main>
  );
}
