import "dotenv/config";
import { createServer } from "node:http";
import { buildBootstrappedEvent } from "./kafka/events.js";
import { isKafkaEnabled, publishListingEvent } from "./kafka/producer.js";
import { writeListingsSnapshot } from "./spark/similarIndex.js";
import { connectMongo } from "./db.js";
import { createApp } from "./app.js";
import { initSocket } from "./socket.js";
import {
  createListingsRepository,
  isMongoListingsSource,
  setListingsRepository,
} from "./listings/repository.js";

const PORT = Number(process.env.PORT ?? 3001);

async function start() {
  await connectMongo();

  const repo = createListingsRepository();
  setListingsRepository(repo);

  const app = createApp();
  const server = createServer(app);
  initSocket(server);

  const listings = await repo.getAll();
  writeListingsSnapshot(listings);

  server.listen(PORT, async () => {
    console.log(
      `homepedia-api http://localhost:${PORT} (listings=${isMongoListingsSource() ? "mongo" : "mock"})`,
    );
    if (isKafkaEnabled()) {
      await publishListingEvent(buildBootstrappedEvent(listings.length));
    }
  });
}

start().catch((err) => {
  console.error("Échec du démarrage de l'API:", err);
  process.exit(1);
});
