import "dotenv/config";
import { readFileSync } from "node:fs";
import { fetchSearchPageHtml } from "../scrapers/index.js";
import {
  discoverListingUrlsFromHtml,
  maxUrlsPerSearchPage,
} from "../scrapers/discoverUrls.js";
import { buildCrawlUrlEvent } from "./crawlEvents.js";
import { getKafkaConfig } from "./config.js";
import { publishCrawlUrlEvent } from "./producer.js";

const searchFile = process.argv[2];
const delayMs = Number(process.env.CRAWL_DELAY_MS ?? "4000");

if (!searchFile) {
  console.error("Usage: npm run kafka:crawl -- <fichier-search-urls.txt>");
  process.exit(1);
}

const cfg = getKafkaConfig();
if (!cfg.enabled) {
  console.error("KAFKA_ENABLED=1 requis");
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const searchUrls = readFileSync(searchFile, "utf-8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

console.log(`[kafka-crawl] ${searchUrls.length} page(s) de recherche`);

let urlsPublished = 0;

for (const searchUrl of searchUrls) {
  try {
    console.log(`[kafka-crawl] fetch ${searchUrl}`);
    const { html, pageUrl } = await fetchSearchPageHtml(searchUrl);
    const listingUrls = discoverListingUrlsFromHtml(html, pageUrl).slice(
      0,
      maxUrlsPerSearchPage(),
    );
    console.log(
      `[kafka-crawl] ${listingUrls.length} URL(s) trouvée(s) (html=${html.length} chars)`,
    );
    if (listingUrls.length === 0) {
      console.warn(
        `[kafka-crawl] aucun lien — page bloquée, CAPTCHA, ou sélecteurs à mettre à jour`,
      );
    }

    for (const listingUrl of listingUrls) {
      const ok = await publishCrawlUrlEvent(buildCrawlUrlEvent(pageUrl, listingUrl));
      if (ok) urlsPublished++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[kafka-crawl] ✗ ${searchUrl}: ${msg}`);
  }
  await sleep(delayMs);
}

console.log(`[kafka-crawl] done: ${urlsPublished} URL(s) publiée(s) sur ${cfg.topicCrawl}`);
