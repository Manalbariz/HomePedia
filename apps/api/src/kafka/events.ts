import type { ListingRecord } from "../types.js";

export type ListingEventType = "listings.bootstrapped" | "listing.created";

export interface ListingEventBase {
  event: ListingEventType;
  timestamp: string;
  source: "homepedia-api";
}

export interface ListingsBootstrappedEvent extends ListingEventBase {
  event: "listings.bootstrapped";
  count: number;
}

export interface ListingCreatedEvent extends ListingEventBase {
  event: "listing.created";
  listing: ListingRecord;
}

export type ListingEvent = ListingsBootstrappedEvent | ListingCreatedEvent;

export function buildBootstrappedEvent(count: number): ListingsBootstrappedEvent {
  return {
    event: "listings.bootstrapped",
    timestamp: new Date().toISOString(),
    source: "homepedia-api",
    count,
  };
}

export function buildCreatedEvent(listing: ListingRecord): ListingCreatedEvent {
  return {
    event: "listing.created",
    timestamp: new Date().toISOString(),
    source: "homepedia-api",
    listing,
  };
}
