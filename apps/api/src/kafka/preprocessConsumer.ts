import "dotenv/config";
import { Kafka } from "kafkajs";
import { connectMongo } from "../db.js";
import { buildCreatedEvent } from "./events.js";
import { getKafkaConfig } from "./config.js";
import { publishListingEvent } from "./producer.js";
import type { ListingRawEvent } from "./rawEvents.js";
import { createListingsRepository } from "../listings/repository.js";
import { toListingRecord } from "../preprocess/toListingRecord.js";
import { writeListingsSnapshot } from "../spark/similarIndex.js";

const cfg = getKafkaConfig();

if (!cfg.enabled) {
  console.log("[kafka-preprocess] KAFKA_ENABLED=0 — rien à écouter.");
  process.exit(0);
}

const kafka = new Kafka({
  clientId: `${cfg.clientId}-preprocess`,
  brokers: cfg.brokers,
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_PREPROCESS_GROUP ?? "homepedia-preprocess-consumer",
});

const fromBeginning = process.env.KAFKA_FROM_BEGINNING === "1";

async function handleRawEvent(event: ListingRawEvent): Promise<void> {
  const repo = createListingsRepository();
  const listing = toListingRecord(event.payload);
  await repo.upsert(listing);
  await publishListingEvent(buildCreatedEvent(listing));
  console.log(`[kafka-preprocess] normalized ${listing.id} (${listing.source})`);

  const all = await repo.getAll();
  writeListingsSnapshot(all);
}

async function run() {
  await connectMongo();
  await consumer.connect();
  await consumer.subscribe({ topic: cfg.topicRaw, fromBeginning });

  console.log(
    `[kafka-preprocess] listening ${cfg.topicRaw} on ${cfg.brokers.join(", ")}`,
  );

  await consumer.run({
    eachMessage: async ({ partition, message }) => {
      const raw = message.value?.toString("utf-8") ?? "";
      try {
        const event = JSON.parse(raw) as ListingRawEvent;
        if (event.event !== "listing.raw") {
          console.warn(`[kafka-preprocess] ignored event=${event.event}`);
          return;
        }
        await handleRawEvent(event);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[kafka-preprocess] p${partition} offset=${message.offset} failed: ${msg}`);
      }
    },
  });
}

run().catch((err) => {
  console.error("[kafka-preprocess] fatal:", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await consumer.disconnect();
  process.exit(0);
});
