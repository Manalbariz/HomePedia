import { Kafka, type Producer } from "kafkajs";
import { getKafkaConfig } from "./config.js";
import type { ListingEvent } from "./events.js";

let producer: Producer | null = null;
let connectPromise: Promise<Producer | null> | null = null;

async function connectProducer(): Promise<Producer | null> {
  const cfg = getKafkaConfig();
  if (!cfg.enabled) return null;

  if (producer) return producer;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const kafka = new Kafka({
      clientId: cfg.clientId,
      brokers: cfg.brokers,
      retry: { retries: 3 },
    });

    const next = kafka.producer();
    try {
      await next.connect();
      producer = next;
      console.log(`[kafka] producer connected (${cfg.brokers.join(", ")})`);
      return next;
    } catch (err) {
      console.warn("[kafka] producer unavailable:", err instanceof Error ? err.message : err);
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

export async function publishListingEvent(event: ListingEvent): Promise<boolean> {
  const cfg = getKafkaConfig();
  if (!cfg.enabled) return false;

  const p = await connectProducer();
  if (!p) return false;

  try {
    await p.send({
      topic: cfg.topicListings,
      messages: [{ key: event.event, value: JSON.stringify(event) }],
    });
    console.log(`[kafka] published ${event.event}`);
    return true;
  } catch (err) {
    console.warn("[kafka] publish failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function disconnectProducer(): Promise<void> {
  if (!producer) return;
  await producer.disconnect();
  producer = null;
}

export function isKafkaEnabled(): boolean {
  return getKafkaConfig().enabled;
}
