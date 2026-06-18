import { useCallback, useEffect, useState } from "react";
import { fetchListings } from "@/api/client";
import type { ListingFilters } from "@/types/filters";
import type { Listing } from "@/types/listing";

interface UseFilteredListingsResult {
  listings: Listing[];
  loading: boolean;
  error: string | null;
  filters: ListingFilters;
  setFilters: (next: ListingFilters) => void;
  patchFilters: (patch: Partial<ListingFilters>) => void;
  resetFilters: () => void;
  reload: () => void;
}

export function useFilteredListings(
  initialFilters: ListingFilters = {},
): UseFilteredListingsResult {
  const [filters, setFiltersState] = useState<ListingFilters>(initialFilters);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (active: ListingFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchListings(active);
      setListings(data);
    } catch (e) {
      setListings([]);
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  const setFilters = useCallback((next: ListingFilters) => {
    setFiltersState(next);
  }, []);

  const patchFilters = useCallback((patch: Partial<ListingFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState({});
  }, []);

  const reload = useCallback(() => {
    void load(filters);
  }, [filters, load]);

  return {
    listings,
    loading,
    error,
    filters,
    setFilters,
    patchFilters,
    resetFilters,
    reload,
  };
}
