import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { ComparedListing } from "./types.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normalize non-breaking spaces, thin spaces, etc. */
function norm(text: string): string {
  return text.replace(/[           ]/g, " ");
}

/** Parse a French-formatted number like "1 150" or "76,23" */
function parseFrNum(text: string): number | undefined {
  const cleaned = text.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? undefined : n;
}

/** Extract the first number from a price string like "1 150 €" → 1150 */
function extractNum(text: string): number | undefined {
  const t = norm(text);
  const m = t.match(/([\d][\d ]*(?:[,.][\d]+)?)/);
  if (!m) return undefined;
  return parseFrNum(m[1].trim());
}

function toDpe(s: string): ComparedListing["dpe"] | undefined {
  const v = s.trim().toUpperCase()[0];
  return v && "ABCDEFG".includes(v) ? (v as ComparedListing["dpe"]) : undefined;
}

// ── BienIci ────────────────────────────────────────────────────────────────

/**
 * BienIci is a Vue.js SPA — __NEXT_DATA__ is always empty.
 * Data lives in the rendered HTML:
 *
 *  Prix          → span.ad-price__the-price
 *  Charges       → .ad-price__fees-infos
 *  Surface/Pièces/Chambres/Étage/Meublé
 *                → .allDetails .labelInfo span  (text pattern matching)
 *  Dépôt         → .allDetails .labelInfo span  (contains "dépôt de garantie")
 *  DPE           → .dpe .dpe-line.active .dpe-line__classification
 *  GES           → .ges .ges-line.active .ges-line__classification span
 *  Amenities     → presence in .allDetails labels or parsed from description
 *  Prix/m²       → calculated (not in DOM)
 */
