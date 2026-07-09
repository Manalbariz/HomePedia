import "dotenv/config";
import { Kafka } from "kafkajs";
import { scrapeUrl } from "../scrapers/index.js";
import { buildRawListingEvent } from "./rawEvents.js";
import type { ListingCrawlEvent } from "./crawlEvents.js";
import { getKafkaConfig } from "./config.js";
import { publishRawListingEvent } from "./producer.js";

const cfg = getKafkaConfig();

if (!cfg.enabled) {
  console.log("[kafka-ingest-worker] KAFKA_ENABLED=0 — rien à écouter.");
  process.exit(0);
}

const delayMs = Number(process.env.INGEST_DELAY_MS ?? "5000");
const kafka = new Kafka({
  clientId: `${cfg.clientId}-ingest-worker`,
  brokers: cfg.brokers,
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_INGEST_GROUP ?? "homepedia-ingest-worker",
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  await consumer.connect();
  await consumer.subscribe({
    topic: cfg.topicCrawl,
    fromBeginning: process.env.KAFKA_FROM_BEGINNING === "1",
  });

  console.log(
    `[kafka-ingest-worker] listening ${cfg.topicCrawl} (delay=${delayMs}ms)`,
  );

  await consumer.run({
    eachMessage: async ({ partition, message }) => {
      const raw = message.value?.toString("utf-8") ?? "";
      try {
        const event = JSON.parse(raw) as ListingCrawlEvent;
        if (event.event !== "listing.url") return;

        console.log(`[kafka-ingest-worker] scrape ${event.listingUrl}`);
        const compared = await scrapeUrl(event.listingUrl);
        await publishRawListingEvent(buildRawListingEvent(compared, "batch"));
        console.log(`[kafka-ingest-worker] ✓ raw published`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[kafka-ingest-worker] p${partition} failed: ${msg}`);
      }
      await sleep(delayMs);
    },
  });
}

run().catch((err) => {
  console.error("[kafka-ingest-worker] fatal:", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await consumer.disconnect();
  process.exit(0);
});
