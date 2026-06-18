import { normalizeRaw } from "./normalize.js";
import type { ComparedListing } from "./types.js";

// ── Generic helpers ────────────────────────────────────────────────────────

type JsonObj = Record<string, unknown>;

function get(obj: unknown, ...paths: string[][]): unknown {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const key of path) {
      if (cur == null || typeof cur !== "object") { cur = undefined; break; }
      cur = (cur as JsonObj)[key];
    }
    if (cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}

/**
 * Recursively searches for the first value matching `key` in the object tree.
 * Limited to `maxDepth` to avoid runaway on huge objects.
 */
function deepFind(obj: unknown, key: string, maxDepth = 6): unknown {
  if (maxDepth === 0 || obj == null || typeof obj !== "object") return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = deepFind(item, key, maxDepth - 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  const record = obj as JsonObj;
  if (key in record && record[key] !== null && record[key] !== undefined) return record[key];
  for (const v of Object.values(record)) {
    const r = deepFind(v, key, maxDepth - 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

function toNum(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function firstPhoto(photos: unknown): string[] | undefined {
  if (!Array.isArray(photos)) return undefined;
  return photos
    .map((p) => {
      if (typeof p === "string") return p;
      if (p && typeof p === "object") {
        const o = p as JsonObj;
        return (o.url ?? o.src ?? o.href ?? o.path ?? o.large ?? o.medium) as string | undefined;
      }
      return undefined;
    })
    .filter((p): p is string => typeof p === "string" && p.startsWith("http"));
}

// ── SeLoger ────────────────────────────────────────────────────────────────

function extractSeloger(data: JsonObj): Partial<ComparedListing> {
  const listing = get(
    data,
    ["props", "pageProps", "listingData", "listing"],
    ["props", "pageProps", "ad"],
    ["props", "pageProps", "listing"],
    ["props", "pageProps", "property"],
  ) as JsonObj | undefined;

  if (!listing) return {};

  // SeLoger nests characteristics in multiple possible locations
  const chars = (listing.characteristics ?? listing.features ?? listing.details ?? {}) as JsonObj;
  const prices = (listing.prices ?? {}) as JsonObj;
  const loc = (listing.location ?? listing.perimeter ?? listing.address ?? {}) as JsonObj;

  const price =
    toNum(prices.displayedPrice) ??
    toNum(prices.pricePerMonth) ??
    toNum(listing.price) ??
    toNum(listing.pricePerMonth) ??
    toNum(deepFind(listing, "displayedPrice")) ??
    toNum(deepFind(listing, "pricePerMonth")) ??
    toNum(deepFind(listing, "price"));

  const surface =
    toNum(chars.surface) ??
    toNum(chars.area) ??
    toNum(listing.surface) ??
    toNum(deepFind(listing, "surface"));

  const rooms =
    toNum(chars.roomsQuantity) ??
    toNum(chars.nbRooms) ??
    toNum(chars.rooms) ??
    toNum(listing.rooms) ??
    toNum(deepFind(listing, "roomsQuantity")) ??
    toNum(deepFind(listing, "nbRooms"));

  return normalizeRaw({
    title: listing.title ?? listing.publicationTitle,
    price,
    surface,
    rooms,
    bedrooms: toNum(chars.bedroomsQuantity ?? chars.nbBedrooms ?? chars.bedrooms ?? listing.bedrooms),
    address: loc.address ?? loc.fullAddress ?? loc.completeAddress,
    city: loc.city ?? loc.cityLabel ?? loc.locality,
    postalCode: loc.postalCode ?? loc.zipCode,
    lat: toNum(loc.lat ?? loc.latitude),
    lon: toNum(loc.lng ?? loc.lon ?? loc.longitude),
    floor: chars.floor ?? chars.floorNumber ?? chars.etage ?? listing.floor,
    elevator: chars.elevator ?? chars.hasElevator,
    parking: chars.parking ?? chars.hasParking,
    cellar: chars.cellar ?? chars.hasCellar,
    balcony: chars.balcony ?? chars.hasBalcony,
    terrace: chars.terrace ?? chars.hasTerrace,
    furnished: chars.isFurnished ?? chars.furnished ?? listing.isFurnished,
    dpe: chars.energyClassification ?? chars.dpe,
    ges: chars.gasEmission ?? chars.ges,
    charges: toNum(chars.charges ?? listing.charges),
    deposit: toNum(chars.depositAmount ?? listing.deposit),
    description: listing.description,
    type: listing.propertyType ?? listing.estateType ?? listing.type,
    photos: firstPhoto(listing.photos ?? listing.images),
  });
}

// ── LeBonCoin ─────────────────────────────────────────────────────────────

function extractLeboncoin(data: JsonObj): Partial<ComparedListing> {
  const ad = get(
    data,
    ["props", "pageProps", "ad"],
    ["props", "pageProps", "adData"],
    ["props", "pageProps", "initialProps", "ad"],
  ) as JsonObj | undefined;

  if (!ad) return {};

  // LeBonCoin stores characteristics as an array of { key, value } objects
  const attrs: JsonObj = {};
  if (Array.isArray(ad.attributes)) {
    for (const a of ad.attributes as JsonObj[]) {
      if (typeof a.key === "string") {
        attrs[a.key] = a.value ?? (Array.isArray(a.values) ? a.values[0] : undefined);
      }
    }
  }

  const loc = (ad.location ?? {}) as JsonObj;

  // Price is often an array like [1200] or a number
  const rawPrice = Array.isArray(ad.price) ? ad.price[0] : ad.price;
  const priceCents = Array.isArray(ad.price_cents) ? ad.price_cents[0] : undefined;

  return normalizeRaw({
    title: ad.subject ?? ad.title,
    price: toNum(rawPrice) ?? (priceCents != null ? (priceCents as number) / 100 : undefined),
    surface: toNum(attrs.square ?? attrs.surface_habitable ?? attrs.surface),
    rooms: toNum(attrs.rooms ?? attrs.nb_rooms),
    bedrooms: toNum(attrs.rooms_count ?? attrs.nb_bedrooms),
    address: loc.address ?? loc.city_label,
    city: loc.city,
    postalCode: loc.zipcode,
    lat: toNum(loc.lat ?? loc.latitude),
    lon: toNum(loc.lng ?? loc.longitude),
    furnished: attrs.furnished === "1" || attrs.furnished === "true" || attrs.furnished === true,
    dpe: attrs.energy_rate,
    ges: attrs.ges,
    charges: toNum(attrs.monthly_charges),
    deposit: toNum(attrs.security_deposit),
    description: ad.body ?? ad.description,
    type: attrs.real_estate_type ?? attrs.property_type ?? ad.category_name,
    photos: (() => {
      const imgs = ad.images as JsonObj | undefined;
      const large = imgs?.urls_large ?? imgs?.urls ?? imgs?.thumb_url;
      return Array.isArray(large) ? (large as string[]) : undefined;
    })(),
  });
}

// ── BienIci ───────────────────────────────────────────────────────────────

function extractBienici(data: JsonObj): Partial<ComparedListing> {
  const listing = get(
    data,
    ["props", "pageProps", "propertyAd"],
    ["props", "pageProps", "ad"],
    ["props", "pageProps", "listing"],
  ) as JsonObj | undefined;

  if (!listing) return {};

  const coords = (listing.coordinates ?? listing.position ?? {}) as JsonObj;

  return normalizeRaw({
    title: listing.title ?? listing.propertyTitle,
    price: toNum(listing.price ?? listing.monthlyPrice),
    surface: toNum(listing.surfaceArea ?? listing.surface),
    rooms: toNum(listing.roomsCount ?? listing.rooms),
    bedrooms: toNum(listing.bedroomsCount ?? listing.bedrooms),
    address: listing.address ?? listing.streetAddress,
    city: listing.city,
    postalCode: listing.postalCode,
    lat: listing.blurInfo ? undefined : toNum(coords.lat ?? listing.lat),
    lon: listing.blurInfo ? undefined : toNum(coords.lon ?? coords.lng ?? listing.lon),
    floor: listing.floor,
    elevator: listing.hasElevator ?? listing.elevator,
    parking: listing.hasParkingLot ?? listing.parking,
    cellar: listing.hasCellar ?? listing.cellar,
    balcony: listing.hasBalcony ?? listing.balcony,
    terrace: listing.hasTerrace ?? listing.terrace,
    furnished: listing.isFurnished ?? listing.furnished,
    dpe: listing.energyClassification ?? listing.dpe,
    ges: listing.gasEmission ?? listing.ges,
    charges: toNum(listing.monthlyCharges ?? listing.charges),
    deposit: toNum(listing.deposit),
    description: listing.description,
    type: listing.propertyType ?? listing.type,
    photos: firstPhoto(listing.photos ?? listing.images),
  });
}

// ── Generic ────────────────────────────────────────────────────────────────

function extractGeneric(data: JsonObj): Partial<ComparedListing> {
  const listing = get(
    data,
    ["props", "pageProps", "listing"],
    ["props", "pageProps", "ad"],
    ["props", "pageProps", "property"],
    ["props", "pageProps", "announcement"],
    ["props", "pageProps", "offer"],
  ) as JsonObj | undefined;

  if (!listing) return {};
  return normalizeRaw(listing);
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Preferred: works directly on the parsed window.__NEXT_DATA__ object */
export function extractNextDataObject(
  data: JsonObj,
  hostname: string
): Partial<ComparedListing> {
  if (hostname.includes("seloger")) return extractSeloger(data);
  if (hostname.includes("leboncoin")) return extractLeboncoin(data);
  if (hostname.includes("bienici")) return extractBienici(data);
  return extractGeneric(data);
}
