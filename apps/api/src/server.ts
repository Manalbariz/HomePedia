import "dotenv/config";
import { createServer } from "node:http";
import { buildBootstrappedEvent } from "./kafka/events.js";
import { isKafkaEnabled, publishListingEvent } from "./kafka/producer.js";
import { writeListingsSnapshot } from "./spark/similarIndex.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ListingRecord } from "./types.js";
import { connectMongo } from "./db.js";
import { createApp } from "./app.js";
import { initSocket } from "./socket.js";

const PORT = Number(process.env.PORT ?? 3001);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "../data/listings.json");

const app = createApp();
const server = createServer(app);
initSocket(server);

async function start() {
  await connectMongo();
  const listings = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as ListingRecord[];
  writeListingsSnapshot(listings);
  server.listen(PORT, async () => {
    console.log(`homepedia-api http://localhost:${PORT}`);
    if (isKafkaEnabled()) {
      await publishListingEvent(buildBootstrappedEvent(listings.length));
    }
  });
}

start().catch((err) => {
  console.error("Échec du démarrage de l'API:", err);
  process.exit(1);
});