function extractBieniciHtml($: CheerioAPI): Partial<ComparedListing> {
  // ── Prix ────────────────────────────────────────────────────────────────
  const price = extractNum($("span.ad-price__the-price").first().text());

  // ── Charges (from header badge) ─────────────────────────────────────────
  let charges: number | undefined;
  const feesText = norm($(".ad-price__fees-infos").first().text());
  // "Dont 50 € par mois de charges"
  const feesM = feesText.match(/([\d][\d ]*)\s*€/);
  if (feesM) charges = parseFrNum(feesM[1].trim());

  // ── Title + Address ─────────────────────────────────────────────────────
  const h1 = $("h1").first();
  const rawAddress = norm(h1.find(".fullAddress").text().trim());
  const title = norm(h1.clone().find(".fullAddress").remove().end().text().trim()) || undefined;

  // "31000 Toulouse (Saint-Georges)" → postalCode + city
  let city: string | undefined;
  let postalCode: string | undefined;
  const addrM = rawAddress.match(/^(\d{5})\s+(.+?)(?:\s*\(.*\))?$/);
  if (addrM) {
    postalCode = addrM[1];
    city = addrM[2].trim();
  }

  // ── Scan all .allDetails .labelInfo text nodes ───────────────────────────
  let surface: number | undefined;
  let rooms: number | undefined;
  let bedrooms: number | undefined;
  let floor: string | undefined;
  let furnished: boolean | undefined;
  let deposit: number | undefined;
  let elevator: boolean | undefined;
  let parking: boolean | undefined;
  let cellar: boolean | undefined;
  let balcony: boolean | undefined;
  let terrace: boolean | undefined;

  $(".allDetails .labelInfo").each((_, el) => {
    const text = norm($(el).text().trim());
    if (!text) return;
    const lower = text.toLowerCase();

    // Surface: "76,23 m²"
    if (!surface) {
      const m = text.match(/(\d+[,.]?\d*)\s*m²/i);
      if (m) surface = parseFrNum(m[1]);
    }

    // Pièces: "3 pièces"
    if (!rooms) {
      const m = text.match(/(\d+)\s*pièces?/i);
      if (m) rooms = parseInt(m[1]);
    }

    // Chambres: "1 chambre"
    if (!bedrooms) {
      const m = text.match(/(\d+)\s*chambres?/i);
      if (m) bedrooms = parseInt(m[1]);
    }

    // Étage: "1er étage" | "2ème étage" | "rez-de-chaussée"
    if (!floor) {
      const m = text.match(/\b(\d+(?:er|ème|e)?)\s*étage\b|rez-de-chaussée/i);
      if (m) floor = m[0].trim();
    }

    // Meublé / Non meublé
    if (furnished === undefined) {
      if (lower === "meublé") furnished = true;
      else if (lower === "non meublé") furnished = false;
    }

    // Charges in labelInfo: "50 € par mois de charges (inclus dans le loyer)"
    if (!charges) {
      const m = text.match(/([\d][\d ]*)\s*€\s*par mois de charges/i);
      if (m) charges = parseFrNum(m[1].trim());
    }

    // Dépôt de garantie: "2 200 € de dépôt de garantie"
    if (!deposit) {
      const m = text.match(/([\d][\d ]*)\s*€\s*de dépôt de garantie/i);
      if (m) deposit = parseFrNum(m[1].replace(/ /g, ""));
    }

    // Boolean amenities explicitly listed as label
    if (lower === "ascenseur") elevator = true;
    if (lower === "parking" || lower.startsWith("parking ") || lower === "garage") parking = true;
    if (lower === "cave") cellar = true;
    if (lower === "balcon") balcony = true;
    if (lower === "terrasse") terrace = true;
  });

  // ── DPE ─────────────────────────────────────────────────────────────────
  // .dpe-line.active holds the active grade; its .dpe-line__classification text is e.g. "C"
  const dpeRaw = norm($(".dpe .dpe-line.active .dpe-line__classification").first().text());
  const dpe = toDpe(dpeRaw);

  // ── GES ─────────────────────────────────────────────────────────────────
  const gesRaw = norm($(".ges .ges-line.active .ges-line__classification span").first().text());
  const ges = toDpe(gesRaw);

  // ── Description (fallback for boolean amenities) ─────────────────────────
  // The section has class "description vue-description"; content is in .see-more-description__content
  const description = norm(
    $("section.description .see-more-description__content").first().text().trim()
  ) || undefined;

  if (description) {
    const dl = description.toLowerCase();
    if (elevator === undefined) {
      if (dl.includes("sans ascenseur")) elevator = false;
      else if (dl.includes("ascenseur")) elevator = true;
    }
    if (parking === undefined && (dl.includes("parking") || dl.includes("garage"))) parking = true;
    if (cellar === undefined && dl.includes("cave")) cellar = true;
    if (balcony === undefined && dl.includes("balcon")) balcony = true;
    if (terrace === undefined && dl.includes("terrasse")) terrace = true;
    if (furnished === undefined) {
      if (dl.includes("non meublé")) furnished = false;
      else if (dl.includes("meublé")) furnished = true;
    }
  }

  // ── Photos ───────────────────────────────────────────────────────────────
  const photos: string[] = [];
  $(".slideImg img[u='image']").each((_, el) => {
    const src = $(el).attr("src");
    if (src?.startsWith("http") && !photos.includes(src)) photos.push(src);
  });

  // ── Property type (from title) ───────────────────────────────────────────
  let type: ComparedListing["type"] | undefined;
  const titleLower = (title ?? "").toLowerCase();
  if (titleLower.includes("studio")) type = "studio";
  else if (titleLower.includes("appartement")) type = "appartement";
  else if (titleLower.includes("maison") || titleLower.includes("villa")) type = "maison";

  return {
    title,
    type,
    price,
    charges,
    surface,
    rooms,
    bedrooms,
    floor,
    furnished,
    deposit,
    dpe,
    ges,
    elevator,
    parking,
    cellar,
    balcony,
    terrace,
    description,
    address: rawAddress || undefined,
    city,
    postalCode,
    photos: photos.length > 0 ? photos : undefined,
  };
}

// ── Figaro Immobilier ──────────────────────────────────────────────────────

