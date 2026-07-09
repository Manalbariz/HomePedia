export interface KafkaConfig {
  enabled: boolean;
  brokers: string[];
  topicListings: string;
  topicRaw: string;
  topicCrawl: string;
  clientId: string;
}

export function getKafkaConfig(): KafkaConfig {
  const flag = (process.env.KAFKA_ENABLED ?? "").trim().toLowerCase();
  const enabled = flag === "1" || flag === "true" || flag === "yes";

  return {
    enabled,
    brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092")
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean),
    topicListings: process.env.KAFKA_TOPIC_LISTINGS ?? "homepedia.listing.events",
    topicRaw: process.env.KAFKA_TOPIC_RAW ?? "homepedia.listing.raw",
    topicCrawl: process.env.KAFKA_TOPIC_CRAWL ?? "homepedia.listing.crawl",
    clientId: process.env.KAFKA_CLIENT_ID ?? "homepedia-api",
  };
}
