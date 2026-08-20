import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2, PlusCircle, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useRequireAuth } from "@/hooks/useRequireAuth";
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
  component: BreederDashboard,
});

function BreederDashboard() {
  const authed = useRequireAuth("Breeder Dashboard");
  const { db, user, addListing, deleteListing } = useStore();
  const [category, setCategory] = useState<Category>("Pigeon");
  const [breed, setBreed] = useState(BREEDS_BY_CATEGORY.Pigeon[0]);
  const [gender, setGender] = useState<"Male" | "Female" | "Pair">("Male");
  const [state, setState] = useState("Lagos");
  const [vaccinated, setVaccinated] = useState(true);

  if (!authed || !user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Breeder Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Log in to manage your listings.</p>
      </main>
    );
  }

  const mine = db.listings.filter((l) => l.breeder_id === user.id);
  const mySales = db.transactions.filter((t) => t.breeder_id === user.id);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    addListing({
      category_type: category,
      custom_bird_name: String(f.get("name") ?? ""),
      breed_type: breed,
      gender,
      price_ngn: Number(f.get("price") ?? 0),
      images: [],
      pedigree_json: null,
      vaccinated,
      state,
      description: String(f.get("description") ?? ""),
      batch_quantity: Number(f.get("qty") ?? 1),
    });
    e.currentTarget.reset();
    toast.success("Listing published — live for 7 days.");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Breeder Dashboard</h1>
      <p className="mt-1 text-muted-foreground">
        Trading as <span className="font-semibold text-primary">{user.public_handle}</span>
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
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
                <Label>Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) => {
                    const c = v as Category;
                    setCategory(c);
                    setBreed(BREEDS_BY_CATEGORY[c][0]);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Breed</Label>
                <Select value={breed} onValueChange={setBreed}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {BREEDS_BY_CATEGORY[category].map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <div key={l.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.custom_bird_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.breed_type} · {ngn(l.price_ngn)} · Qty {l.batch_quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={l.is_active ? "default" : "destructive"}>
                        {l.is_active ? `${daysRemaining(l.expiry_date)}d left` : "Expired"}
                      </Badge>
                      <Button size="icon" variant="ghost" aria-label="Delete listing" onClick={() => deleteListing(l.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
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
    </main>
  );
}
