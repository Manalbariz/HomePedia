export type ListingSource = "seloger" | "leboncoin" | "bienici" | "example";

export interface Listing {
  id: string;
  title: string;
  address: string;
  price: number;
  rooms: number;
  surface: number;
  floor: string;
  tags: string[];
  score: number;
  imageUrl: string;
  /** Position normalisée 0–100 sur la carte placeholder */
  mapX: number;
  mapY: number;
  source: ListingSource;
  url: string;
}

export type AppView = "hero" | "map" | "match" | "chat";
