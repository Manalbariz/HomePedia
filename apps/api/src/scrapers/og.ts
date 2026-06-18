import * as cheerio from "cheerio";
import type { ComparedListing } from "./types.js";

/**
 * Parses French real estate titles like:
 * "Appartement à louer T2/F2 44 m² 1550 € Georges Brassens Paris (75015)"
 * "Maison à vendre 5 pièces 120 m² 350 000 € Lyon (69001)"
 */
function parseFrenchRealEstateTitle(title: string): Partial<ComparedListing> {
  const result: Partial<ComparedListing> = {};

  // Surface: "44 m²" or "44m2" or "44,5 m²"
  const surfaceMatch = title.match(/(\d+(?:[,.]\d+)?)\s*m[²2]/i);
  if (surfaceMatch) {
    result.surface = parseFloat(surfaceMatch[1].replace(",", "."));
  }

  // Price: "1 550 €" or "350 000€" — French uses spaces as thousands separators
  // Must come before surface regex to avoid catching "44 m²" numbers
  const priceMatch = title.match(/([\d][\d  ]*)\s*€/);
  if (priceMatch) {
    const raw = priceMatch[1].replace(/[\s ]/g, "");
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n > 0) result.price = n;
  }

  // Rooms via T/F notation: T2, F3, T2/F2
  const tfMatch = title.match(/\b[TF](\d)\b/i);
  if (tfMatch) {
    result.rooms = parseInt(tfMatch[1], 10);
  } else {
    // Rooms via "X pièces"
    const piecesMatch = title.match(/(\d+)\s*pièces?/i);
    if (piecesMatch) {
      result.rooms = parseInt(piecesMatch[1], 10);
    }
  }

  // Type
  const lower = title.toLowerCase();
  if (lower.includes("studio")) result.type = "studio";
  else if (lower.includes("appartement")) result.type = "appartement";
  else if (lower.includes("maison") || lower.includes("villa")) result.type = "maison";

  // City + postal code: "Paris (75015)" or "Lyon (69001)"
  const cityMatch = title.match(
    /([A-ZÀ-Ÿa-zà-ÿ-]+(?:[\s-][A-ZÀ-Ÿa-zà-ÿ-]+)*)\s*\((\d{5})\)/
  );
  if (cityMatch) {
    result.city = cityMatch[1].trim();
    result.postalCode = cityMatch[2];
  }

  return result;
}

export function extractOg(html: string): Partial<ComparedListing> {
  const $ = cheerio.load(html);

  function meta(name: string): string | undefined {
    return (
      $(`meta[property="${name}"]`).attr("content") ??
      $(`meta[name="${name}"]`).attr("content")
    );
  }

  const ogTitle = meta("og:title");
  const htmlTitle = $("title").first().text().trim();
  const title = ogTitle ?? (htmlTitle || undefined);
  const description = meta("og:description") ?? meta("description");
  const image = meta("og:image");

  const priceRaw = meta("product:price:amount") ?? meta("og:price:amount");
  const price = priceRaw ? parseFloat(priceRaw) : undefined;

  // Parse structured data from the title itself (SeLoger puts all key data in OG title)
  const fromTitle = title ? parseFrenchRealEstateTitle(title) : {};

  return {
    title: title || undefined,
    description: description || undefined,
    photos: image ? [image] : undefined,
    price: (price && !Number.isNaN(price) ? price : undefined) ?? fromTitle.price,
    surface: fromTitle.surface,
    rooms: fromTitle.rooms,
    type: fromTitle.type,
    city: fromTitle.city,
    postalCode: fromTitle.postalCode,
  };
}
