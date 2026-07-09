export interface ListingCrawlEvent {
  event: "listing.url";
  timestamp: string;
  searchUrl: string;
  listingUrl: string;
}

export function buildCrawlUrlEvent(
  searchUrl: string,
  listingUrl: string,
): ListingCrawlEvent {
  return {
    event: "listing.url",
    timestamp: new Date().toISOString(),
    searchUrl,
    listingUrl,
  };
}
