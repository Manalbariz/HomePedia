import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Filter, Search } from "lucide-react";
import { fetchSimilarListings } from "@/api/client";
import { ListingsMap } from "@/components/ListingsMap";
import { ListingCard } from "@/components/ListingCard";
import type { Listing } from "@/types/listing";

interface MapViewProps {
  listings: Listing[];
}

export function MapView({ listings }: MapViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Listing[]>([]);
  const selected = listings.find((l) => l.id === selectedId);

  useEffect(() => {
    if (!selectedId) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    fetchSimilarListings(selectedId)
      .then((data) => {
        if (!cancelled) setSimilar(data);
      })
      .catch(() => {
        if (!cancelled) setSimilar([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <div className="theme-surface pt-[60px] h-screen flex flex-col bg-background">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-background/80 backdrop-blur-sm z-10">
        <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-4 py-2.5 border border-border">
          <Search size={15} className="text-muted-foreground flex-shrink-0" />
          <input
            placeholder="Paris, Lyon, Bordeaux…"
            className="bg-transparent text-foreground text-sm outline-none flex-1 placeholder:text-muted-foreground"
          />
        </div>
        <button
          type="button"
          className="flex items-center gap-2 bg-secondary border border-border px-4 py-2.5 rounded-xl text-sm text-foreground hover:bg-card transition-colors whitespace-nowrap"
        >
          <Filter size={13} /> Filtres
        </button>
        <div className="flex items-center gap-2 bg-secondary border border-border px-4 py-2.5 rounded-xl text-sm text-muted-foreground whitespace-nowrap">
          <span className="text-primary font-semibold font-mono">
            {listings.length.toLocaleString("fr-FR")}
          </span>{" "}
          annonces
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[360px] flex-shrink-0 overflow-y-auto border-r border-border bg-background z-10">
          <div className="p-3 space-y-2">
            {listings.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                selected={selectedId === l.id}
                onClick={() => setSelectedId(selectedId === l.id ? null : l.id)}
              />
            ))}
          </div>
          {selected && similar.length > 0 && (
            <div className="px-3 pb-4 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Similaires ({similar.length})
              </p>
              <div className="space-y-2">
                {similar.map((l) => (
                  <ListingCard
                    key={l.id}
                    listing={l}
                    compact
                    selected={false}
                    onClick={() => setSelectedId(l.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          <ListingsMap
            listings={listings}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
            similarListings={similar}
          />

          <AnimatePresence>
            {selected && (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="absolute bottom-4 right-4 z-[1000] bg-card border border-primary/30 rounded-2xl p-4 w-64 shadow-elevated"
              >
                <img
                  src={selected.imageUrl}
                  alt={selected.title}
                  className="w-full h-32 object-cover rounded-xl mb-3 bg-muted"
                />
                <div className="font-semibold text-foreground text-sm mb-1">{selected.title}</div>
                <div className="text-xs text-muted-foreground mb-2">{selected.address}</div>
                <div className="text-primary font-bold text-lg font-mono">
                  {selected.price.toLocaleString("fr-FR")} €/mois
                </div>
                {similar.length > 0 && (
                  <p className="text-[10px] text-accent mt-2">
                    {similar.length} bien{similar.length > 1 ? "s" : ""} similaire
                    {similar.length > 1 ? "s" : ""} sur la carte
                  </p>
                )}
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block w-full text-center bg-primary text-white py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Voir l&apos;annonce →
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
