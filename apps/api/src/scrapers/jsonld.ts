import * as cheerio from "cheerio";
import { normalizeRaw } from "./normalize.js";
import type { ComparedListing } from "./types.js";

export function extractJsonLd(html: string): Partial<ComparedListing> {
  const $ = cheerio.load(html);
  const results: Partial<ComparedListing>[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items as Record<string, unknown>[]) {
      const type = item["@type"];
      if (
        type === "RealEstateListing" ||
        type === "Apartment" ||
        type === "House" ||
        type === "Product" ||
        type === "Offer"
      ) {
        const offer = (item.offers ?? item) as Record<string, unknown>;
        const geo = (item.geo ?? {}) as Record<string, unknown>;
        const address = (item.address ?? {}) as Record<string, unknown>;

        results.push(
          normalizeRaw({
            title: item.name ?? item.headline,
            price: offer.price ?? offer.lowPrice,
            description: item.description,
            address:
              address.streetAddress ??
              `${address.streetAddress ?? ""} ${address.addressLocality ?? ""}`.trim(),
            city: address.addressLocality,
            postalCode: address.postalCode,
            lat: geo.latitude,
            lon: geo.longitude,
            surface: item.floorSize
              ? ((item.floorSize as Record<string, unknown>).value ?? item.floorSize)
              : undefined,
            rooms: item.numberOfRooms,
            bedrooms: item.numberOfBedrooms,
            photos: Array.isArray(item.image)
              ? (item.image as string[]).filter((i) => typeof i === "string")
              : typeof item.image === "string"
                ? [item.image]
                : undefined,
          })
        );
      }
    }
  });

  // Merge all found LD+JSON blocks (take first non-undefined value per field)
  return results.reduce<Partial<ComparedListing>>((acc, cur) => {
    for (const [k, v] of Object.entries(cur)) {
      const key = k as keyof ComparedListing;
      if (v !== undefined && (acc as Record<string, unknown>)[key] === undefined) {
        (acc as Record<string, unknown>)[key] = v;
      }
    }
    return acc;
  }, {});
}
