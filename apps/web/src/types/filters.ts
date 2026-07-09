import type { ListingSource } from "./listing";

export interface ListingFilters {
  q?: string;
  city?: string;
  source?: ListingSource | "";
  minPrice?: number;
  maxPrice?: number;
  minRooms?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedListings<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export const LISTING_SOURCES: { value: ListingSource | ""; label: string }[] = [
  { value: "", label: "Toutes sources" },
  { value: "seloger", label: "SeLoger" },
  { value: "leboncoin", label: "Leboncoin" },
  { value: "bienici", label: "Bien'ici" },
  { value: "example", label: "Exemple" },
];

export const CITY_SUGGESTIONS = [
  "Paris",
  "Lyon",
  "Bordeaux",
  "Marseille",
  "Nantes",
  "Lille",
  "Toulouse",
];

export const EMPTY_FILTERS: ListingFilters = {};

export function filtersToSearchParams(filters: ListingFilters): string {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.city?.trim()) params.set("city", filters.city.trim().toLowerCase());
  if (filters.source) params.set("source", filters.source);
  if (filters.minPrice !== undefined && filters.minPrice > 0)
    params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined && filters.maxPrice > 0)
    params.set("maxPrice", String(filters.maxPrice));
  if (filters.minRooms !== undefined && filters.minRooms > 0)
    params.set("minRooms", String(filters.minRooms));
  if (filters.limit !== undefined && filters.limit > 0)
    params.set("limit", String(filters.limit));
  if (filters.offset !== undefined && filters.offset > 0)
    params.set("offset", String(filters.offset));
  return params.toString();
}

export function countActiveFilters(filters: ListingFilters): number {
  let n = 0;
  if (filters.q?.trim()) n++;
  if (filters.city?.trim()) n++;
  if (filters.source) n++;
  if (filters.minPrice !== undefined && filters.minPrice > 0) n++;
  if (filters.maxPrice !== undefined && filters.maxPrice > 0) n++;
  if (filters.minRooms !== undefined && filters.minRooms > 0) n++;
  return n;
}
