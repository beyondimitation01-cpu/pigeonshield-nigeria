import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2, PlusCircle, Package, Share2, Copy, Gift, ImagePlus, RefreshCw, Search, ArrowUpRight, Clock, CheckCircle2, Truck, Wallet, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AvatarUploader } from "@/components/site/AvatarUploader";
import { Combobox } from "@/components/site/Combobox";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { referralLink, storeUrl } from "@/lib/site";
import { supabase } from "@/integrations/supabase/client";
import { listingCover, onImageError } from "@/lib/listing-images";
import { canRenewSellerListing, sellerListingStatus, type ListingStatus } from "@/lib/seller-dashboard";
import { useStore } from "@/lib/store";
import { PhotoUploader, type UploadedPhoto } from "@/components/site/PhotoUploader";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { AuthPending, AuthRequired } from "@/components/site/AuthGate";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ConfirmActionDialog } from "@/components/site/ConfirmActionDialog";
import { formatNigerianPhone, isValidNigerianPhone } from "@/lib/phone";
import { BREEDS_BY_CATEGORY, CATEGORY_OPTIONS, NIGERIAN_STATES, daysRemaining, ngn, type Category } from "@/lib/pigeon-data";

export const Route = createFileRoute("/breeder-dashboard")({
  head: () => ({
    meta: [
      { title: "Breeder Dashboard — Manage Your PigeonShield Listings" },
      { name: "description", content: "Create escrow-protected pigeon and livestock listings, track 7-day expiry countdowns and manage your seller inventory." },
      { property: "og:title", content: "Breeder Dashboard — PigeonShield Nigeria" },
      { property: "og:description", content: "Manage livestock listings, renew expired stock and follow escrow sales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GuardedBreederDashboard,
});

const TERMINAL_STATUSES = new Set(["Seller Paid", "Completed", "Refunded to Buyer"]);

type PricingUnit = "each" | "pair";

type SellerCategoryOption = { value: string; label: string };

const SELLER_CATEGORY_OPTIONS: SellerCategoryOption[] = [
  ...CATEGORY_OPTIONS,
  { value: "Cat", label: "Cats" },
  { value: "Goat", label: "Goats" },
  { value: "Sheep", label: "Sheep" },
  { value: "Cattle", label: "Cattle" },
  { value: "Pig", label: "Pigs" },
  { value: "Rabbit", label: "Rabbits" },
  { value: "Turkey", label: "Turkeys" },
  { value: "Duck", label: "Ducks" },
  { value: "Guinea Fowl", label: "Guinea Fowl" },
  { value: "Quail", label: "Quails" },
  { value: "Goose", label: "Geese" },
  { value: "Peacock", label: "Peacocks" },
  { value: "Ostrich", label: "Ostriches" },
  { value: "Donkey", label: "Donkeys" },
  { value: "Camel", label: "Camels" },
  { value: "Grasscutter", label: "Grasscutters" },
  { value: "Snail", label: "Snails" },
  { value: "Fish", label: "Fish" },
  { value: "Guinea Pig", label: "Guinea Pigs" },
  { value: "Other Bird", label: "Other Birds" },
];

function categoryBreeds(category: string) {
  return BREEDS_BY_CATEGORY[category as Category] ?? [];
}

function canonicalSellerCategory(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "Pigeon";
  const match = SELLER_CATEGORY_OPTIONS.find(
    (option) => option.value.toLowerCase() === trimmed.toLowerCase() || option.label.toLowerCase() === trimmed.toLowerCase(),
  );
  return match?.value ?? trimmed;
}

function categoryLabel(category: string) {
  return SELLER_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}

function BreederDashboard() {
  const authed = useRequireAuth("Breeder Dashboard");
  const { db, user, deleteListing, renewListing, authReady } = useStore();
  const [editingPhotos, setEditingPhotos] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("Pigeon");
  const [breed, setBreed] = useState<string>(BREEDS_BY_CATEGORY.Pigeon[0] ?? "");
  const [gender, setGender] = useState<"Male" | "Female" | "Pair">("Male");
  const [pricingUnit, setPricingUnit] = useState<PricingUnit>("each");
  const [state, setState] = useState("Lagos");
  const [vaccinated, setVaccinated] = useState(true);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [tab, setTab] = useState("inventory");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ListingStatus | "All">("All");
  const [renewing, setRenewing] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);

  if (!authReady) return <AuthPending />;
  if (!authed || !user) return <AuthRequired title="Breeder Dashboard" description="Log in to manage your listings." />;

  const mine = db.listings.filter((l) => l.breeder_id === user.id);
  const mySales = db.transactions.filter((t) => t.breeder_id === user.id && !TERMINAL_STATUSES.has(t.status));
  const counts = { Active: 0, Expired: 0, "Sold / retired": 0 };
  mine.forEach((listing) => { counts[sellerListingStatus(listing, now)] += 1; });
  const visibleListings = mine.filter((listing) => (filter === "All" || sellerListingStatus(listing, now) === filter) && `${listing.custom_bird_name} ${listing.breed_type} ${listing.category_type} ${listing.state}`.toLowerCase().includes(query.toLowerCase().trim())).sort((a, b) => b.creation_timestamp - a.creation_timestamp);
  const pendingPayout = mySales.reduce((total, sale) => total + sale.amount_naira - sale.calculated_commission, 0);
  const publicUsername = user.public_handle || user.real_name;
  const publicStoreUrl = publicUsername ? storeUrl(publicUsername) : null;

  async function shareStore() {
    if (!publicStoreUrl) {
      toast.error("Your public store username is not available yet.");
      return;
    }
    const nav: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator;
    const displayName = user?.real_name || publicUsername;
    try {
      if (nav && typeof nav.share === "function") {
        await nav.share({
          title: `${displayName} Store`,
          text: `View ${displayName} on PigeonShield Nigeria`,
          url: publicStoreUrl,
        });
        return;
      }
      await nav?.clipboard.writeText(publicStoreUrl);
      toast.success("Store link copied.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share the store link.");
    }
  }

  async function copyStoreLink() {
    if (!publicStoreUrl) {
      toast.error("Your public store username is not available yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(publicStoreUrl);
      toast.success("Store link copied.");
    } catch {
      toast.error("Could not copy the store link.");
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (publishing) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const price = Number(f.get("price") ?? 0);
    const quantity = Number(f.get("qty") ?? 1);
    const name = String(f.get("name") ?? "").trim();
    const description = String(f.get("description") ?? "").trim();
    if (!name) {
      toast.error("Enter a custom animal name.");
      return;
    }
    if (!Number.isSafeInteger(price) || price < 1000) {
      toast.error("Enter a valid price of at least ₦1,000.");
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      toast.error("Enter a valid quantity of at least 1.");
      return;
    }
    if (!category.trim()) {
      toast.error("Select or enter an animal category.");
      return;
    }
    setPublishing(true);
    try {
      const { error } = await supabase.from("listings").insert({
        category_type: canonicalSellerCategory(category),
        custom_bird_name: name,
        breed_type: breed.trim(),
        gender,
        price_ngn: price,
        pricing_unit: pricingUnit,
        images: photos.map((p) => p.url),
        pedigree_json: null,
        vaccinated,
        state,
        description,
        batch_quantity: quantity,
      } as never);
      if (error) throw new Error(error.message);
      form.reset();
      setCategory("Pigeon");
      setBreed(BREEDS_BY_CATEGORY.Pigeon[0] ?? "");
      setPhotos([]);
      setPricingUnit("each");
      setFilter("All");
      setQuery("");
      setTab("inventory");
      toast.success("Listing published — live for 7 days.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not publish listing.");
    } finally {
      setPublishing(false);
    }
  }

  function unitLabel(unit: string | undefined) {
    return unit === "pair" ? "per pair" : unit === "each" ? "each" : "per listing";
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 [&_h1]:tracking-normal [&_h2]:tracking-normal [&_h3]:tracking-normal">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">PigeonShield Nigeria · Seller workspace</p><h1 className="mt-2 text-3xl font-bold">Seller dashboard</h1><p className="mt-1 text-sm text-muted-foreground">{user.loft_name || user.real_name || user.public_handle}</p></div>
        <Button onClick={() => setTab("create")} size="lg" className="self-start"><PlusCircle /> New listing</Button>
      </div>
      <div className="mt-7 grid grid-cols-2 divide-x divide-border border-y border-border bg-card sm:grid-cols-4">
        {[{ label: "Active listings", value: counts.Active, icon: CheckCircle2, status: "Active" as const }, { label: "Needs renewal", value: counts.Expired, icon: Clock, status: "Expired" as const }, { label: "Ongoing sales", value: mySales.length, icon: Truck }, { label: "Pending payout", value: ngn(pendingPayout), icon: Wallet }].map((stat) => <div key={stat.label} className="min-w-0 p-4 sm:p-5"><div className="flex items-center gap-2 text-xs text-muted-foreground"><stat.icon className="size-4 shrink-0 text-primary" />{stat.label}</div><p className="mt-2 break-words text-xl font-bold sm:text-2xl">{stat.value}</p>{stat.status ? <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" onClick={() => { setTab("inventory"); setFilter(stat.status ?? "All"); setQuery(""); }}>View listings <ArrowUpRight /></Button> : <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0 text-xs"><Link to="/my-orders">View orders <ArrowUpRight /></Link></Button>}</div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4">
        <div className="min-w-0"><span className="text-sm font-semibold">My public store</span>{publicUsername ? <p className="break-all text-xs text-muted-foreground">/u/{publicUsername}</p> : null}</div>
        <div className="flex flex-wrap gap-2">{publicUsername ? <Button asChild size="sm" variant="ghost"><Link to="/u/$username" params={{ username: publicUsername }}>View store <ArrowUpRight /></Link></Button> : null}<Button size="sm" variant="outline" onClick={() => void shareStore()} disabled={!publicStoreUrl}><Share2 /> Share store</Button><Button size="icon" variant="ghost" title="Copy store link" aria-label="Copy store link" onClick={() => void copyStoreLink()} disabled={!publicStoreUrl}><Copy /></Button></div>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
          {[['inventory', 'Listings'], ['sales', 'Sales'], ['create', 'New listing'], ['refer', 'Refer & Boost'], ['account', 'Account']].map(([value, label]) => <TabsTrigger key={value} value={value} className="shrink-0 rounded-none border-b-2 border-transparent px-3 py-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none sm:px-5 sm:text-sm">{label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="account" className="mt-6"><AccountPanel /></TabsContent>
        <TabsContent value="refer" className="mt-6"><ReferBoost /></TabsContent>
        <TabsContent value="create" className="mt-6">
          <section className="max-w-2xl"><h2 className="text-xl font-semibold">New listing</h2><p className="mt-1 text-sm text-muted-foreground">Listing duration: 7 days</p>
              <form onSubmit={submit} className="mt-4 space-y-3">
                <div className="space-y-1.5"><Label htmlFor="name">Custom animal name</Label><Input id="name" name="name" required placeholder="Kano Thunder" /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="category-combo">Category</Label><Combobox id="category-combo" value={categoryLabel(category)} options={SELLER_CATEGORY_OPTIONS.map((c) => c.label)} allowCustom placeholder="Search or type an animal" searchPlaceholder="Search or type an animal..." onChange={(input) => { const next = canonicalSellerCategory(input); setCategory(next); setBreed(categoryBreeds(next)[0] ?? ""); }} /></div>
                  <div className="space-y-1.5"><Label htmlFor="breed-combo">Breed</Label><Combobox id="breed-combo" value={breed} options={categoryBreeds(category)} onChange={setBreed} allowCustom placeholder="Select or type a breed" searchPlaceholder="Search or type a breed..." /></div>
                  <div className="space-y-1.5"><Label>Gender</Label><Select value={gender} onValueChange={(v) => setGender(v as typeof gender)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Pair">Pair</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>State</Label><Select value={state} onValueChange={setState}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-64">{NIGERIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label htmlFor="pricing-unit">Price per</Label><Select value={pricingUnit} onValueChange={(v) => setPricingUnit(v as PricingUnit)}><SelectTrigger id="pricing-unit"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="each">Each</SelectItem><SelectItem value="pair">Pair</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1.5"><Label htmlFor="price">Price per {pricingUnit === "pair" ? "pair" : "unit"} (₦)</Label><Input id="price" name="price" type="number" min={1000} required defaultValue={150000} /><p className="text-xs text-muted-foreground">Enter the amount for one {pricingUnit === "pair" ? "pair" : "animal"}.</p></div>
                  <div className="space-y-1.5"><Label htmlFor="qty">Available {pricingUnit === "pair" ? "pairs" : "units"}</Label><Input id="qty" name="qty" type="number" min={1} required defaultValue={1} /></div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Example: ₦8,000 {pricingUnit === "pair" ? "per pair" : "each"}. Buyers can choose how many units to purchase.</div>
                <div className="space-y-1.5"><Label>Listing photos</Label><PhotoUploader userId={user.id} photos={photos} onChange={setPhotos} /></div>
                <div className="space-y-1.5"><Label htmlFor="description">Description</Label><Textarea id="description" name="description" required rows={3} placeholder="Bloodline, age, race record..." /></div>
                <label className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={vaccinated} onCheckedChange={(v) => setVaccinated(v === true)} /> Vaccinated / health certified</label>
                <Button type="submit" className="w-full" disabled={publishing}>{publishing ? "Publishing..." : "Publish listing (7-day lifespan)"}</Button>
              </form>
          </section>
        </TabsContent>
        <TabsContent value="inventory" className="mt-6">
          {counts.Expired > 0 ? <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-l-4 border-gold bg-gold/10 p-4"><div><p className="flex items-center gap-2 text-sm font-semibold"><Clock className="size-4" />{counts.Expired} expired {counts.Expired === 1 ? "listing" : "listings"}</p><p className="mt-1 text-xs text-muted-foreground">Hidden from the marketplace until renewed.</p></div><Button size="sm" variant="outline" onClick={() => { setFilter("Expired"); setQuery(""); }}>View expired</Button></div> : null}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><h2 className="text-xl font-semibold">My listings <span className="text-sm font-normal text-muted-foreground">({mine.length})</span></h2><div className="relative sm:w-72"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search your listings" placeholder="Search name, breed or location" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" /></div></div>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Listing status filters">{(["All", "Active", "Expired", "Sold / retired"] as const).map((status) => <Button key={status} size="sm" variant={filter === status ? "default" : "outline"} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status} <span className="opacity-70">{status === "All" ? mine.length : counts[status]}</span></Button>)}</div>
          <div className="mt-5 space-y-3">
            {visibleListings.length === 0 ? <div className="border-y border-dashed border-border py-16 text-center"><Package className="mx-auto size-9 text-muted-foreground" /><h3 className="mt-4 font-semibold">{mine.length ? "No matching listings" : "Your first listing starts here"}</h3><p className="mt-1 text-sm text-muted-foreground">{mine.length ? "Try another search or listing status." : "No animals listed yet."}</p><Button className="mt-5" variant={mine.length ? "outline" : "default"} onClick={() => { if (mine.length) { setQuery(""); setFilter("All"); } else setTab("create"); }}>{mine.length ? "Clear filters" : "New listing"}</Button></div> : visibleListings.map((listing) => {
              const status = sellerListingStatus(listing, now);
              return <article key={listing.id} className="rounded-lg border border-border bg-card p-4"><div className="flex items-start gap-3 sm:gap-5"><Link to="/listing/$id" params={{ id: listing.id }} className="shrink-0"><img src={listingCover(listing)} onError={onImageError()} loading="lazy" alt={listing.custom_bird_name} className="size-20 rounded-md object-cover sm:size-24" /></Link><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><Link to="/listing/$id" params={{ id: listing.id }} className="break-words font-semibold hover:text-primary">{listing.custom_bird_name}</Link><p className="mt-1 text-xs text-muted-foreground">{listing.category_type} · {listing.breed_type} · {listing.state}</p></div><Badge variant="outline" className={status === "Active" ? "border-primary/30 bg-primary/10 text-primary" : status === "Expired" ? "border-gold/40 bg-gold/15 text-gold-foreground" : "bg-muted text-muted-foreground"}>{status}</Badge></div><p className="mt-2 text-base font-bold">{ngn(listing.price_ngn)} <span className="text-xs font-normal text-muted-foreground">{unitLabel((listing as typeof listing & { pricing_unit?: string }).pricing_unit)}</span></p><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{listing.batch_quantity} available</span><span>{status === "Active" ? `${daysRemaining(listing.expiry_date)} days left · Ends ${new Date(listing.expiry_date).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}` : status === "Expired" ? `Expired ${new Date(listing.expiry_date).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}` : "Not on marketplace"}</span></div></div></div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><Button size="sm" variant="ghost" onClick={() => setEditingPhotos(editingPhotos === listing.id ? null : listing.id)} aria-expanded={editingPhotos === listing.id}><ImagePlus />{editingPhotos === listing.id ? "Close photos" : "Edit photos"}</Button><div className="flex items-center gap-2">{canRenewSellerListing(listing, now) ? <Button size="sm" disabled={renewing !== null} onClick={async () => { setRenewing(listing.id); try { await renewListing(listing.id); setNow(Date.now()); toast.success("Listing renewed for 7 more days."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not renew listing."); } finally { setRenewing(null); } }}><RefreshCw className={renewing === listing.id ? "animate-spin motion-reduce:animate-none" : ""} />{renewing === listing.id ? "Renewing…" : "Renew · 7 days"}</Button> : null}<ConfirmActionDialog title="Delete listing?" description={`Delete ${listing.custom_bird_name}? This cannot be undone.`} confirmLabel="Delete listing" onConfirm={async () => { try { await deleteListing(listing.id); toast.success("Listing deleted."); return true; } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete listing."); return false; } }}><Button size="icon" variant="ghost" title={`Delete ${listing.custom_bird_name}`} aria-label={`Delete ${listing.custom_bird_name}`}><Trash2 className="text-destructive" /></Button></ConfirmActionDialog></div></div>{editingPhotos === listing.id ? <ListingPhotoEditor listingId={listing.id} userId={user.id} images={listing.images} /> : null}</article>;
            })}
          </div>
        </TabsContent>
        <TabsContent value="sales" className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Ongoing sales <span className="text-sm font-normal text-muted-foreground">({mySales.length})</span></h2><Button asChild variant="outline" size="sm"><Link to="/my-orders">Manage orders <ArrowUpRight /></Link></Button></div>
          <div className="mt-5 space-y-3">{mySales.length === 0 ? <div className="border-y border-dashed border-border py-16 text-center"><Wallet className="mx-auto size-9 text-muted-foreground" /><h3 className="mt-4 font-semibold">No ongoing sales</h3><Button asChild variant="link" className="mt-3"><Link to="/transaction-history">View transaction history <ArrowUpRight /></Link></Button></div> : mySales.map((sale) => <article key={sale.id} className="rounded-lg border border-border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="break-words font-semibold">{sale.listing_name}</h3><p className="mt-1 text-xs text-muted-foreground">{new Date(sale.created_at).toLocaleDateString("en-NG")} · Order {sale.id.slice(0, 8)}</p></div><Badge variant={sale.status === "Disputed" ? "destructive" : "outline"}>{sale.status}</Badge></div><div className="mt-4 grid grid-cols-2 gap-4 border-y border-border py-3"><div><p className="text-xs text-muted-foreground">Expected payout</p><p className="mt-1 break-words font-semibold">{ngn(sale.amount_naira - sale.calculated_commission)}</p></div><div><p className="text-xs text-muted-foreground">Commission</p><p className="mt-1 break-words text-sm">{ngn(sale.calculated_commission)}</p></div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm text-muted-foreground">{sale.status === "Disputed" ? <AlertTriangle className="size-4 shrink-0 text-destructive" /> : <Clock className="size-4 shrink-0" />}{sale.status === "Escrow Funded" ? "Payment secured · Ready to dispatch" : sale.status === "In Transit" ? "On the way · Awaiting buyer receipt" : sale.status === "Disputed" ? "Dispute open · Check delivery proof" : sale.status === "Ready for Admin Payout" || sale.status === "Delivered" ? "Delivery confirmed · Awaiting admin payout" : "Awaiting payment verification"}</p><Button asChild size="sm" variant="outline"><Link to="/my-orders">Open orders <ArrowUpRight /></Link></Button></div></article>)}</div>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function AccountPanel() {
  const { user, updateProfile } = useStore();
  const [phone, setPhone] = useState(user?.phone_number ?? "");
  const [fullName, setFullName] = useState(user?.real_name ?? "");
  const [loft, setLoft] = useState(user?.loft_name ?? "");
  const [homeState, setHomeState] = useState(user?.home_state ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { if (!user) return; setPhone(user.phone_number); setFullName(user.real_name); setLoft(user.loft_name); setHomeState(user.home_state); }, [user]);
  if (!user) return null;
  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const name = fullName.trim(); const normalizedPhone = phone.trim() ? formatNigerianPhone(phone) : "";
    if (!name) { toast.error("Enter your full name."); return; }
    if (phone.trim() && !isValidNigerianPhone(phone)) { toast.error("Enter a valid Nigerian phone number."); return; }
    setSaving(true); const err = await updateProfile({ real_name: name, public_handle: name, phone_number: normalizedPhone, loft_name: loft.trim(), home_state: homeState }); setSaving(false); if (err) toast.error(err); else toast.success("Profile saved.");
  }
  async function deleteAccount() {
    setDeleting(true);
    try { const { error } = await (supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)("delete_my_account"); if (error) throw new Error(error.message); await supabase.auth.signOut(); toast.success("Your account has been permanently deleted."); window.location.assign("/"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not delete your account. Your account was not changed."); }
    finally { setDeleting(false); }
  }
  return <div className="space-y-6"><Card className="max-w-xl p-5"><h2 className="font-semibold">Your profile</h2><form onSubmit={saveProfile} className="mt-5 space-y-5"><AvatarUploader userId={user.id} value={user.avatar_url} onChange={async (url) => { const err = await updateProfile({ avatar_url: url }); if (err) toast.error(err); }} label="Change profile picture" /><div className="space-y-1.5"><Label htmlFor="full-name">Full name / username (public)</Label><Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required /></div><div className="grid gap-5 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="payout-phone">Contact &amp; payout phone (public)</Label><Input id="payout-phone" value={phone} inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" onChange={(e) => setPhone(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="home-state">Location / state</Label><Select value={homeState} onValueChange={setHomeState}><SelectTrigger id="home-state"><SelectValue placeholder="Select state" /></SelectTrigger><SelectContent className="max-h-64">{NIGERIAN_STATES.map((stateName) => <SelectItem key={stateName} value={stateName}>{stateName}</SelectItem>)}</SelectContent></Select></div></div><div className="space-y-1.5"><Label htmlFor="loft-name">Loft / farm name (optional, public)</Label><Input id="loft-name" value={loft} onChange={(e) => setLoft(e.target.value)} /></div><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save profile"}</Button><p className="text-xs text-muted-foreground">Buyers see your name, loft, location and phone number on your listings.</p></form></Card><Card className="max-w-xl border-destructive/40 p-5"><div className="space-y-2"><h2 className="font-semibold text-destructive">Danger Zone</h2><p className="text-sm text-muted-foreground">Permanently delete your account. This cannot be undone.</p></div><AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" className="mt-4" disabled={deleting}><Trash2 className="size-4" /> Delete Account</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Permanently delete your account?</AlertDialogTitle><AlertDialogDescription>This permanently deletes your authenticated account and personal profile data. Completed transaction history is retained as required by the marketplace. If you have active or unresolved marketplace activity, deletion will be blocked until it is resolved. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting} onClick={(event) => { event.preventDefault(); void deleteAccount(); }}>{deleting ? "Deleting..." : "Delete My Account"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></Card></div>;
}

function ReferBoost() {
  const { db } = useStore();
  const link = referralLink(db.referral_code);
  async function copy() { try { await navigator.clipboard.writeText(link); toast.success("Referral link copied."); } catch { toast.error("Copy failed — select the link manually."); } }
  return <div className="grid gap-6 lg:grid-cols-2"><Card className="space-y-4 p-5"><h2 className="flex items-center gap-2 font-semibold"><Share2 className="size-4 text-primary" /> Your share link</h2><p className="text-sm text-muted-foreground">Every breeder or buyer who joins with your code earns you 1 boost credit. Credits push your listings higher in the marketplace feed.</p><div className="space-y-1.5"><Label htmlFor="reflink">Share link</Label><div className="flex gap-2"><Input id="reflink" readOnly value={link} /><Button variant="outline" onClick={copy} aria-label="Copy referral link"><Copy className="size-4" /></Button></div></div><div className="flex flex-wrap gap-2"><Button asChild variant="secondary"><a href={`https://wa.me/?text=${encodeURIComponent(`Join me on PigeonShield Nigeria — escrow-protected pigeon trading. ${link}`)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a></Button><Badge variant="outline">Referral code: {db.referral_code || "—"}</Badge></div></Card><Card className="space-y-4 p-5"><h2 className="flex items-center gap-2 font-semibold"><Gift className="size-4 text-primary" /> Boost credits</h2><div className="grid grid-cols-2 gap-4"><div className="rounded-lg border border-border p-4"><p className="text-xs text-muted-foreground">Referral credits earned</p><p className="text-3xl font-bold text-primary">{db.referral_credits}</p></div><div className="rounded-lg border border-border p-4"><p className="text-xs text-muted-foreground">Total friends referred</p><p className="text-3xl font-bold">{db.referred_count}</p></div></div></Card></div>;
}

function ListingPhotoEditor({ listingId, userId, images }: { listingId: string; userId: string; images: string[] }) {
  const { setListingImages } = useStore();
  const [photos, setPhotos] = useState<UploadedPhoto[]>(images.map((url) => ({ url, path: url })));
  const [saving, setSaving] = useState(false);
  return <div className="space-y-2 rounded-md bg-muted/40 p-3"><PhotoUploader userId={userId} photos={photos} onChange={setPhotos} /><Button size="sm" disabled={saving} onClick={async () => { setSaving(true); const err = await setListingImages(listingId, photos.map((p) => p.url)); setSaving(false); if (err) toast.error(err); else toast.success("Listing photos saved."); }}>Save photos</Button></div>;
}

function GuardedBreederDashboard() {
  return <ProtectedRoute title="Breeder Dashboard" description="Log in to manage your listings."><BreederDashboard /></ProtectedRoute>;
}
