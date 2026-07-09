import type { ListingRecord } from "./types.js";

export interface ListingFilters {
  q?: string;
  city?: string;
  source?: string;
  minPrice?: number;
  maxPrice?: number;
  minRooms?: number;
}

export interface ListingPagination {
  limit?: number;
  offset: number;
}

export interface PaginatedListings<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

const MAX_PAGE_SIZE = 200;

export function extractCity(address: string): string {
  const tail = address.includes(",") ? address.split(",").pop()!.trim() : address;
  const lower = tail.toLowerCase();
  if (lower.includes("paris")) return "paris";
  if (lower.includes("lyon")) return "lyon";
  if (lower.includes("bordeaux") || lower.includes("mérignac") || lower.includes("merignac"))
    return "bordeaux";
  if (lower.includes("marseille")) return "marseille";
  if (lower.includes("nantes")) return "nantes";
  if (lower.includes("lille")) return "lille";
  if (lower.includes("toulouse")) return "toulouse";
  if (lower.includes("saint-malo")) return "saint-malo";
  if (lower.includes("strasbourg")) return "strasbourg";
  return lower;
}

function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseListingFilters(query: Record<string, unknown>): ListingFilters {
  return {
    q: typeof query.q === "string" && query.q.trim() ? query.q.trim() : undefined,
    city:
      typeof query.city === "string" && query.city.trim()
        ? query.city.trim().toLowerCase()
        : undefined,
    source:
      typeof query.source === "string" && query.source.trim()
        ? query.source.trim().toLowerCase()
        : undefined,
    minPrice: parseOptionalInt(query.minPrice),
    maxPrice: parseOptionalInt(query.maxPrice),
    minRooms: parseOptionalInt(query.minRooms),
  };
}

export function parsePagination(query: Record<string, unknown>): ListingPagination {
  const rawLimit = parseOptionalInt(query.limit);
  const rawOffset = parseOptionalInt(query.offset) ?? 0;
  return {
    limit:
      rawLimit !== undefined && rawLimit > 0
        ? Math.min(rawLimit, MAX_PAGE_SIZE)
        : undefined,
    offset: Math.max(0, rawOffset),
  };
}

export function paginateListings<T>(
  listings: T[],
  pagination: ListingPagination,
): PaginatedListings<T> {
  const offset = pagination.offset;
  if (pagination.limit === undefined) {
    return {
      items: listings,
      total: listings.length,
      limit: listings.length,
      offset,
    };
  }
  return {
    items: listings.slice(offset, offset + pagination.limit),
    total: listings.length,
    limit: pagination.limit,
    offset,
  };
}

export function filterListings(
  listings: ListingRecord[],
  filters: ListingFilters,
): ListingRecord[] {
  const q = filters.q?.toLowerCase();

  return listings.filter((l) => {
    if (filters.city && extractCity(l.address) !== filters.city) return false;
    if (filters.source && l.source.toLowerCase() !== filters.source) return false;
    if (filters.minPrice !== undefined && l.price < filters.minPrice) return false;
    if (filters.maxPrice !== undefined && l.price > filters.maxPrice) return false;
    if (filters.minRooms !== undefined && l.rooms < filters.minRooms) return false;

    if (q) {
      const haystack = `${l.title} ${l.address} ${extractCity(l.address)}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

export function findSimilarListings(
  base: ListingRecord,
  all: ListingRecord[],
  limit = 6,
): ListingRecord[] {
  const city = extractCity(base.address);
  return all
    .filter((l) => l.id !== base.id && extractCity(l.address) === city)
    .map((l) => {
      const priceDelta = Math.abs(l.price - base.price) / Math.max(base.price, 1);
      const surfaceDelta = Math.abs(l.surface - base.surface) / Math.max(base.surface, 1);
      const distKm = Math.hypot((l.lat - base.lat) * 111, (l.lon - base.lon) * 85) || 0;
      const score = priceDelta * 2 + surfaceDelta + distKm * 0.05;
      return { l, score };
    })
    .filter(({ score }) => score < 1.2)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ l }) => l);
}
