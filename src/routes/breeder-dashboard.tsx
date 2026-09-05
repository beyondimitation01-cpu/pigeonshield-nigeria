import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2, PlusCircle, Package, Share2, Copy, Gift, ImagePlus } from "lucide-react";
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
      { name: "description", content: "Create escrow-protected pigeon and livestock listings, track 7-day expiry countdowns and manage your anonymous breeder inventory." },
      { property: "og:title", content: "Breeder Dashboard — PigeonShield Nigeria" },
      { property: "og:description", content: "Publish listings and track escrow sales anonymously." },
    ],
  }),
  component: GuardedBreederDashboard,
});

const TERMINAL_STATUSES = new Set(["Seller Paid", "Completed", "Refunded to Buyer"]);

type PricingUnit = "each" | "pair";

function BreederDashboard() {
  const authed = useRequireAuth("Breeder Dashboard");
  const { db, user, deleteListing, authReady } = useStore();
  const [editingPhotos, setEditingPhotos] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("Pigeon");
  const [breed, setBreed] = useState<string>(BREEDS_BY_CATEGORY.Pigeon[0] ?? "");
  const [gender, setGender] = useState<"Male" | "Female" | "Pair">("Male");
  const [pricingUnit, setPricingUnit] = useState<PricingUnit>("each");
  const [state, setState] = useState("Lagos");
  const [vaccinated, setVaccinated] = useState(true);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);

  if (!authReady) return <AuthPending />;
  if (!authed || !user) return <AuthRequired title="Breeder Dashboard" description="Log in to manage your listings." />;

  const mine = db.listings.filter((l) => l.breeder_id === user.id);
  const mySales = db.transactions.filter((t) => t.breeder_id === user.id && !TERMINAL_STATUSES.has(t.status));
  const publicUsername = user.public_handle || user.real_name;
  const publicStoreUrl = publicUsername ? storeUrl(publicUsername) : null;

  async function shareStore() {
    if (!publicStoreUrl) {
      toast.error("Your public store username is not available yet.");
      return;
    }
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share({
          title: `${user.real_name || publicUsername} Store`,
          text: `View ${user.real_name || publicUsername} on PigeonShield Nigeria`,
          url: publicStoreUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(publicStoreUrl);
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

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const price = Number(f.get("price") ?? 0);
    const quantity = Number(f.get("qty") ?? 1);
    if (!Number.isSafeInteger(price) || price < 1000) {
      toast.error("Enter a valid price of at least ₦1,000.");
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      toast.error("Enter a valid quantity of at least 1.");
      return;
    }
    void supabase.from("listings").insert({
      category_type: category,
      breeder_id: user.id,
      breeder_handle: user.public_handle,
      custom_bird_name: String(f.get("name") ?? "").trim(),
      breed_type: breed,
      gender,
      price_ngn: price,
      pricing_unit: pricingUnit,
      images: photos.map((p) => p.url),
      pedigree_json: null,
      vaccinated,
      state,
      description: String(f.get("description") ?? "").trim(),
      batch_quantity: quantity,
      is_active: true,
      creation_timestamp: new Date().toISOString(),
      expiry_date: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    } as never).then(({ error }) => {
      if (error) throw new Error(error.message);
    }).then(() => { form.reset(); setPhotos([]); setPricingUnit("each"); toast.success("Listing published — live for 7 days."); }).catch((err: unknown) => { toast.error(err instanceof Error ? err.message : "Could not publish listing."); });
  }

  function unitLabel(unit: string | undefined) {
    return unit === "pair" ? "per pair" : unit === "each" ? "each" : "per listing";
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Breeder Dashboard</h1>
      <p className="mt-1 text-muted-foreground">Trading as <span className="font-semibold text-primary">{user.real_name || user.public_handle}</span></p>
      <Card className="mt-6 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold">My Public Store</h2>
            <p className="mt-1 text-sm text-muted-foreground">Share your seller store so buyers can see your active listings.</p>
            {publicUsername ? <p className="mt-1 text-xs text-muted-foreground">/{"u/"}{publicUsername}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {publicUsername ? <Button asChild variant="outline"><Link to="/u/$username" params={{ username: publicUsername }}>View Store</Link></Button> : null}
            <Button onClick={() => void shareStore()} disabled={!publicStoreUrl}><Share2 className="size-4" /> Share Store</Button>
            <Button variant="secondary" onClick={() => void copyStoreLink()} disabled={!publicStoreUrl}><Copy className="size-4" /> Copy Store Link</Button>
          </div>
        </div>
      </Card>
      <Tabs defaultValue="inventory" className="mt-8">
        <TabsList>
          <TabsTrigger value="inventory">Inventory &amp; Sales</TabsTrigger>
          <TabsTrigger value="refer"><Share2 className="size-4" /> Refer &amp; Boost</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>
        <TabsContent value="account" className="mt-6"><AccountPanel /></TabsContent>
        <TabsContent value="refer" className="mt-6"><ReferBoost /></TabsContent>
        <TabsContent value="inventory" className="mt-6">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-semibold"><PlusCircle className="size-4 text-primary" /> Create new listing</h2>
              <form onSubmit={submit} className="mt-4 space-y-3">
                <div className="space-y-1.5"><Label htmlFor="name">Custom animal name</Label><Input id="name" name="name" required placeholder="Kano Thunder" /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="category-combo">Category</Label><Combobox id="category-combo" value={CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category} options={CATEGORY_OPTIONS.map((c) => c.label)} searchPlaceholder="Search category..." onChange={(label) => { const c = (CATEGORY_OPTIONS.find((o) => o.label === label)?.value ?? "Pigeon") as Category; setCategory(c); setBreed(BREEDS_BY_CATEGORY[c][0] ?? ""); }} /></div>
                  <div className="space-y-1.5"><Label htmlFor="breed-combo">Breed</Label><Combobox id="breed-combo" value={breed} options={BREEDS_BY_CATEGORY[category]} onChange={setBreed} allowCustom placeholder="Select or type a breed" searchPlaceholder="Search or type a breed..." /></div>
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
                <Button type="submit" className="w-full">Publish listing (7-day lifespan)</Button>
              </form>
            </Card>
            <div className="space-y-6">
              <Card className="p-5">
                <h2 className="font-semibold">My listings ({mine.length})</h2>
                <div className="mt-4 space-y-3">{mine.length === 0 ? <p className="text-sm text-muted-foreground">No listings yet.</p> : mine.map((l) => <div key={l.id} className="space-y-3 rounded-md border border-border p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{l.custom_bird_name}</p><p className="text-xs text-muted-foreground">{l.breed_type} · {ngn(l.price_ngn)} {unitLabel((l as typeof l & { pricing_unit?: string }).pricing_unit)} · Qty {l.batch_quantity}</p></div><div className="flex items-center gap-2"><Button size="icon" variant="ghost" aria-label="Edit listing photos" onClick={() => setEditingPhotos(editingPhotos === l.id ? null : l.id)}><ImagePlus className="size-4" /></Button><Badge variant={l.is_active ? "default" : "destructive"}>{l.is_active ? `${daysRemaining(l.expiry_date)}d left` : "Expired"}</Badge><ConfirmActionDialog title="Confirm Delete" description={`Are you sure you want to delete ${l.custom_bird_name}? This action cannot be undone.`} confirmLabel="Confirm Delete" onConfirm={async () => { try { await deleteListing(l.id); toast.success("Listing deleted."); return true; } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete listing."); return false; } }}><Button size="icon" variant="ghost" aria-label="Delete listing"><Trash2 className="size-4 text-destructive" /></Button></ConfirmActionDialog></div></div>{editingPhotos === l.id ? <ListingPhotoEditor listingId={l.id} userId={user.id} images={l.images} /> : null}</div>)}</div>
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Package className="size-4 text-primary" /> Escrow sales ({mySales.length})</h2><Button asChild size="sm" variant="ghost"><a href="/my-orders">Transaction history</a></Button></div>
                <p className="mt-1 text-xs text-muted-foreground">Only sales that still require action appear here. Final sales remain preserved in Transaction History.</p>
                <div className="mt-4 space-y-3">{mySales.length === 0 ? <p className="text-sm text-muted-foreground">No active sales.</p> : mySales.map((t) => <div key={t.id} className="rounded-md border border-border p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium">{t.listing_name}</span><Badge variant="outline">{t.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Payout {ngn(t.amount_naira - t.calculated_commission)} · commission {ngn(t.calculated_commission)}</p></div>)}</div>
              </Card>
            </div>
          </div>
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
    try { const { error } = await supabase.rpc("delete_my_account"); if (error) throw new Error(error.message); await supabase.auth.signOut(); toast.success("Your account has been permanently deleted."); window.location.assign("/"); }
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