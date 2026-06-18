import type { ComparedListing } from "./types.js";

const DPE_VALUES = ["A", "B", "C", "D", "E", "F", "G"] as const;
type DpeGrade = (typeof DPE_VALUES)[number];

function toDpe(raw: unknown): DpeGrade | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toUpperCase();
  return (DPE_VALUES as readonly string[]).includes(v)
    ? (v as DpeGrade)
    : undefined;
}

function toNumber(raw: unknown): number | undefined {
  if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/[^\d,.-]/g, "").replace(",", "."));
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function detectType(
  raw: unknown
): ComparedListing["type"] {
  if (typeof raw !== "string") return undefined;
  const v = raw.toLowerCase();
  if (v.includes("studio")) return "studio";
  if (v.includes("appartement") || v.includes("apartment")) return "appartement";
  if (v.includes("maison") || v.includes("house") || v.includes("villa")) return "maison";
  return "autre";
}

export function mergeListing(
  base: Partial<ComparedListing>,
  patch: Partial<ComparedListing>
): Partial<ComparedListing> {
  const merged: Partial<ComparedListing> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const key = k as keyof ComparedListing;
    if (v !== undefined && v !== null && (merged as Record<string, unknown>)[key] === undefined) {
      (merged as Record<string, unknown>)[key] = v;
    }
  }
  return merged;
}

export function normalizeRaw(raw: Record<string, unknown>): Partial<ComparedListing> {
  return {
    title: typeof raw.title === "string" ? raw.title.trim() : undefined,
    type: detectType(raw.type ?? raw.propertyType ?? raw.bien_type),
    price: toNumber(raw.price ?? raw.prix ?? raw.loyer),
    surface: toNumber(raw.surface ?? raw.area ?? raw.superficie),
    rooms: toNumber(raw.rooms ?? raw.pieces ?? raw.nb_pieces ?? raw.roomCount),
    bedrooms: toNumber(raw.bedrooms ?? raw.chambres ?? raw.nb_chambres),
    address: typeof raw.address === "string" ? raw.address.trim() : undefined,
    city: typeof raw.city === "string" ? raw.city.trim() : undefined,
    postalCode: typeof raw.postalCode === "string" ? raw.postalCode.trim() : undefined,
    lat: toNumber(raw.lat ?? raw.latitude),
    lon: toNumber(raw.lon ?? raw.lon ?? raw.longitude),
    floor: typeof raw.floor === "string" ? raw.floor.trim() : undefined,
    elevator: typeof raw.elevator === "boolean" ? raw.elevator : undefined,
    parking: typeof raw.parking === "boolean" ? raw.parking : undefined,
    cellar: typeof raw.cellar === "boolean" ? raw.cellar : undefined,
    balcony: typeof raw.balcony === "boolean" ? raw.balcony : undefined,
    terrace: typeof raw.terrace === "boolean" ? raw.terrace : undefined,
    furnished: typeof raw.furnished === "boolean" ? raw.furnished : undefined,
    dpe: toDpe(raw.dpe ?? raw.energyClassification),
    ges: toDpe(raw.ges ?? raw.gasEmission),
    charges: toNumber(raw.charges),
    deposit: toNumber(raw.deposit ?? raw.depotGarantie),
    fees: toNumber(raw.fees ?? raw.honoraires),
    photos: Array.isArray(raw.photos) ? (raw.photos as string[]).filter((p) => typeof p === "string") : undefined,
    description: typeof raw.description === "string" ? raw.description.trim() : undefined,
  };
}
