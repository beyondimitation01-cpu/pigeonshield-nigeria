import { Link } from "@tanstack/react-router";
import { Bird, ImageOff, MapPin, Flag, Clock, Star, BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { reportToAdmin } from "@/lib/report";
import { daysRemaining, ngn, type Listing } from "@/lib/pigeon-data";
import { listingCover, onImageError } from "@/lib/listing-images";
import { useStore } from "@/lib/store";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { UserAvatar } from "@/components/site/UserAvatar";

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
  const { db } = useStore();
  const { requireAuth } = useAuthGuard();
  const seller = listing.breeder_id ? db.sellers[listing.breeder_id] : undefined;

  return (
    <Card className="group flex h-full flex-col overflow-hidden p-0 transition-shadow hover:shadow-lg">
      <Link to="/listing/$id" params={{ id: listing.id }} className="block">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
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
          <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{listing.category_type}</Badge>
            {listing.is_featured ? (
              <Badge className="gap-1 bg-gold px-1.5 py-0 text-[10px] text-gold-foreground hover:bg-gold">
                <Star className="size-2.5" /> Featured
              </Badge>
            ) : null}
            {listing.is_verified_seller ? (
              <Badge className="gap-1 px-1.5 py-0 text-[10px]">
                <BadgeCheck className="size-2.5" /> Verified
              </Badge>
            ) : null}
          </div>
          <Badge
            className="absolute right-1.5 top-1.5 gap-1 px-1.5 py-0 text-[10px]"
            variant={days <= 2 ? "destructive" : "default"}
          >
            <Clock className="size-2.5" /> {days}d
          </Badge>
          <p className="absolute bottom-0 left-0 right-0 bg-primary/90 px-2 py-1 text-sm font-bold text-primary-foreground">
            {ngn(listing.price_ngn)}
          </p>
        </div>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5 sm:p-4">
        <Link to="/listing/$id" params={{ id: listing.id }}>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground sm:text-base">
            {listing.custom_bird_name}
          </h3>
        </Link>
        <p className="truncate text-xs text-muted-foreground sm:text-sm">
          {listing.breed_type} · {listing.gender}
        </p>
        <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="size-3 shrink-0" /> <span className="truncate">{listing.state}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1">
            {seller?.avatar_url ? (
              <UserAvatar url={seller.avatar_url} name={listing.breeder_handle} size={16} />
            ) : (
              <Bird className="size-3 shrink-0" />
            )}
            <span className="truncate">{seller?.full_name || seller?.public_handle || listing.breeder_handle}</span>
            {seller?.loft_name ? <span className="truncate text-[11px]">· {seller.loft_name}</span> : null}
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Qty: {listing.batch_quantity}</Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5 text-[11px] text-destructive hover:bg-destructive/10"
            onClick={() => reportToAdmin(`Listing ID ${listing.id} (${listing.custom_bird_name})`)}
          >
            <Flag className="size-3" /> Report
          </Button>
        </div>
      </div>
    </Card>
  );
}
