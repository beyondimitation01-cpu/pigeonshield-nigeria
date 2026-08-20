import { DEFAULT_PIGEON_IMAGE, isUsableImageUrl, onImageError } from "@/lib/listing-images";

/** Round profile picture with a guaranteed-clean fallback graphic. */
export function UserAvatar({
  url,
  name,
  size = 32,
  className,
}: {
  url?: string | null;
  name?: string;
  size?: number;
  className?: string;
}) {
  const src = isUsableImageUrl(url) ? url : DEFAULT_PIGEON_IMAGE;
  return (
    <img
      src={src}
      alt={name ? `${name} profile picture` : "Profile picture"}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={onImageError()}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full border border-border object-cover ${className ?? ""}`}
    />
  );
}
