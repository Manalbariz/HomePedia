import type { BrowserContext, Page } from "playwright";
import { getBrowser } from "./browser.js";
import { extractJsonLd } from "./jsonld.js";
import { extractNextDataObject } from "./nextdata.js";
import { mergeListing } from "./normalize.js";
import { extractOg } from "./og.js";
import { extractFromWindowVars } from "./pagescripts.js";
import type { ComparedListing } from "./types.js";

export class ScrapeError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Per-site config ────────────────────────────────────────────────────────

interface SiteConfig {
  /** Don't block images/fonts — DataDome detects absence of resource requests */
  blockResources: boolean;
  /** Navigate here first to get a valid session cookie before hitting the listing */
  warmupUrl?: string;
  /** Extra ms to wait [min, max] after page load (randomised) */
  extraWait: [number, number];
}

function getSiteConfig(hostname: string): SiteConfig {
  if (hostname.includes("leboncoin")) {
    return {
      blockResources: false,     // DataDome checks resource loading patterns
      warmupUrl: "https://www.leboncoin.fr",  // get datadome cookie first
      extraWait: [3_000, 5_000],
    };
  }
  if (hostname.includes("seloger")) {
    return {
      blockResources: false,
      warmupUrl: "https://www.seloger.com",
      extraWait: [2_000, 3_500],
    };
  }
  if (hostname.includes("bienici")) {
    return {
      blockResources: false,
      warmupUrl: undefined,
      extraWait: [1_500, 2_500],
    };
  }
  return {
    blockResources: true,
    warmupUrl: undefined,
    extraWait: [1_000, 2_000],
  };
}

function randomDelay(min: number, max: number): Promise<void> {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}

/** Simulate minimal human interaction: small scroll + random mouse move */
async function humanize(page: Page): Promise<void> {
  await page.mouse.move(300 + Math.random() * 400, 200 + Math.random() * 300, {
    steps: 8,
  });
  await page.evaluate(() =>
    window.scrollBy({ top: 150 + Math.random() * 200, behavior: "smooth" })
  );
  await randomDelay(400, 900);
}

// ── Core page fetcher ──────────────────────────────────────────────────────

export interface PageDump {
  url: string;
  hasNextData: boolean;
  nextDataKeys: string[];
  pagePropsKeys: string[];
  windowVarNames: string[];
  ogTags: Record<string, string>;
  jsonLdTypes: string[];
}

async function fetchPage(
  urlStr: string,
  config: SiteConfig
): Promise<{
  html: string;
  nextData: Record<string, unknown> | null;
  inlineScripts: string[];
}> {
  const browser = await getBrowser();
  let ctx: BrowserContext | null = null;

  try {
    ctx = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
      viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: {
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });

    const page = await ctx.newPage();

    // Only block resources for sites without bot protection — blocking images
    // is a strong automation signal for DataDome and similar services.
    if (config.blockResources) {
      await page.route("**/*.{png,jpg,jpeg,gif,webp,svg,mp4,woff,woff2,ttf,otf}", (r) =>
        r.abort()
      );
    }

    // ── Warm-up: visit homepage first to acquire session cookies ──────────
    if (config.warmupUrl) {
      await page
        .goto(config.warmupUrl, { waitUntil: "domcontentloaded", timeout: 20_000 })
        .catch(() => null);
      await randomDelay(1_500, 3_000);
      await humanize(page);
    }

    // ── Navigate to the actual listing ─────────────────────────────────────
    const response = await page.goto(urlStr, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    if (response && !response.ok()) {
      const status = response.status();
      if (status === 403 || status === 429) {
        throw new ScrapeError(
          `Le site a bloqué la requête (${status}). ` +
            "Attendez quelques minutes avant de réessayer, ou essayez depuis un autre réseau.",
          status
        );
      }
      throw new ScrapeError(
        `Le site a répondu ${status} — page inexistante ou accès refusé`,
        status
      );
    }

    // Wait for Next.js hydration (gives up gracefully)
    await page
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .waitForFunction(() => typeof (window as any).__NEXT_DATA__ !== "undefined", {
        timeout: 6_000,
      })
      .catch(() => null);

    // Random extra wait for client-side data fetching
    await randomDelay(...config.extraWait);

    // Simulate human scroll after wait
    await humanize(page);

    // ── Extract all data in a single evaluate ──────────────────────────────
    const { nextData, inlineScripts } = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nd = (window as any).__NEXT_DATA__ as Record<string, unknown> | undefined;
      const scripts = Array.from(document.querySelectorAll("script:not([src])"))
        .map((s) => s.textContent ?? "")
        .filter((t) => t.length > 50);
      return { nextData: nd ?? null, inlineScripts: scripts };
    });

    const html = await page.content();
    return { html, nextData, inlineScripts };
  } finally {
    await ctx?.close();
  }
}

