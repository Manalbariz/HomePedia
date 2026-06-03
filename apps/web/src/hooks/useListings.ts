import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchListings } from "@/api/client";
import type { Listing } from "@/types/listing";

interface UseListingsResult {
  listings: Listing[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useListings(): UseListingsResult {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchListings();
      setListings(data);
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Impossible de charger les annonces";
      setError(message);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { listings, loading, error, reload: load };
}
