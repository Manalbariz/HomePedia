import { createHash, randomUUID } from "node:crypto";
import type { ComparedListing } from "../scrapers/types.js";
import type { ListingRecord } from "../types.js";
import { applyGeocodeFallback } from "./geocode.js";

const KNOWN_SOURCES = ["seloger", "leboncoin", "bienici", "example"] as const;

function normalizeSource(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("seloger")) return "seloger";
  if (lower.includes("leboncoin") || lower.includes("lbc")) return "leboncoin";
  if (lower.includes("bienici") || lower.includes("bien'ici")) return "bienici";
  if (KNOWN_SOURCES.includes(lower as (typeof KNOWN_SOURCES)[number])) return lower;
  return lower.replace(/[^a-z0-9]/g, "").slice(0, 32) || "unknown";
}

function buildAddress(raw: ComparedListing): string {
  if (raw.address?.trim()) return raw.address.trim();
  const parts = [raw.postalCode, raw.city].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Adresse non renseignée";
}

function deriveTags(raw: ComparedListing): string[] {
  const tags: string[] = [];
  if (raw.furnished) tags.push("Meublé");
  if (raw.balcony) tags.push("Balcon");
  if (raw.terrace) tags.push("Terrasse");
  if (raw.parking) tags.push("Parking");
  if (raw.elevator) tags.push("Ascenseur");
  if (raw.dpe) tags.push(`DPE ${raw.dpe}`);
  return tags;
}

function stableIdFromUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

export interface ToListingRecordOptions {
  /** Si absent, dérivé de l'URL (stable pour upsert). */
  id?: string;
  defaultScore?: number;
}

/**
 * Transforme une annonce scrapée (ComparedListing) en ListingRecord API.
 * Lève une erreur si les champs obligatoires manquent.
 */
export function toListingRecord(
  raw: ComparedListing,
  options: ToListingRecordOptions = {},
): ListingRecord {
  const enriched = applyGeocodeFallback(raw);
  const price = enriched.price;
  const rooms = enriched.rooms ?? enriched.bedrooms;
  const surface = enriched.surface;
  const lat = enriched.lat;
  const lon = enriched.lon;

  if (price === undefined || price <= 0) {
    throw new Error("Prix manquant ou invalide");
  }
  if (rooms === undefined || rooms <= 0) {
    throw new Error("Nombre de pièces manquant ou invalide");
  }
  if (surface === undefined || surface <= 0) {
    throw new Error("Surface manquante ou invalide");
  }
  if (lat === undefined || lon === undefined) {
    throw new Error("Coordonnées lat/lon manquantes — géocodage requis");
  }

  const title = enriched.title?.trim() || "Annonce sans titre";
  const source = normalizeSource(enriched.source || enriched.url);
  const id = options.id ?? stableIdFromUrl(enriched.url);

  return {
    id,
    title,
    address: buildAddress(enriched),
    price,
    rooms,
    surface,
    floor: enriched.floor?.trim() || "—",
    tags: deriveTags(enriched),
    score: options.defaultScore ?? 75,
    imageUrl: enriched.photos?.[0] ?? `https://picsum.photos/seed/${id}/800/600`,
    lat,
    lon,
    source,
    url: enriched.url,
  };
}

/** Variante tolérante : génère un UUID si pas d'URL stable. */
export function toListingRecordOrNull(
  raw: ComparedListing,
  options?: ToListingRecordOptions,
): ListingRecord | null {
  try {
    return toListingRecord(raw, options);
  } catch {
    return null;
  }
}

export function newListingId(): string {
  return randomUUID();
}
