import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ComparedListing } from "../scrapers/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CENTROIDS_PATH = join(__dirname, "../../data/city-centroids.json");

export interface CityCentroid {
  lat: number;
  lon: number;
  label: string;
}

let centroidsCache: Record<string, CityCentroid> | null = null;

function loadCentroids(): Record<string, CityCentroid> {
  if (centroidsCache) return centroidsCache;
  centroidsCache = JSON.parse(readFileSync(CENTROIDS_PATH, "utf-8")) as Record<
    string,
    CityCentroid
  >;
  return centroidsCache;
}

function normalizeCityKey(city: string): string {
  return city
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Extrait le code département depuis un code INSEE commune (5 chiffres). */
export function deptFromInsee(insee: string): string {
  if (/^97[1-8]\d{2}$/.test(insee)) return insee.slice(0, 3);
  if (/^98[47]\d{2}$/.test(insee)) return insee.slice(0, 3);
  if (insee.startsWith("20")) return "20";
  return insee.slice(0, 2);
}

/** Coordonnées approximatives déterministes pour tout code INSEE (fallback). */
export function inseeToApproxCoords(insee: string): CityCentroid {
  const dept = deptFromInsee(insee);
  const centroids = loadCentroids();
  const deptKey = `dept-${dept}`;
  const base = centroids[deptKey];

  if (base) {
    const { lat, lon } = jitterCoords(base.lat, base.lon, insee);
    return { lat, lon, label: insee };
  }

  let h = 0;
  for (const c of insee) h = (h * 31 + c.charCodeAt(0)) | 0;
  const lat = 42.2 + (Math.abs(h) % 850) / 100;
  const lon = -4.8 + (Math.abs(h >> 8) % 1000) / 100;
  const jittered = jitterCoords(lat, lon, insee);
  return { ...jittered, label: insee };
}

/** Résout lat/lon depuis ville, code postal ou code INSEE commune. */
export function geocodeCity(
  city?: string,
  postalCode?: string,
  inseeCode?: string,
): CityCentroid | null {
  const centroids = loadCentroids();
  if (city) {
    const key = normalizeCityKey(city);
    if (centroids[key]) return centroids[key];
    for (const [k, v] of Object.entries(centroids)) {
      if (k.startsWith("dept-")) continue;
      if (key.includes(k) || k.includes(key)) return v;
    }
  }

  const insee =
    inseeCode ?? (postalCode && /^\d{5}$/.test(postalCode) ? postalCode : undefined);
  if (insee) return inseeToApproxCoords(insee);

  if (postalCode && postalCode.length >= 2) {
    const dept = postalCode.slice(0, 2);
    const deptKey = `dept-${dept}`;
    if (centroids[deptKey]) return centroids[deptKey];
  }
  return null;
}

/** Applique un léger jitter pour éviter les pins superposés (±~500 m). */
export function jitterCoords(lat: number, lon: number, seed: string): { lat: number; lon: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const dx = ((h % 1000) - 500) / 50_000;
  const dy = (((h >> 10) % 1000) - 500) / 50_000;
  return { lat: lat + dx, lon: lon + dy };
}

export function applyGeocodeFallback(raw: ComparedListing): ComparedListing {
  if (raw.lat !== undefined && raw.lon !== undefined) return raw;
  const insee =
    raw.postalCode && /^\d{5}$/.test(raw.postalCode) ? raw.postalCode : undefined;
  const centroid = geocodeCity(raw.city, raw.postalCode, insee);
  if (!centroid) return raw;
  const { lat, lon } = jitterCoords(centroid.lat, centroid.lon, raw.url);
  return { ...raw, lat, lon };
}
