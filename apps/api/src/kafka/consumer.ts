import "dotenv/config";
import { Kafka } from "kafkajs";
import { getKafkaConfig } from "./config.js";
import { isSparkAutoRunEnabled, runSimilarSparkJob } from "../spark/runJob.js";

const cfg = getKafkaConfig();

if (!cfg.enabled) {
  console.log("[kafka-consumer] KAFKA_ENABLED=0 — rien à écouter.");
  process.exit(0);
}

const kafka = new Kafka({
  clientId: `${cfg.clientId}-consumer`,
  brokers: cfg.brokers,
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_CONSUMER_GROUP ?? "homepedia-listings-consumer",
});

const fromBeginning = process.env.KAFKA_FROM_BEGINNING === "1";
let sparkJobRunning = false;

async function maybeRunSpark(event?: string) {
  if (!isSparkAutoRunEnabled()) return;
  if (event !== "listings.bootstrapped" && event !== "listing.created") return;
  if (sparkJobRunning) return;

  sparkJobRunning = true;
  try {
    await runSimilarSparkJob();
  } catch (err) {
    console.warn("[kafka-consumer] spark job failed:", err instanceof Error ? err.message : err);
  } finally {
    sparkJobRunning = false;
  }
}

async function run() {
  await consumer.connect();
  await consumer.subscribe({
    topic: cfg.topicListings,
    fromBeginning,
  });

  console.log(
    `[kafka-consumer] listening ${cfg.topicListings} on ${cfg.brokers.join(", ")} (fromBeginning=${fromBeginning})`,
  );

  await consumer.run({
    eachMessage: async ({ partition, message }) => {
      const raw = message.value?.toString("utf-8") ?? "";
      try {
        const payload = JSON.parse(raw) as { event?: string };
        console.log(
          `[kafka-consumer] p${partition} offset=${message.offset} event=${payload.event ?? "?"}`,
        );
        console.log(raw);
        await maybeRunSpark(payload.event);
      } catch {
        console.log(`[kafka-consumer] p${partition} offset=${message.offset} (raw)`, raw);
      }
    },
  });
}

run().catch((err) => {
  console.error("[kafka-consumer] fatal:", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await consumer.disconnect();
  process.exit(0);
});