/**
 * Figaro Immobilier is a Nuxt 3 SSR app.
 * All listing data is in:
 *   <script id="__NUXT_DATA__" type="application/json">
 *
 * The payload is a flat JSON array where:
 *   - Numbers inside objects/arrays are index references into the same array
 *   - Two-element arrays ["ShallowReactive" | "Reactive" | …, N] are reactive
 *     wrappers that must be unwrapped (follow index N)
 *
 * Navigation: flat[0] → ShallowReactive → flat[1].data →
 *             ShallowReactive → flat[N].classifiedDetailResponse →
 *             flat[M].classified → the classified object
 *
 * Key fields (after resolution):
 *   price            → prix
 *   area             → surface
 *   roomCount[0]     → pièces
 *   bedRoomCount     → chambres
 *   priceData.m2Price   → prix/m²
 *   priceData.fees      → charges mensuelles
 *   priceData.guarantee → dépôt de garantie
 *   dpe.energyCategory  → DPE
 *   dpe.gesCategory     → GES
 *   isFurnished         → meublé
 *   options[]           → ["balcon","terrasse","ascenseur","parking","cave",…]
 *   location            → city / postalCode / lat / lon
 *   images.photos[].url["large"] → photos
 *   descriptionFull     → description (+ floor parsing)
 */

const NUXT_REACTIVE = new Set(["ShallowReactive", "Reactive", "ShallowRef", "Ref", "readonly"]);

function resolveNuxt(flat: unknown[], idx: number, depth = 0): unknown {
  if (depth > 30 || idx < 0 || idx >= flat.length) return undefined;
  const item = flat[idx];
  if (item === null || typeof item !== "object") return item;

  // Reactive wrapper: ["ShallowReactive", refIdx]
  if (
    Array.isArray(item) &&
    item.length === 2 &&
    typeof item[0] === "string" &&
    NUXT_REACTIVE.has(item[0])
  ) {
    const ref = item[1];
    return typeof ref === "number" ? resolveNuxt(flat, ref, depth + 1) : ref;
  }

  if (Array.isArray(item)) {
    return item.map((v) => (typeof v === "number" ? resolveNuxt(flat, v, depth + 1) : v));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
    out[k] = typeof v === "number" ? resolveNuxt(flat, v, depth + 1) : v;
  }
  return out;
}

/** Find the classified entry: the first dict in the flat array that has price+area+dpe keys */
function findFigaroClassified(flat: unknown[]): Record<string, unknown> | null {
  for (let i = 0; i < flat.length; i++) {
    const item = flat[i];
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const keys = Object.keys(item as object);
      if (keys.includes("price") && keys.includes("area") && keys.includes("dpe")) {
        return resolveNuxt(flat, i) as Record<string, unknown>;
      }
    }
  }
  return null;
}

