import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ListingRecord } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, "../../data");
export const SNAPSHOT_PATH = join(DATA_DIR, "listings.snapshot.json");
export const DEFAULT_INDEX_PATH = join(DATA_DIR, "similar-index.json");

export function writeListingsSnapshot(listings: ListingRecord[]): void {
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(listings, null, 2), "utf-8");
}

export interface SimilarIndex {
  generatedAt: string;
  listingCount?: number;
  similar: Record<string, string[]>;
}

export function getSimilarIndexPath(): string {
  return process.env.SPARK_SIMILAR_INDEX_PATH ?? DEFAULT_INDEX_PATH;
}

export function isSparkSimilarEnabled(): boolean {
  const flag = (process.env.SPARK_SIMILAR_ENABLED ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function loadSimilarIndex(): SimilarIndex | null {
  const path = getSimilarIndexPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as SimilarIndex;
  } catch {
    return null;
  }
}

export function resolveSimilarFromIndex(
  baseId: string,
  all: ListingRecord[],
  index: SimilarIndex,
): ListingRecord[] {
  const ids = index.similar[baseId] ?? [];
  const byId = new Map(all.map((l) => [l.id, l]));
  return ids.map((id) => byId.get(id)).filter((l): l is ListingRecord => Boolean(l));
}
