import { useMemo, useState } from "react";
import { Star, Pencil, Trash2, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { ngn, type Listing } from "@/lib/pigeon-data";
import { listingCover, onImageError, categoryFallback } from "@/lib/listing-images";

function statusOf(l: Listing) {
  if (!l.is_active) return { label: "Frozen", variant: "secondary" as const };
  if (l.batch_quantity <= 0) return { label: "Sold", variant: "outline" as const };
  if (l.expiry_date <= Date.now()) return { label: "Expired", variant: "outline" as const };
  return { label: "Active", variant: "default" as const };
}

export function AdminListingsTable() {
  const { db, setListingFlags, setListingOverride, deleteListing } = useStore();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Listing | null>(null);
  const [draft, setDraft] = useState({ name: "", breed: "", price: "", qty: "", state: "" });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...db.listings].sort((a, b) => b.creation_timestamp - a.creation_timestamp);
    if (!q) return all;
    return all.filter((l) =>
      [l.custom_bird_name, l.breeder_handle, l.breed_type, l.category_type, l.state]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [db.listings, query]);

  function openEdit(l: Listing) {
    setEditing(l);
    setDraft({
      name: l.custom_bird_name,
      breed: l.breed_type,
      price: String(l.price_ngn),
      qty: String(l.batch_quantity),
      state: l.state,
    });
  }

  async function saveEdit() {
    if (!editing) return;
    await setListingFlags(editing.id, {
      custom_bird_name: draft.name.trim(),
      breed_type: draft.breed.trim(),
      price_ngn: Math.max(0, Number(draft.price) || 0),
      batch_quantity: Math.max(0, Number(draft.qty) || 0),
      state: draft.state.trim(),
    });
    setEditing(null);
    toast.success("Listing updated.");
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Listings &amp; products ({db.listings.length})</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product, seller, breed…"
            className="h-9 w-64 pl-8"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Every post on the platform, updating live as users create listings.
      </p>

      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2">Product</th>
              <th className="p-2">Seller</th>
              <th className="p-2">Price</th>
              <th className="p-2">Breed / Category</th>
              <th className="p-2">Posted</th>
              <th className="p-2">Status</th>
              <th className="p-2">Commission %</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const seller = db.users.find((u) => u.id === l.breeder_id);
              const st = statusOf(l);
              return (
                <tr key={l.id} className="border-t border-border align-top">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <img
                        src={listingCover(l)}
                        onError={onImageError(categoryFallback(l.category_type, l.id))}
                        alt={l.custom_bird_name}
                        loading="lazy"
                        className="size-12 shrink-0 rounded-md object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{l.custom_bird_name}</p>
                        {l.is_featured ? (
                          <Badge variant="default" className="mt-1">Featured</Badge>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="p-2">
                    <p className="truncate">{seller?.real_name || l.breeder_handle}</p>
                    <p className="text-xs text-muted-foreground">
                      {seller?.phone_number || "—"}
                    </p>
                  </td>
                  <td className="p-2 font-semibold">{ngn(l.price_ngn)}</td>
                  <td className="p-2">
                    {l.breed_type}
                    <p className="text-xs text-muted-foreground">{l.category_type}</p>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {new Date(l.creation_timestamp).toLocaleDateString("en-NG", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="p-2"><Badge variant={st.variant}>{st.label}</Badge></td>
                  <td className="p-2">
                    <Input
                      className="h-8 w-20"
                      type="number"
                      placeholder="default"
                      defaultValue={l.commission_override ?? ""}
                      onBlur={(e) =>
                        void setListingOverride(
                          l.id,
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(l)}>
                        <Pencil className="size-3" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={l.is_featured ? "default" : "outline"}
                        onClick={async () => {
                          await setListingFlags(l.id, { is_featured: !l.is_featured });
                          toast.success(l.is_featured ? "Removed from homepage." : "Featured on homepage.");
                        }}
                      >
                        <Star className="size-3" /> Feature
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          await deleteListing(l.id);
                          toast.success("Listing deleted.");
                        }}
                      >
                        <Trash2 className="size-3" /> Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground">
                  No listings match that search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit listing</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ed-name">Title</Label>
              <Input id="ed-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ed-breed">Breed</Label>
                <Input id="ed-breed" value={draft.breed} onChange={(e) => setDraft({ ...draft, breed: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-state">State</Label>
                <Input id="ed-state" value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-price">Price (₦)</Label>
                <Input id="ed-price" type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-qty">Quantity</Label>
                <Input id="ed-qty" type="number" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} />
              </div>
            </div>
            {editing ? (
              <Button
                variant={editing.is_active ? "secondary" : "outline"}
                onClick={async () => {
                  await setListingFlags(editing.id, { is_active: !editing.is_active });
                  setEditing(null);
                  toast.success(editing.is_active ? "Listing frozen." : "Listing re-activated.");
                }}
              >
                {editing.is_active ? "Freeze listing" : "Re-activate listing"}
              </Button>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => void saveEdit()}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
