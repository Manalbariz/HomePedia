/** Échappe les métacaractères regex pour éviter ReDoS / injection dans $regex MongoDB. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getCorsOrigins(): string[] | boolean {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw || raw === "*") return true;
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

/** Scraping Playwright : désactivé en prod sauf si SCRAPE_ENABLED=1. */
export function isScrapeEnabled(): boolean {
  if (process.env.SCRAPE_ENABLED === "1") return true;
  return process.env.NODE_ENV !== "production";
}
