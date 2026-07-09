import { describe, expect, it } from "vitest";
import {
  extractCity,
  filterListings,
  findSimilarListings,
  parseListingFilters,
} from "./filters.js";
import type { ListingRecord } from "./types.js";

const parisA: ListingRecord = {
  id: "a",
  title: "Paris A",
  address: "75008 · Champs-Élysées, Paris",
  price: 2000,
  rooms: 2,
  surface: 50,
  floor: "3e",
  tags: [],
  score: 80,
  imageUrl: "https://example.com/a.jpg",
  lat: 48.87,
  lon: 2.31,
  source: "seloger",
  url: "https://example.com/a",
};

const parisB: ListingRecord = {
  ...parisA,
  id: "b",
  title: "Paris B",
  price: 2100,
  surface: 52,
  lat: 48.86,
  lon: 2.32,
};

const lyon: ListingRecord = {
  ...parisA,
  id: "c",
  title: "Lyon",
  address: "69001 · Lyon",
  price: 1200,
  lat: 45.76,
  lon: 4.84,
};

describe("extractCity", () => {
  it("détecte Paris dans une adresse", () => {
    expect(extractCity("75008 · Champs-Élysées, Paris")).toBe("paris");
  });

  it("détecte Bordeaux et Mérignac", () => {
    expect(extractCity("33700 · Mérignac")).toBe("bordeaux");
  });
});

describe("parseListingFilters", () => {
  it("normalise city et source en minuscules", () => {
    expect(parseListingFilters({ city: " Paris ", source: "SeLoger" })).toEqual({
      city: "paris",
      source: "seloger",
    });
  });

  it("ignore les valeurs vides et non numériques", () => {
    expect(parseListingFilters({ q: "  ", minPrice: "abc" })).toEqual({});
  });
});

describe("filterListings", () => {
  const all = [parisA, parisB, lyon];

  it("filtre par ville", () => {
    expect(filterListings(all, { city: "paris" })).toHaveLength(2);
  });

  it("filtre par fourchette de prix", () => {
    expect(filterListings(all, { minPrice: 2000, maxPrice: 2100 })).toEqual([parisA, parisB]);
  });

  it("filtre par recherche texte", () => {
    expect(filterListings(all, { q: "lyon" })).toEqual([lyon]);
  });
});

describe("findSimilarListings", () => {
  it("retourne des annonces de la même ville, hors base", () => {
    const similar = findSimilarListings(parisA, [parisA, parisB, lyon]);
    expect(similar.map((l) => l.id)).toEqual(["b"]);
  });
});
