import "dotenv/config";
import { readFileSync } from "node:fs";
import { scrapeUrl } from "../scrapers/index.js";
import { buildRawListingEvent } from "./rawEvents.js";
import { getKafkaConfig } from "./config.js";
import { publishRawListingEvent } from "./producer.js";

const urlsFile = process.argv[2];
const concurrency = Math.min(
  Math.max(1, Number(process.env.INGEST_CONCURRENCY ?? "2")),
  5,
);
const delayMs = Number(process.env.INGEST_DELAY_MS ?? "3000");

if (!urlsFile) {
  console.error("Usage: npm run kafka:ingest -- <fichier-urls.txt>");
  process.exit(1);
}

const cfg = getKafkaConfig();
if (!cfg.enabled) {
  console.error("KAFKA_ENABLED=1 requis");
  process.exit(1);
}

const urls = readFileSync(urlsFile, "utf-8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

console.log(
  `[kafka-ingest] ${urls.length} URL(s), concurrency=${concurrency}, delay=${delayMs}ms`,
);

let ok = 0;
let fail = 0;
let index = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function worker(): Promise<void> {
  while (index < urls.length) {
    const i = index++;
    const url = urls[i]!;
    try {
      const compared = await scrapeUrl(url);
      const published = await publishRawListingEvent(buildRawListingEvent(compared, "batch"));
      if (published) {
        ok++;
        console.log(`[kafka-ingest] ✓ [${i + 1}/${urls.length}] ${url}`);
      } else {
        fail++;
      }
    } catch (err) {
      fail++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[kafka-ingest] ✗ [${i + 1}/${urls.length}] ${url}: ${msg}`);
    }
    await sleep(delayMs);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

console.log(`[kafka-ingest] done: ${ok} ok, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