function extractFigaroHtml($: CheerioAPI): Partial<ComparedListing> {
  const scriptText = $("#__NUXT_DATA__").text().trim();
  if (!scriptText) return {};

  let flat: unknown[];
  try {
    flat = JSON.parse(scriptText) as unknown[];
    if (!Array.isArray(flat)) return {};
  } catch {
    return {};
  }

  const c = findFigaroClassified(flat);
  if (!c) return {};

  // ── Core fields ───────────────────────────────────────────────────────────
  const price    = typeof c.price === "number" ? c.price : extractNum(String(c.priceLabel ?? ""));
  const surface  = typeof c.area  === "number" ? c.area  : undefined;

  // roomCount is a resolved array [3] — take first element
  const roomArr  = Array.isArray(c.roomCount) ? c.roomCount : [];
  const rooms    = typeof roomArr[0] === "number" ? roomArr[0] : undefined;
  const bedrooms = typeof c.bedRoomCount === "number" ? c.bedRoomCount : undefined;

  // ── Price data ────────────────────────────────────────────────────────────
  const pd       = (c.priceData ?? {}) as Record<string, unknown>;
  const charges  = typeof pd.fees      === "number" ? pd.fees      : undefined;
  const deposit  = typeof pd.guarantee === "number" ? pd.guarantee : undefined;

  // ── DPE / GES ─────────────────────────────────────────────────────────────
  const dpeObj   = (c.dpe ?? {}) as Record<string, unknown>;
  const dpe      = toDpe(String(dpeObj.energyCategory ?? ""));
  const ges      = toDpe(String(dpeObj.gesCategory    ?? ""));

  // ── Meublé ────────────────────────────────────────────────────────────────
  const furnished = typeof c.isFurnished === "boolean" ? c.isFurnished : undefined;

  // ── Options (boolean amenities) ───────────────────────────────────────────
  // Values are French strings: "balcon", "terrasse", "ascenseur", "parking", "cave", "garage"
  const opts = (Array.isArray(c.options) ? c.options : []) as string[];
  const optSet   = new Set(opts.map((o) => String(o).toLowerCase()));
  const balcony  = optSet.has("balcon")    ? true : undefined;
  const terrace  = optSet.has("terrasse")  ? true : undefined;
  const elevator = optSet.has("ascenseur") ? true : undefined;
  const parking  = optSet.has("parking") || optSet.has("garage") ? true : undefined;
  const cellar   = optSet.has("cave")      ? true : undefined;

  // ── Description ───────────────────────────────────────────────────────────
  const description = String(c.descriptionFull ?? c.description ?? "").trim() || undefined;

  // ── Floor — not a structured field; parse from description ─────────────
  let floor: string | undefined;
  if (description) {
    const dl = description.toLowerCase();
    const fm = dl.match(/\b(\d+(?:er|ème|e)?)\s*étage\b|rez[- ]de[- ]chaussée/i);
    if (fm) floor = fm[0].trim();

    // Elevator fallback: if not in options, check description
    if (elevator === undefined) {
      if (dl.includes("sans ascenseur")) (elevator as unknown as boolean) === false;
      // can't re-assign const — handle below
    }
  }

  // Elevator from description (fallback when absent from options)
  let elevatorFinal = elevator;
  if (elevatorFinal === undefined && description) {
    const dl = description.toLowerCase();
    if (dl.includes("sans ascenseur")) elevatorFinal = false;
    else if (dl.includes("avec ascenseur") || dl.includes("ascenseur")) elevatorFinal = true;
  }

  // ── Type ──────────────────────────────────────────────────────────────────
  const typeRaw = String(c.type ?? "").toLowerCase();
  let type: ComparedListing["type"] | undefined;
  if (typeRaw.includes("studio")) type = "studio";
  else if (typeRaw.includes("appartement")) type = "appartement";
  else if (typeRaw.includes("maison") || typeRaw.includes("villa")) type = "maison";

  // ── Location ─────────────────────────────────────────────────────────────
  const loc        = (c.location ?? {}) as Record<string, unknown>;
  const city       = String(loc.cityOnly ?? loc.city ?? "") || undefined;
  const postalCode = String(loc.postalCode ?? "") || undefined;
  const lat        = typeof loc.latitude  === "number" ? loc.latitude  : undefined;
  const lon        = typeof loc.longitude === "number" ? loc.longitude : undefined;
  const address    = String(loc.address ?? "") || undefined;

  // ── Photos ────────────────────────────────────────────────────────────────
  const imagesObj  = (c.images ?? {}) as Record<string, unknown>;
  const photosArr  = (Array.isArray(imagesObj.photos) ? imagesObj.photos : []) as Record<string, unknown>[];
  const photos = photosArr
    .map((p) => {
      const urlObj = (p.url ?? {}) as Record<string, unknown>;
      return String(urlObj.large ?? urlObj["extra-large"] ?? urlObj.medium ?? "");
    })
    .filter((u) => u.startsWith("http"));

  // ── Title ─────────────────────────────────────────────────────────────────
  const title = $("title").first().text().trim().split(":")[0].trim() || undefined;

  return {
    title,
    type,
    price,
    charges,
    surface,
    rooms,
    bedrooms,
    floor,
    furnished,
    deposit,
    dpe,
    ges,
    elevator: elevatorFinal,
    parking,
    cellar,
    balcony,
    terrace,
    description,
    address,
    city,
    postalCode,
    lat,
    lon,
    photos: photos.length > 0 ? photos : undefined,
  };
}

// ── SeLoger ────────────────────────────────────────────────────────────────

type JsonObj = Record<string, unknown>;

/**
 * Traverse an object/array tree using a mixed string/number path.
 * Returns undefined for any missing or non-traversable step.
 */
