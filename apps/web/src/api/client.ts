import type { Listing } from "@/types/listing";
import type { ListingFilters } from "@/types/filters";
import { filtersToSearchParams } from "@/types/filters";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export async function fetchListings(filters: ListingFilters = {}): Promise<Listing[]> {
  const qs = filtersToSearchParams(filters);
  const url = qs ? `${API_BASE}/api/listings?${qs}` : `${API_BASE}/api/listings`;
  const res = await fetch(url);
  return parseJson<Listing[]>(res);
}

export async function fetchListingById(id: string): Promise<Listing> {
  const res = await fetch(`${API_BASE}/api/listings/${encodeURIComponent(id)}`);
  return parseJson<Listing>(res);
}

export async function fetchSimilarListings(id: string): Promise<Listing[]> {
  const res = await fetch(
    `${API_BASE}/api/listings/${encodeURIComponent(id)}/similar`,
  );
  return parseJson<Listing[]>(res);
}

export async function scrapeListingUrl(url: string): Promise<import("@/types/compare").ComparedListing> {
  const res = await fetch(`${API_BASE}/api/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return parseJson<import("@/types/compare").ComparedListing>(res);
}
