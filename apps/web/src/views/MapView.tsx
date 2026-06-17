import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Filter, Loader2, Search } from "lucide-react";
import { fetchSimilarListings } from "@/api/client";
import { ListingsMap } from "@/components/ListingsMap";
import { ListingCard } from "@/components/ListingCard";
import { MapFiltersPanel } from "@/components/MapFiltersPanel";
import { useFilteredListings } from "@/hooks/useFilteredListings";
import { countActiveFilters } from "@/types/filters";
import type { Listing } from "@/types/listing";

export function MapView() {
  const {
    listings,
    loading,
    error,
    filters,
    patchFilters,
    resetFilters,
    reload,
  } = useFilteredListings();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Listing[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");

  const selected = listings.find((l) => l.id === selectedId);
  const activeFilterCount = countActiveFilters(filters);

  useEffect(() => {
    setSearchDraft(filters.q ?? "");
  }, [filters.q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchDraft.trim();
      if ((filters.q ?? "") !== next) {
        patchFilters({ q: next || undefined });
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, filters.q, patchFilters]);

  useEffect(() => {
    if (selectedId && !listings.some((l) => l.id === selectedId)) {
      setSelectedId(null);
    }
  }, [listings, selectedId]);

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
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-4 py-2.5 border border-border">
            <Search size={15} className="text-muted-foreground flex-shrink-0" />
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Paris, Lyon, Bordeaux…"
              className="bg-transparent text-foreground text-sm outline-none flex-1 placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 border px-4 py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap ${
              showFilters || activeFilterCount > 0
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-secondary border-border text-foreground hover:bg-card"
            }`}
          >
            <Filter size={13} />
            Filtres
            {activeFilterCount > 0 && (
              <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2 bg-secondary border border-border px-4 py-2.5 rounded-xl text-sm text-muted-foreground whitespace-nowrap">
            {loading ? (
              <Loader2 size={14} className="animate-spin text-primary" />
            ) : (
              <span className="text-primary font-semibold font-mono">
                {listings.length.toLocaleString("fr-FR")}
              </span>
            )}{" "}
            annonces
          </div>
        </div>

        {showFilters && (
          <MapFiltersPanel
            filters={filters}
            onChange={patchFilters}
            onReset={() => {
              resetFilters();
              setSearchDraft("");
              setShowFilters(false);
            }}
            onClose={() => setShowFilters(false)}
          />
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-sm text-primary bg-primary/10 border-b border-primary/20">
          {error}{" "}
          <button type="button" onClick={reload} className="underline font-semibold">
            Réessayer
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[360px] flex-shrink-0 overflow-y-auto border-r border-border bg-background z-10">
          {loading && listings.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Loader2 size={24} className="animate-spin mx-auto mb-2 text-primary" />
              Chargement…
            </div>
          ) : listings.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Aucune annonce pour ces filtres.
              <button
                type="button"
                onClick={() => {
                  resetFilters();
                  setSearchDraft("");
                }}
                className="block mx-auto mt-3 text-primary font-semibold underline"
              >
                Réinitialiser
              </button>
            </div>
          ) : (
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
          )}
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