function at(obj: unknown, ...path: (string | number)[]): unknown {
  let cur = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur)
      ? (typeof key === "number" ? cur[key] : undefined)
      : (cur as JsonObj)[key as string];
  }
  return cur;
}

/**
 * SeLoger stores all listing data in a script tag with id
 * "__UFRN_LIFECYCLE_SERVERREQUEST__" as a JSON.parse("...") call.
 *
 * Root path: app_cldp.data.classified.sections
 *   hardFacts.facts[]         → rooms / bedrooms / surface / floor
 *   hardFacts.price.ariaLabel → prix (numeric string "1415 €")
 *   price.additional[]        → dépôt de garantie
 *   price.components[0]
 *     .units[0].details[0]
 *     .prices[]               → charges forfaitaires
 *   priceComparison.pricePerSqm → prix/m²
 *   energy.certificates[0]
 *     .scales[]               → DPE (name~DPE) / GES (name~GES)
 *   features.preview[]        → balcon/terrasse/meublé/ascenseur/parking/cave
 *                               (icon key + "Pas de …" = false)
 *   location.address          → city / zipCode
 *   location.geometry.coordinates → [lon, lat]
 *   gallery.images[].url      → photos
 *   mainDescription.description → description
 */
function extractSelogerHtml($: CheerioAPI): Partial<ComparedListing> {
  // ── Parse the embedded window variable ───────────────────────────────────
  const scriptText = $("#__UFRN_LIFECYCLE_SERVERREQUEST__").text();
  if (!scriptText) return {};

  // Pattern: JSON.parse("<escaped-json-string>")
  const argMatch = scriptText.match(/JSON\.parse\(("(?:[^"\\]|\\.)*")\)/s);
  if (!argMatch) return {};

  let classified: JsonObj;
  try {
    // First JSON.parse: unescape the string literal (handles \", \uXXXX, etc.)
    const innerJson = JSON.parse(argMatch[1]) as string;
    // Second JSON.parse: parse the actual data object
    const root = JSON.parse(innerJson) as JsonObj;
    classified = at(root, "app_cldp", "data", "classified") as JsonObj;
    if (!classified) return {};
  } catch {
    return {};
  }

  const sec = (classified.sections ?? {}) as JsonObj;

  // ── Prix ─────────────────────────────────────────────────────────────────
  // hardFacts.price.ariaLabel = "1415 €"
  const priceLabel = String(at(sec, "hardFacts", "price", "ariaLabel") ?? "");
  const price = extractNum(priceLabel);

  // ── hardFacts.facts[] — rooms / bedrooms / surface / floor ───────────────
  const facts = (at(sec, "hardFacts", "facts") as unknown[]) ?? [];
  let rooms: number | undefined;
  let bedrooms: number | undefined;
  let surface: number | undefined;
  let floor: string | undefined;

  for (const fact of facts as JsonObj[]) {
    const sv = String(fact.splitValue ?? "");
    const val = String(fact.value ?? "");
    switch (fact.type) {
      case "numberOfRooms":    rooms    = parseInt(sv); break;
      case "numberOfBedrooms": bedrooms = parseInt(sv); break;
      case "livingSpace":      surface  = parseFrNum(sv); break;
      case "numberOfFloors":   floor    = val; break;      // e.g. "Étage 3/3"
    }
  }

  // ── Prix/m² ──────────────────────────────────────────────────────────────
  // priceComparison.pricePerSqm = "18,25"  (informational — we return it for completeness)
  // (not a field in ComparedListing but could be computed from price/surface)

  // ── Charges ──────────────────────────────────────────────────────────────
  // price.components[0].units[0].details[0].prices[] where label.main ~ "Charges"
  let charges: number | undefined;
  const priceDetails = (at(sec, "price", "components", 0, "units", 0, "details", 0, "prices") as unknown[]) ?? [];
  for (const p of priceDetails as JsonObj[]) {
    const label = String(at(p, "label", "main") ?? "").toLowerCase();
    if (label.includes("charge")) {
      const aria = String(at(p, "value", "main", "ariaLabel") ?? "");
      charges = extractNum(aria);
      break;
    }
  }

  // ── Dépôt de garantie ────────────────────────────────────────────────────
  // price.additional[] where label ~ "garantie"
  let deposit: number | undefined;
  const priceAdditional = (at(sec, "price", "additional") as unknown[]) ?? [];
  for (const item of priceAdditional as JsonObj[]) {
    if (String(item.label ?? "").toLowerCase().includes("garantie")) {
      const v = parseFloat(String(item.text ?? "0").replace(",", "."));
      deposit = Number.isNaN(v) ? undefined : v;
      break;
    }
  }

  // ── DPE + GES ────────────────────────────────────────────────────────────
  // energy.certificates[0].scales[] — distinguish by scale name
  let dpe: ComparedListing["dpe"] | undefined;
  let ges: ComparedListing["ges"] | undefined;
  const certs = (at(sec, "energy", "certificates") as unknown[]) ?? [];
  for (const cert of certs as JsonObj[]) {
    for (const scale of (cert.scales as unknown[] ?? []) as JsonObj[]) {
      const name = String(scale.name ?? "").toLowerCase();
      const rating = String(at(scale, "efficiencyClass", "rating") ?? "").toUpperCase();
      if (name.includes("dpe") || name.includes("performance")) {
        dpe = toDpe(rating);
      } else if (name.includes("ges") || name.includes("serre")) {
        ges = toDpe(rating);
      }
    }
  }

  // ── features.preview[] — boolean amenities ───────────────────────────────
  // icon key → field; if value starts with "Pas de" or "Sans" → false, else → true
  let balcony:  boolean | undefined;
  let terrace:  boolean | undefined;
  let furnished: boolean | undefined;
  let elevator: boolean | undefined;
  let parking:  boolean | undefined;
  let cellar:   boolean | undefined;

  const preview = (at(sec, "features", "preview") as unknown[]) ?? [];
  for (const feat of preview as JsonObj[]) {
    const icon = String(feat.icon ?? "").toLowerCase();
    const val  = String(feat.value ?? "").toLowerCase();
    const absent = val.startsWith("pas de") || val.startsWith("sans");

    switch (icon) {
      case "balcony":   balcony   = !absent; break;
      case "terrace":   terrace   = !absent; break;
      case "furnished": furnished = !val.includes("non meublé"); break;
      case "elevator":      elevator  = !absent; break;
      case "parking":
      case "parking-lots":  parking   = !absent; break;  // Logic-Immo uses "parking-lots"
      case "cellar":        cellar    = !absent; break;
    }
  }

  // ── Location ─────────────────────────────────────────────────────────────
  const locSec = (sec.location ?? {}) as JsonObj;
  const addr   = (locSec.address ?? {}) as JsonObj;
  const city        = String(addr.city    ?? "") || undefined;
  const postalCode  = String(addr.zipCode ?? "") || undefined;
  const coords      = (at(locSec, "geometry", "coordinates") as number[] | undefined) ?? [];
  const lon = typeof coords[0] === "number" ? coords[0] : undefined;
  const lat = typeof coords[1] === "number" ? coords[1] : undefined;

  // ── Photos ───────────────────────────────────────────────────────────────
  const images = (at(sec, "gallery", "images") as unknown[]) ?? [];
  const photos = (images as JsonObj[])
    .map((img) => String(img.url ?? ""))
    .filter((u) => u.startsWith("http"));

  // ── Description ──────────────────────────────────────────────────────────
  const description =
    String(at(sec, "mainDescription", "description") ?? at(sec, "description", "description") ?? "").trim() || undefined;

  // ── Title ────────────────────────────────────────────────────────────────
  const title =
    String(at(sec, "hardFacts", "title") ?? at(sec, "mainDescription", "headline") ?? "").trim() || undefined;

  // ── Property type ────────────────────────────────────────────────────────
  let type: ComparedListing["type"] | undefined;
  const tl = (title ?? "").toLowerCase();
  if (tl.includes("studio")) type = "studio";
  else if (tl.includes("appartement") || tl.includes("duplex") || tl.includes("t1") || tl.includes("t2") || tl.includes("t3")) type = "appartement";
  else if (tl.includes("maison") || tl.includes("villa")) type = "maison";

  return {
    title,
    type,
    price,
    charges,
    surface,
    rooms,
    bedrooms,
    floor,
    furnished,
    deposit,
    dpe,
    ges,
    elevator,
    parking,
    cellar,
    balcony,
    terrace,
    description,
    city,
    postalCode,
    lat,
    lon,
    photos: photos.length > 0 ? photos : undefined,
  };
}

// ── Acheter-Louer ─────────────────────────────────────────────────────────

/**
 * Acheter-Louer is Vue.js SSR (data-v-* attributes throughout).
 * No embedded JSON blob — all data lives in the rendered HTML.
 *
 *  Prix          → div.ad-price
 *  Charges       → p.honoraires-charges span  (regex: "Charges : X €")
 *  Honoraires    → p.honoraires-charges text   (regex: "Honoraires … : X €")
 *  Pièces/Chambres/Surface + optional Étage/Meublé/Ascenseur/Parking/Cave/Balcon/Terrasse/Dépôt
 *                → table.ad-data tr pairs (label td / value td)
 *  DPE           → ul.dpe-consommations li.on span
 *  GES           → ul.dpe-emissions li.on span
 *  Description   → div after .ad-bar-cont-top  (fallback for boolean features + floor)
 *  Photos        → .gallery-top .swiper-slide:not(.swiper-slide-duplicate) img[src]
 */
function extractAcheterLouerHtml($: CheerioAPI): Partial<ComparedListing> {
  // ── Prix ─────────────────────────────────────────────────────────────────
  const price = extractNum($("div.ad-price").first().text());

  // ── Charges + Honoraires ──────────────────────────────────────────────────
  let charges: number | undefined;
  let fees: number | undefined;
  const honorairesText = norm($("p.honoraires-charges").text());
  const chargesM = honorairesText.match(/Charges\s*:\s*([\d\s,.]+)\s*€/i);
  if (chargesM) charges = parseFrNum(chargesM[1].trim());
  const honorM = honorairesText.match(/Honoraires[^:]*:\s*([\d\s,.]+)\s*€/i);
  if (honorM) fees = parseFrNum(honorM[1].trim());

  // ── Address / City / PostalCode / Type ────────────────────────────────────
  // "59000 lille \n appartement  3 pièces"
  let city: string | undefined;
  let postalCode: string | undefined;
  let type: ComparedListing["type"] | undefined;
  const addrText = norm($("div.ad-address span.fl").first().text().trim());
  const addrLines = addrText.split(/\n|  +/).map((s) => s.trim()).filter(Boolean);
  if (addrLines[0]) {
    const m = addrLines[0].match(/^(\d{5})\s+(.+)$/);
    if (m) { postalCode = m[1]; city = m[2].trim(); }
  }
  if (addrLines[1]) {
    const tl = addrLines[1].toLowerCase();
    if (tl.includes("studio")) type = "studio";
    else if (tl.includes("appartement")) type = "appartement";
    else if (tl.includes("maison") || tl.includes("villa")) type = "maison";
  }

  // ── Criteria table ───────────────────────────────────────────────────────
  let rooms: number | undefined;
  let bedrooms: number | undefined;
  let surface: number | undefined;
  let floor: string | undefined;
  let furnished: boolean | undefined;
  let elevator: boolean | undefined;
  let parking: boolean | undefined;
  let cellar: boolean | undefined;
  let balcony: boolean | undefined;
  let terrace: boolean | undefined;
  let deposit: number | undefined;

  $("table.ad-data tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;
    const label = norm(cells.eq(0).text()).replace(/:$/, "").trim().toLowerCase();
    const value = norm(cells.eq(1).text()).trim();
    const vl    = value.toLowerCase();
    const isOui = vl === "oui" || vl === "yes";
    const isNon = vl === "non" || vl === "no";

    if (label.includes("pièce") || label.includes("piece")) {
      rooms = parseInt(value);
    } else if (label.includes("chambre")) {
      bedrooms = parseInt(value);
    } else if (label.includes("surface")) {
      const m = value.match(/(\d+(?:[,.]\d+)?)/);
      if (m) surface = parseFrNum(m[1]);
    } else if (label.includes("étage") || label === "etage") {
      floor = value;
    } else if (label.includes("ascenseur")) {
      if (isOui) elevator = true; else if (isNon) elevator = false;
    } else if (label.includes("meublé") || label.includes("meuble")) {
      if (isOui) furnished = true; else if (isNon) furnished = false;
    } else if (label.includes("parking") || label.includes("garage")) {
      if (isOui) parking = true; else if (isNon) parking = false;
    } else if (label.includes("cave")) {
      if (isOui) cellar = true; else if (isNon) cellar = false;
    } else if (label.includes("balcon")) {
      if (isOui) balcony = true; else if (isNon) balcony = false;
    } else if (label.includes("terrasse")) {
      if (isOui) terrace = true; else if (isNon) terrace = false;
    } else if (label.includes("dépôt") || label.includes("depot") || label.includes("garantie")) {
      const m = value.match(/(\d[\d\s,.]*)/);
      if (m) deposit = parseFrNum(m[1].trim());
    }
  });

  // ── DPE + GES ─────────────────────────────────────────────────────────────
  const dpe = toDpe($("ul.dpe-consommations li.on span").first().text().trim());
  const ges = toDpe($("ul.dpe-emissions li.on span").first().text().trim());

  // ── Description (fallback for boolean features + floor) ────────────────────
  // The free-text description sits in the div that immediately follows .ad-bar-cont-top
  const description =
    norm($(".ad-bar-cont-top").next("div").text().trim()) || undefined;

  if (description) {
    const dl = description.toLowerCase();
    if (floor === undefined) {
      const fm = dl.match(/\b(\d+)(?:er|ème|e)?\s+étage\b|rez[- ]de[- ]chaussée/i);
      if (fm) floor = fm[0].trim();
    }
    if (elevator === undefined) {
      if (dl.includes("sans ascenseur")) elevator = false;
      else if (dl.includes("ascenseur")) elevator = true;
    }
    if (parking === undefined && (dl.includes("parking") || dl.includes("garage"))) parking = true;
    if (cellar === undefined && dl.includes("cave")) cellar = true;
    if (balcony === undefined && dl.includes("balcon")) balcony = true;
    if (terrace === undefined && dl.includes("terrasse")) terrace = true;
    if (furnished === undefined) {
      if (dl.includes("non meublé")) furnished = false;
      else if (dl.includes("meublé")) furnished = true;
    }
  }

  // ── Photos ────────────────────────────────────────────────────────────────
  const photos: string[] = [];
  $(".gallery-top .swiper-slide:not(.swiper-slide-duplicate) img").each((_, el) => {
    const src = $(el).attr("src");
    if (src?.startsWith("http") && !photos.includes(src)) photos.push(src);
  });

  // ── Title ─────────────────────────────────────────────────────────────────
  const title = $("title").first().text().trim() || undefined;

  return {
    title,
    type,
    price,
    charges,
    fees,
    surface,
    rooms,
    bedrooms,
    floor,
    furnished,
    deposit,
    dpe,
    ges,
    elevator,
    parking,
    cellar,
    balcony,
    terrace,
    description,
    city,
    postalCode,
    photos: photos.length > 0 ? photos : undefined,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * HTML/Cheerio-based extraction — fallback layer for sites that don't expose
 * structured data via __NEXT_DATA__ or window variables.
 * Also handles sites that use JSON.parse() window variables (SeLoger).
 */
export function extractFromHtml(html: string, hostname: string): Partial<ComparedListing> {
  const $ = cheerio.load(html);

  if (hostname.includes("bienici"))   return extractBieniciHtml($);
  if (hostname.includes("seloger") || hostname.includes("logic-immo")) return extractSelogerHtml($);
  if (hostname.includes("lefigaro") || hostname.includes("figaro"))    return extractFigaroHtml($);
  if (hostname.includes("acheter-louer")) return extractAcheterLouerHtml($);
  return {};
}
