import { describe, expect, it } from "vitest";
import { toListingRecord, toListingRecordOrNull } from "./toListingRecord.js";
import type { ComparedListing } from "../scrapers/types.js";

const baseRaw: ComparedListing = {
  url: "https://www.seloger.com/annonces/123",
  source: "seloger",
  scrapedAt: "2026-01-01T00:00:00Z",
  title: "T3 lumineux",
  price: 1200,
  rooms: 3,
  surface: 65,
  city: "Lyon",
  postalCode: "69003",
  lat: 45.75,
  lon: 4.85,
  floor: "3e ét.",
  furnished: true,
  balcony: true,
  dpe: "C",
  photos: ["https://cdn.example.com/photo1.jpg"],
};

describe("toListingRecord", () => {
  it("mappe ComparedListing vers ListingRecord", () => {
    const listing = toListingRecord(baseRaw);
    expect(listing.title).toBe("T3 lumineux");
    expect(listing.price).toBe(1200);
    expect(listing.rooms).toBe(3);
    expect(listing.surface).toBe(65);
    expect(listing.source).toBe("seloger");
    expect(listing.lat).toBe(45.75);
    expect(listing.imageUrl).toBe("https://cdn.example.com/photo1.jpg");
    expect(listing.tags).toContain("Meublé");
    expect(listing.tags).toContain("Balcon");
    expect(listing.tags).toContain("DPE C");
    expect(listing.id).toHaveLength(16);
  });

  it("utilise un id stable dérivé de l'URL", () => {
    const a = toListingRecord(baseRaw);
    const b = toListingRecord(baseRaw);
    expect(a.id).toBe(b.id);
  });

  it("lève si lat/lon manquants et ville inconnue", () => {
    expect(() =>
      toListingRecord({
        ...baseRaw,
        lat: undefined,
        lon: undefined,
        city: "VilleInconnueXYZ",
        postalCode: undefined,
      }),
    ).toThrow(/Coordonnées/);
  });

  it("toListingRecordOrNull retourne null si invalide", () => {
    expect(toListingRecordOrNull({ ...baseRaw, price: undefined })).toBeNull();
  });

  it("géocode via ville si lat/lon absents", () => {
    const listing = toListingRecord({
      ...baseRaw,
      lat: undefined,
      lon: undefined,
      city: "Lyon",
    });
    expect(listing.lat).toBeCloseTo(45.76, 1);
    expect(listing.lon).toBeCloseTo(4.84, 1);
  });
});