// ── Debug endpoint helper ──────────────────────────────────────────────────

export async function debugPage(rawUrl: string): Promise<PageDump> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ScrapeError("URL invalide");
  }

  const config = getSiteConfig(url.hostname);
  const { html, nextData, inlineScripts } = await fetchPage(url.toString(), config);

  const { load } = await import("cheerio");
  const $ = load(html);

  const ogTags: Record<string, string> = {};
  $("meta[property^='og:'], meta[name^='og:']").each((_, el) => {
    const key = $(el).attr("property") ?? $(el).attr("name") ?? "";
    const val = $(el).attr("content") ?? "";
    if (key && val) ogTags[key] = val;
  });

  const jsonLdTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text()) as Record<string, unknown>;
      const type = parsed["@type"];
      if (typeof type === "string") jsonLdTypes.push(type);
    } catch {
      // ignore
    }
  });

  const pageProps = nextData
    ? ((nextData.props as Record<string, unknown> | undefined)
        ?.pageProps as Record<string, unknown> | undefined)
    : undefined;

  const windowVarNames: string[] = [];
  for (const script of inlineScripts) {
    const matches = script.matchAll(/window\.__?(\w+?)__?\s*=/g);
    for (const m of matches) windowVarNames.push(m[1]);
  }

  return {
    url: url.toString(),
    hasNextData: nextData !== null,
    nextDataKeys: nextData ? Object.keys(nextData) : [],
    pagePropsKeys: pageProps ? Object.keys(pageProps) : [],
    windowVarNames: [...new Set(windowVarNames)],
    ogTags,
    jsonLdTypes,
  };
}

// ── Main scrape ────────────────────────────────────────────────────────────

export async function scrapeUrl(rawUrl: string): Promise<ComparedListing> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ScrapeError("URL invalide");
  }

  const hostname = url.hostname;
  const config = getSiteConfig(hostname);
  const { html, nextData, inlineScripts } = await fetchPage(url.toString(), config);

  // Layer 1: window.__NEXT_DATA__
  const fromNext = nextData ? extractNextDataObject(nextData, hostname) : {};
  // Layer 2: other window.* inline script vars
  const fromWindowVars = extractFromWindowVars(inlineScripts, hostname);
  // Layer 3: JSON-LD schema.org
  const fromLd = extractJsonLd(html);
  // Layer 4: OpenGraph + French title parsing
  const fromOg = extractOg(html);

  const merged = mergeListing(
    mergeListing(mergeListing(fromNext, fromWindowVars), fromLd),
    fromOg
  ) as ComparedListing;

  if (!merged.price && !merged.surface && !merged.title) {
    throw new ScrapeError(
      "Aucune donnée extraite — le site est peut-être protégé contre le scraping"
    );
  }

  return {
    ...merged,
    url: url.toString(),
    source: hostname.replace(/^www\./, ""),
    scrapedAt: new Date().toISOString(),
  };
}
