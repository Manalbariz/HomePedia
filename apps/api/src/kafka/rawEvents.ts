import type { ComparedListing } from "../scrapers/types.js";

export type RawListingSource = "scrape" | "batch" | "manual";

export interface ListingRawEvent {
  event: "listing.raw";
  timestamp: string;
  source: RawListingSource;
  payload: ComparedListing;
}

export function buildRawListingEvent(
  payload: ComparedListing,
  source: RawListingSource = "scrape",
): ListingRawEvent {
  return {
    event: "listing.raw",
    timestamp: new Date().toISOString(),
    source,
    payload,
  };
}
