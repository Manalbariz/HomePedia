import { MapPin, Star } from "lucide-react";
import type { Listing } from "@/types/listing";

interface ListingCardProps {
  listing: Listing;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

export function ListingCard({
  listing,
  selected,
  compact,
  onClick,
}: ListingCardProps) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) onClick();
      }}
      className={`rounded-xl overflow-hidden border cursor-pointer transition-all duration-200 ${
        selected
          ? "border-primary shadow-lg shadow-primary/10"
          : "border-border hover:border-white/20"
      }`}
    >
      <div className={`relative bg-muted overflow-hidden ${compact ? "h-28" : "h-36"}`}>
        <img
          src={listing.imageUrl}
          alt={listing.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm rounded-full px-2.5 py-1 flex items-center gap-1">
          <Star size={10} className="text-yellow-400 fill-yellow-400" />
          <span className="text-xs font-bold text-foreground">{listing.score}</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-2 left-3 text-white font-bold text-base font-mono">
          {listing.price.toLocaleString("fr-FR")} €
          <span className="text-sm font-normal opacity-80">/mois</span>
        </div>
      </div>
      <div className="p-3 bg-card">
        <div className="font-semibold text-foreground text-sm mb-1">{listing.title}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <MapPin size={10} /> {listing.address}
        </div>
        {!compact && (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <span>{listing.rooms} pièces</span>
              <span>·</span>
              <span>{listing.surface} m²</span>
              <span>·</span>
              <span>{listing.floor}</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {listing.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full border border-border"
                >
                  {t}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
