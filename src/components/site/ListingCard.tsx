import { Link } from "@tanstack/react-router";
import { Bird, ImageOff, MapPin, Flag, Clock, Star, BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { reportToAdmin } from "@/lib/store";
import { daysRemaining, ngn, type Listing } from "@/lib/pigeon-data";
import { listingCover, onImageError } from "@/lib/listing-images";

export function MediaPlaceholder({ label, className }: { label: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground ${className ?? ""}`}>
      <ImageOff className="size-6" aria-hidden />
      <span className="text-xs font-medium">{label} Photo Placeholder</span>
    </div>
  );
}

export function ListingCard({ listing }: { listing: Listing }) {
  const days = daysRemaining(listing.expiry_date);
  const cover = listingCover(listing);

  return (
    <Card className="group overflow-hidden p-0 transition-shadow hover:shadow-lg">
      <Link to="/listing/$id" params={{ id: listing.id }} className="block">
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          <img
              src={cover}
              alt={`${listing.breed_type} — ${listing.custom_bird_name}`}
              loading="lazy"
              decoding="async"
              width={1024}
              height={768}
              onError={onImageError()}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            <Badge variant="secondary">{listing.category_type}</Badge>
            {listing.is_featured ? (
              <Badge className="gap-1 bg-amber-500 text-amber-950 hover:bg-amber-500">
                <Star className="size-3" /> Featured
              </Badge>
            ) : null}
            {listing.is_verified_seller ? (
              <Badge className="gap-1">
                <BadgeCheck className="size-3" /> Verified seller
              </Badge>
            ) : null}
          </div>
          <Badge className="absolute right-2 top-2 gap-1" variant={days <= 2 ? "destructive" : "default"}>
            <Clock className="size-3" /> Days Remaining: {days}
          </Badge>
        </div>
      </Link>
      <div className="space-y-2 p-4">
        <Link to="/listing/$id" params={{ id: listing.id }}>
          <h3 className="line-clamp-1 font-semibold text-foreground">{listing.custom_bird_name}</h3>
        </Link>
        <p className="text-sm text-muted-foreground">
          {listing.breed_type} · {listing.gender}
        </p>
        <p className="text-lg font-bold text-primary">{ngn(listing.price_ngn)}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" /> {listing.state}
          </span>
          <span className="inline-flex items-center gap-1">
            <Bird className="size-3" /> {listing.breeder_handle}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Badge variant="outline">Qty: {listing.batch_quantity}</Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
            onClick={() => reportToAdmin(`Listing ID ${listing.id} (${listing.custom_bird_name})`)}
          >
            <Flag className="size-3" /> Report
          </Button>
        </div>
      </div>
    </Card>
  );
}
