import * as cheerio from "cheerio";

const LISTING_PATH_PATTERNS: Record<string, RegExp[]> = {
  seloger: [
    /\/annonces\/[^/]+\/[^/]+\/\d+\.htm/i,
    /\/locations\/[^/]+\/\d+\.htm/i,
    /\/annonces\/locations\//i,
    /\/annonces\/achat\//i,
    /\/annonces\/[^/]+\/[^/]+\/\d+/i,
  ],
  leboncoin: [/\/ad\/locations\/\d+/i, /\/vi\/\d+/i, /\/ad\/\d+/i],
  bienici: [/\/annonce\/location\/[^/]+/i, /\/annonce\/achat\/[^/]+/i, /\/annonce\/[^/]+\/\d+/i],
};

function hostnameToSource(hostname: string): keyof typeof LISTING_PATH_PATTERNS | null {
  if (hostname.includes("seloger")) return "seloger";
  if (hostname.includes("leboncoin")) return "leboncoin";
  if (hostname.includes("bienici")) return "bienici";
  return null;
}

function isListingPath(pathname: string, source: keyof typeof LISTING_PATH_PATTERNS): boolean {
  return LISTING_PATH_PATTERNS[source].some((re) => re.test(pathname));
}

/**
 * Extrait les URLs d'annonces depuis le HTML d'une page de résultats de recherche.
 */
export function discoverListingUrlsFromHtml(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const source = hostnameToSource(base.hostname);
  if (!source) return [];

  const $ = cheerio.load(html);
  const found = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    try {
      const absolute = new URL(href, base).toString();
      const u = new URL(absolute);
      if (u.hostname !== base.hostname && !u.hostname.endsWith(base.hostname.replace(/^www\./, ""))) {
        return;
      }
      if (isListingPath(u.pathname, source)) {
        found.add(u.origin + u.pathname + (u.search || ""));
      }
    } catch {
      /* ignore invalid URLs */
    }
  });

  return [...found];
}

export function maxUrlsPerSearchPage(): number {
  const n = Number(process.env.CRAWL_MAX_URLS_PER_PAGE ?? "40");
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 40;
}
