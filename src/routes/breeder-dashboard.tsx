import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2, PlusCircle, Package, Share2, Copy, Gift, ImagePlus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { referralLink } from "@/lib/site";
import { useStore } from "@/lib/store";
import { PhotoUploader, type UploadedPhoto } from "@/components/site/PhotoUploader";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { AuthPending, AuthRequired } from "@/components/site/AuthGate";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  BREEDS_BY_CATEGORY,
  CATEGORY_OPTIONS,
  NIGERIAN_STATES,
  daysRemaining,
  ngn,
  type Category,
} from "@/lib/pigeon-data";

export const Route = createFileRoute("/breeder-dashboard")({
  head: () => ({
    meta: [
      { title: "Breeder Dashboard — Manage Your PigeonShield Listings" },
      {
        name: "description",
        content:
          "Create escrow-protected pigeon and livestock listings, track 7-day expiry countdowns and manage your anonymous breeder inventory.",
      },
      { property: "og:title", content: "Breeder Dashboard — PigeonShield Nigeria" },
      { property: "og:description", content: "Publish listings and track escrow sales anonymously." },
    ],
  }),
  component: GuardedBreederDashboard,
});

function BreederDashboard() {
  const authed = useRequireAuth("Breeder Dashboard");
  const { db, user, addListing, deleteListing, authReady } = useStore();
  const [editingPhotos, setEditingPhotos] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("Pigeon");
  const [breed, setBreed] = useState<string>(BREEDS_BY_CATEGORY.Pigeon[0] ?? "");
  const [gender, setGender] = useState<"Male" | "Female" | "Pair">("Male");
  const [state, setState] = useState("Lagos");
  const [vaccinated, setVaccinated] = useState(true);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);

  if (!authReady) return <AuthPending />;
  if (!authed || !user) {
    return (
      <AuthRequired title="Breeder Dashboard" description="Log in to manage your listings." />
    );
  }

  const mine = db.listings.filter((l) => l.breeder_id === user.id);
  const mySales = db.transactions.filter((t) => t.breeder_id === user.id);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    void addListing({
      category_type: category,
      custom_bird_name: String(f.get("name") ?? ""),
      breed_type: breed,
      gender,
      price_ngn: Number(f.get("price") ?? 0),
      images: photos.map((p) => p.url),
      pedigree_json: null,
      vaccinated,
      state,
      description: String(f.get("description") ?? ""),
      batch_quantity: Number(f.get("qty") ?? 1),
    })
      .then(() => {
        form.reset();
        setPhotos([]);
        toast.success("Listing published — live for 7 days.");
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Could not publish listing.");
      });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Breeder Dashboard</h1>
      <p className="mt-1 text-muted-foreground">
        Trading as <span className="font-semibold text-primary">{user.real_name || user.public_handle}</span>
      </p>

      <Tabs defaultValue="inventory" className="mt-8">
        <TabsList>
          <TabsTrigger value="inventory">Inventory &amp; Sales</TabsTrigger>
          <TabsTrigger value="refer">
            <Share2 className="size-4" /> Refer &amp; Boost
          </TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-6">
          <AccountPanel />
        </TabsContent>

        <TabsContent value="refer" className="mt-6">
          <ReferBoost />
        </TabsContent>

        <TabsContent value="inventory" className="mt-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <PlusCircle className="size-4 text-primary" /> Create new listing
          </h2>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Custom animal name</Label>
              <Input id="name" name="name" required placeholder="Kano Thunder" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="category-combo">Category</Label>
                <Combobox
                  id="category-combo"
                  value={CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category}
                  options={CATEGORY_OPTIONS.map((c) => c.label)}
                  searchPlaceholder="Search category..."
                  onChange={(label) => {
                    const c = (CATEGORY_OPTIONS.find((o) => o.label === label)?.value ??
                      "Pigeon") as Category;
                    setCategory(c);
                    setBreed(BREEDS_BY_CATEGORY[c][0] ?? "");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="breed-combo">Breed</Label>
                <Combobox
                  id="breed-combo"
                  value={breed}
                  options={BREEDS_BY_CATEGORY[category]}
                  onChange={setBreed}
                  allowCustom
                  placeholder="Select or type a breed"
                  searchPlaceholder="Search or type a breed..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={(v) => setGender(v as typeof gender)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Pair">Pair</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {NIGERIAN_STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price">Price (₦)</Label>
                <Input id="price" name="price" type="number" min={1000} required defaultValue={150000} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qty">Batch quantity</Label>
                <Input id="qty" name="qty" type="number" min={1} required defaultValue={1} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Listing photos</Label>
              <PhotoUploader userId={user.id} photos={photos} onChange={setPhotos} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" required rows={3} placeholder="Bloodline, age, race record..." />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={vaccinated} onCheckedChange={(v) => setVaccinated(v === true)} />
              Vaccinated / health certified
            </label>
            <Button type="submit" className="w-full">Publish listing (7-day lifespan)</Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold">My listings ({mine.length})</h2>
            <div className="mt-4 space-y-3">
              {mine.length === 0 ? (
                <p className="text-sm text-muted-foreground">No listings yet.</p>
              ) : (
                mine.map((l) => (
                  <div key={l.id} className="space-y-3 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.custom_bird_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.breed_type} · {ngn(l.price_ngn)} · Qty {l.batch_quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit listing photos"
                        onClick={() => setEditingPhotos(editingPhotos === l.id ? null : l.id)}
                      >
                        <ImagePlus className="size-4" />
                      </Button>
                      <Badge variant={l.is_active ? "default" : "destructive"}>
                        {l.is_active ? `${daysRemaining(l.expiry_date)}d left` : "Expired"}
                      </Badge>
                      <Button size="icon" variant="ghost" aria-label="Delete listing" onClick={() => deleteListing(l.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                    </div>
                    {editingPhotos === l.id ? (
                      <ListingPhotoEditor listingId={l.id} userId={user.id} images={l.images} />
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Package className="size-4 text-primary" /> Escrow sales ({mySales.length})
            </h2>
            <div className="mt-4 space-y-3">
              {mySales.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales yet.</p>
              ) : (
                mySales.map((t) => (
                  <div key={t.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{t.listing_name}</span>
                      <Badge variant="outline">{t.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Payout {ngn(t.amount_naira - t.calculated_commission)} · commission {ngn(t.calculated_commission)}
                    </p>
                  </div>
                ))
              )}
            </div>
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
  if (!user) return null;
  return (
    <Card className="max-w-xl space-y-5 p-5">
      <h2 className="font-semibold">Your profile</h2>
      <AvatarUploader
        userId={user.id}
        value={user.avatar_url}
        onChange={async (url) => {
          const err = await updateProfile({ avatar_url: url });
          if (err) toast.error(err);
        }}
        label="Change profile picture"
      />
      <div className="space-y-1.5">
        <Label htmlFor="full-name">Full name (public)</Label>
        <div className="flex gap-2">
          <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Button
            onClick={async () => {
              const err = await updateProfile({ real_name: fullName, public_handle: fullName });
              if (err) toast.error(err);
              else toast.success("Name saved.");
            }}
          >
            Save
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="loft-name">Loft / farm name (optional, public)</Label>
        <div className="flex gap-2">
          <Input id="loft-name" value={loft} onChange={(e) => setLoft(e.target.value)} />
          <Button
            onClick={async () => {
              const err = await updateProfile({ loft_name: loft });
              if (err) toast.error(err);
              else toast.success("Loft name saved.");
            }}
          >
            Save
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="payout-phone">Contact &amp; payout phone (public)</Label>
        <div className="flex gap-2">
          <Input id="payout-phone" value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
          <Button
            onClick={async () => {
              const err = await updateProfile({ phone_number: phone });
              if (err) toast.error(err);
              else toast.success("Payout phone number saved.");
            }}
          >
            Save
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Buyers see your name, loft and phone number on every listing.
      </p>
    </Card>
  );
}

function ReferBoost() {
  const { db, applyReferral } = useStore();
  const [code, setCode] = useState("");
  const link =
    referralLink(db.referral_code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Referral link copied.");
    } catch {
      toast.error("Copy failed — select the link manually.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Share2 className="size-4 text-primary" /> Your share link
        </h2>
        <p className="text-sm text-muted-foreground">
          Every breeder or buyer who joins with your code earns you 1 boost credit. Credits push your
          listings higher in the marketplace feed.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="reflink">Share link</Label>
          <div className="flex gap-2">
            <Input id="reflink" readOnly value={link} />
            <Button variant="outline" onClick={copy} aria-label="Copy referral link">
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Join me on PigeonShield Nigeria — escrow-protected pigeon trading. ${link}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Share on WhatsApp
            </a>
          </Button>
          <Badge variant="outline">Referral code: {db.referral_code || "—"}</Badge>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Gift className="size-4 text-primary" /> Boost credits
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Referral credits earned</p>
            <p className="text-3xl font-bold text-primary">{db.referral_credits}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Total friends referred</p>
            <p className="text-3xl font-bold">{db.referred_count}</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="refcode">Were you referred? Enter their code</Label>
          <div className="flex gap-2">
            <Input
              id="refcode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABCD1234"
            />
            <Button
              onClick={async () => {
                const err = await applyReferral(code);
                if (err) toast.error(err);
                else {
                  toast.success("Referral credited to your inviter.");
                  setCode("");
                }
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Owner-side photo swap: uploads to storage, then persists the URLs on the row. */
function ListingPhotoEditor({
  listingId,
  userId,
  images,
}: {
  listingId: string;
  userId: string;
  images: string[];
}) {
  const { setListingImages } = useStore();
  const [photos, setPhotos] = useState<UploadedPhoto[]>(images.map((url) => ({ url, path: url })));
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <PhotoUploader userId={userId} photos={photos} onChange={setPhotos} />
      <Button
        size="sm"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          const err = await setListingImages(listingId, photos.map((p) => p.url));
          setSaving(false);
          if (err) toast.error(err);
          else toast.success("Listing photos saved.");
        }}
      >
        Save photos
      </Button>
    </div>
  );
}

function GuardedBreederDashboard() {
  return (
    <ProtectedRoute title="Breeder Dashboard" description="Log in to manage your listings.">
      <BreederDashboard />
    </ProtectedRoute>
  );
}
