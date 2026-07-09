import { describe, expect, it } from "vitest";
import { countActiveFilters, filtersToSearchParams } from "./filters";

describe("filtersToSearchParams", () => {
  it("construit une query string alignée avec l'API", () => {
    const qs = filtersToSearchParams({
      q: " loft ",
      city: "Paris",
      source: "seloger",
      minPrice: 1000,
      maxPrice: 0,
      minRooms: 2,
    });
    expect(qs).toBe("q=loft&city=paris&source=seloger&minPrice=1000&minRooms=2");
  });

  it("retourne une chaîne vide sans filtres actifs", () => {
    expect(filtersToSearchParams({})).toBe("");
  });
});

describe("countActiveFilters", () => {
  it("compte les filtres non vides", () => {
    expect(
      countActiveFilters({
        q: "test",
        city: "lyon",
        minPrice: 500,
        maxPrice: 0,
      }),
    ).toBe(3);
  });
});
